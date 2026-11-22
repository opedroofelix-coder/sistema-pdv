// Cascata de catalogo + roteamento por prefixo GTIN. Compartilhado entre
// catalog-lookup (sob demanda, chamado pelo cliente no recebimento) e
// catalog-enrichment-job (retry diario dos itens 'pending'). Roda em Deno
// (Edge Function) -- nao importa nada do app Vite (runtimes diferentes);
// normalizeBarcode/guessOriginFromEan sao a mesma logica pura que existia
// em src/lib/upc.ts no cliente antes desta migracao pro backend, mantida
// aqui como a unica copia agora que a cascata inteira roda no servidor.

export type ProductOrigin = 'nacional' | 'importado'
export type CatalogSource = 'cosmos' | 'upcitemdb' | 'openbeautyfacts' | 'off'

export interface LookupResult {
  name: string
  brand: string | null
  photo_url: string | null
  ncm: string | null
  cest: string | null
  /** Só a Cosmos preenche isso hoje (campo `avg_price`/`min_price`/
   * `max_price` da API dela, nem sempre populado) -- via automática do
   * Mercado Livre foi encerrada (CLAUDE.md decisão #22/#23: busca de
   * produtos bloqueada por política do ML mesmo autenticado). */
  refPrice?: { min: number; avg: number; max: number } | null
}

/** null = fonte não tinha o produto (resposta limpa); string = falha de infra
 * (quota/auth/timeout/rede) — a cascata trata os dois igual (tenta a próxima
 * fonte), mas só o erro de infra é logado/reportado como problema. */
interface SourceResult {
  data: LookupResult | null
  error: string | null
}

const FETCH_TIMEOUT_MS = 4000
const BRAZIL_GS1_PREFIXES = ['789', '790']

export function normalizeBarcode(code: string): string {
  const trimmed = code.trim()
  if (/^\d{12}$/.test(trimmed)) return `0${trimmed}`
  return trimmed
}

export function guessOriginFromEan(ean: string): ProductOrigin {
  const prefix = ean.slice(0, 3)
  return BRAZIL_GS1_PREFIXES.includes(prefix) ? 'nacional' : 'importado'
}

function describeFetchError(sourceName: string, err: unknown): string {
  const isTimeout = err instanceof DOMException && err.name === 'TimeoutError'
  const message = isTimeout ? 'timeout' : err instanceof Error ? err.message : 'falha de rede'
  return `${sourceName}: ${message}`
}

export async function fetchFromCosmos(ean: string, apiKey: string | undefined): Promise<SourceResult> {
  if (!apiKey) return { data: null, error: null }

  try {
    const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${ean}.json`, {
      headers: { 'X-Cosmos-Token': apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (res.status === 401 || res.status === 403) {
      return { data: null, error: `cosmos: HTTP ${res.status} (token ausente/inválido)` }
    }
    if (res.status === 429) {
      return { data: null, error: 'cosmos: HTTP 429 (cota diária excedida)' }
    }
    // 404 é o "não encontrado" da própria Cosmos (confirmado contra a API
    // real: gtin fora da base responde 404 com corpo {"message":"O recurso
    // solicitado não existe"}), não uma falha de infra -- tratar como erro
    // aqui faria a cascata mandar pra 'pending'/retry/Sentry todo produto
    // que a Cosmos simplesmente não tem, que é o caso comum, não a exceção.
    if (res.status === 404) {
      return { data: null, error: null }
    }
    if (!res.ok) {
      return { data: null, error: `cosmos: HTTP ${res.status}` }
    }

    const data = await res.json()
    if (!data?.description) return { data: null, error: null }

    // avg_price/min_price/max_price existem no schema da Cosmos, mas nem
    // todo produto tem o dado preenchido (frequentemente 0 ou null) -- só
    // vira referência quando a média é um valor real (> 0).
    const avgPrice = typeof data.avg_price === 'number' && data.avg_price > 0 ? data.avg_price : null
    const minPrice = typeof data.min_price === 'number' && data.min_price > 0 ? data.min_price : avgPrice
    const maxPrice = typeof data.max_price === 'number' && data.max_price > 0 ? data.max_price : avgPrice

    return {
      data: {
        name: data.description,
        brand: data.brand?.name ?? null,
        photo_url: data.thumbnail ?? data.thumbnails?.[0] ?? null,
        ncm: data.ncm?.code ?? null,
        cest: data.cest?.[0]?.code ?? null,
        refPrice: avgPrice !== null ? { min: minPrice ?? avgPrice, avg: avgPrice, max: maxPrice ?? avgPrice } : null,
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: describeFetchError('cosmos', err) }
  }
}

export async function fetchFromUpcItemDb(ean: string): Promise<SourceResult> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.status === 429) return { data: null, error: 'upcitemdb: HTTP 429 (cota diária excedida)' }
    // 400 é a resposta da UPCitemdb pra código que não passa na validação
    // dela (ex.: dígito verificador) -- não é uma falha de infra, e insistir
    // não vai resolver, então trata como "não encontrado" igual ao total: 0.
    if (res.status === 400) return { data: null, error: null }
    if (!res.ok) return { data: null, error: `upcitemdb: HTTP ${res.status}` }

    const data = await res.json()
    const item = data?.items?.[0]
    if (!item?.title) return { data: null, error: null }

    return {
      data: {
        name: item.title,
        brand: item.brand ?? null,
        photo_url: item.images?.[0] ?? null,
        ncm: null,
        cest: null,
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: describeFetchError('upcitemdb', err) }
  }
}

async function fetchFromOffFamily(
  host: 'world.openbeautyfacts.org' | 'world.openfoodfacts.org',
  sourceLabel: string,
  ean: string,
): Promise<SourceResult> {
  try {
    const res = await fetch(`https://${host}/api/v2/product/${ean}.json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    // A API v2 da Open Food/Beauty Facts responde 404 (não 200 com
    // status:0, como versões antigas) pra código fora da base -- confirmado
    // contra a API real: {"code":"...","status":0,"status_verbose":"product
    // not found"}. Não é falha de infra.
    if (res.status === 404) return { data: null, error: null }
    if (!res.ok) return { data: null, error: `${sourceLabel}: HTTP ${res.status}` }

    const data = await res.json()
    if (data?.status !== 1 || !data.product) return { data: null, error: null }

    const product = data.product
    // Muitos produtos brasileiros só têm os campos localizados em português
    // preenchidos (product_name_pt/generic_name_pt), não os genéricos.
    const name =
      product.product_name || product.product_name_pt || product.generic_name || product.generic_name_pt
    if (!name) return { data: null, error: null }

    return {
      data: {
        name,
        brand: product.brands ?? null,
        photo_url: product.image_url ?? null,
        ncm: null,
        cest: null,
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: describeFetchError(sourceLabel, err) }
  }
}

/** Base específica da Open Food Facts pra cosméticos/beleza -- forte fallback
 * dado que cosméticos são o forte da loja (ver CLAUDE.md). */
export function fetchFromOpenBeautyFacts(ean: string): Promise<SourceResult> {
  return fetchFromOffFamily('world.openbeautyfacts.org', 'openbeautyfacts', ean)
}

export function fetchFromOpenFoodFacts(ean: string): Promise<SourceResult> {
  return fetchFromOffFamily('world.openfoodfacts.org', 'off', ean)
}

export interface CascadeSecrets {
  cosmosApiKey: string | undefined
  /** Fontes a pular sem tentar (ex.: cota diária já esgotada) -- usado pelo
   * job de enriquecimento; o lookup sob demanda nunca preenche isso, reage
   * só ao 429 real de cada chamada. */
  skipSources?: Set<CatalogSource>
}

export type SourceOutcome = 'hit' | 'miss' | 'error'

/** Um registro por fonte externa efetivamente chamada (não pulada por
 * skipSources). Existe pra log/relatório/cota poderem contar CONSULTAS REAIS,
 * não só "quem resolveu" -- uma fonte tentada e que errou/não achou no meio
 * do caminho de um lookup que outra fonte resolveu depois ainda consumiu uma
 * chamada de verdade (isso importa sobretudo pra Cosmos, com cota diária). */
export interface CascadeAttempt {
  source: CatalogSource
  outcome: SourceOutcome
  errorDetail: string | null
}

export interface CascadeOutcome {
  result: LookupResult | null
  source: CatalogSource | null
  hadInfraError: boolean
  lastErrorDetail: string | null
  attempts: CascadeAttempt[]
}

/**
 * Roteamento por prefixo GTIN (CLAUDE.md): maioria do estoque é importada,
 * então nacional (789/790) prioriza a Cosmos (base brasileira), e todo o
 * resto deixa a Cosmos por último (ela dificilmente tem produto importado,
 * e está no plano Basic de 25 consultas/dia -- gastar isso em prefixos que
 * raramente acertam seria desperdício).
 */
export async function runCascade(
  ean: string,
  origin: ProductOrigin,
  secrets: CascadeSecrets,
): Promise<CascadeOutcome> {
  const sources: { name: CatalogSource; fn: () => Promise<SourceResult> }[] =
    origin === 'nacional'
      ? [
          { name: 'cosmos', fn: () => fetchFromCosmos(ean, secrets.cosmosApiKey) },
          { name: 'upcitemdb', fn: () => fetchFromUpcItemDb(ean) },
          { name: 'openbeautyfacts', fn: () => fetchFromOpenBeautyFacts(ean) },
          { name: 'off', fn: () => fetchFromOpenFoodFacts(ean) },
        ]
      : [
          { name: 'upcitemdb', fn: () => fetchFromUpcItemDb(ean) },
          { name: 'openbeautyfacts', fn: () => fetchFromOpenBeautyFacts(ean) },
          { name: 'off', fn: () => fetchFromOpenFoodFacts(ean) },
          { name: 'cosmos', fn: () => fetchFromCosmos(ean, secrets.cosmosApiKey) },
        ]

  let hadInfraError = false
  let lastErrorDetail: string | null = null
  const attempts: CascadeAttempt[] = []

  for (const source of sources) {
    if (secrets.skipSources?.has(source.name)) continue

    const { data, error } = await source.fn()
    if (error) {
      hadInfraError = true
      lastErrorDetail = error
      attempts.push({ source: source.name, outcome: 'error', errorDetail: error })
      continue
    }
    if (data) {
      attempts.push({ source: source.name, outcome: 'hit', errorDetail: null })
      return { result: data, source: source.name, hadInfraError, lastErrorDetail, attempts }
    }
    attempts.push({ source: source.name, outcome: 'miss', errorDetail: null })
  }

  return { result: null, source: null, hadInfraError, lastErrorDetail, attempts }
}
