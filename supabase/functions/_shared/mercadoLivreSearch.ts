// Busca de preco de referencia no Mercado Livre, autenticada com o token
// obtido em mercadoLivreAuth.ts. Mesma convencao de resultado da cascata de
// catalogo (ver _shared/catalogCascade.ts): `price` null com `error` null
// significa "sem anuncio encontrado" (resposta valida, pode cachear);
// `error` preenchido significa falha de infra ou formato inesperado (nao
// cachear, reportar).

const SEARCH_ENDPOINT = 'https://api.mercadolibre.com/sites/MLB/search'
const FETCH_TIMEOUT_MS = 4000

export interface ReferencePriceResult {
  min: number
  avg: number
  max: number
}

export interface MercadoLivreSearchOutcome {
  price: ReferencePriceResult | null
  error: string | null
}

interface SearchResponseBody {
  results?: unknown
}

export async function searchMercadoLivrePrice(ean: string, accessToken: string): Promise<MercadoLivreSearchOutcome> {
  let res: Response
  try {
    res = await fetch(`${SEARCH_ENDPOINT}?q=${encodeURIComponent(ean)}&limit=20`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    const message = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : String(err)
    return { price: null, error: `mercadolivre: falha de rede (${message})` }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { price: null, error: `mercadolivre: HTTP ${res.status} ${body.slice(0, 300)}` }
  }

  let data: SearchResponseBody
  try {
    data = await res.json()
  } catch {
    return { price: null, error: 'mercadolivre: resposta nao é JSON válido' }
  }

  // `results` ausente ou de tipo errado nao é "sem anuncio" -- é a API tendo
  // mudado de formato (o "sem anuncio" real é `results: []`, que cai no
  // .filter abaixo e vira prices.length === 0 normalmente).
  if (!Array.isArray(data.results)) {
    return { price: null, error: `mercadolivre: formato inesperado, sem "results" ${JSON.stringify(data).slice(0, 300)}` }
  }

  const prices = data.results
    .map((r) => (r as { price?: unknown })?.price)
    .filter((p): p is number => typeof p === 'number' && p > 0)

  if (prices.length === 0) return { price: null, error: null }

  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length

  return { price: { min, avg, max }, error: null }
}
