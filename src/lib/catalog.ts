import { supabase } from './supabaseClient'
import { fetchAllPages } from './paginate'
import { invokeFunction } from './functions'
import { fetchReferencePriceFromApi, isReferencePriceFresh } from './mercadoLivre'
import type { CatalogSource, ProductCatalog, ProductOrigin, ReferencePrice } from './types'

async function insertCatalogEntry(
  ean: string | null,
  source: CatalogSource,
  origin: ProductOrigin | null,
  fields: {
    name: string
    brand?: string | null
    photo_url?: string | null
    ncm?: string | null
    cest?: string | null
  },
): Promise<ProductCatalog> {
  const ncmPending = origin === 'importado' && !fields.ncm
  const { data, error } = await supabase
    .from('product_catalog')
    .insert({
      ean,
      name: fields.name,
      brand: fields.brand ?? null,
      photo_url: fields.photo_url ?? null,
      ncm: fields.ncm ?? null,
      cest: fields.cest ?? null,
      source,
      origin,
      ncm_pending: ncmPending,
      needs_review: source !== 'manual',
    })
    .select()
    .single()
  if (error) throw error
  return data as ProductCatalog
}

/**
 * Resolve um código bipado. Toda a cascata externa (normalização, roteamento
 * por prefixo GTIN, Cosmos/UPCitemdb/Open Beauty Facts/Open Food Facts, cache)
 * roda na Edge Function `catalog-lookup` -- nenhuma chave de API de catálogo
 * fica no cliente (pacote de melhorias no catálogo, ajuste de segurança
 * prioritário). Retorna null quando nenhuma fonte encontra o produto (cascata
 * completou sem erro), sinalizando que a UI deve abrir o cadastro rápido
 * manual. Uma entrada com `enrichment_status === 'pending'` significa que
 * alguma fonte falhou por infra (quota/auth/timeout) -- a UI não trata isso
 * como "não encontrado": segue direto pra precificação com um placeholder,
 * sem travar o operador, e o job diário completa os dados depois.
 *
 * Cache em memória (só velocidade): um `Map` de módulo guarda os resultados
 * bons dos códigos já bipados nesta sessão do app, pra o repique do mesmo
 * código responder na hora, sem novo round-trip à Edge Function. O servidor já
 * é cache-first (consulta `product_catalog` antes de qualquer API externa),
 * então isto não muda cota nem correção de dado -- só corta a ida à rede. Vive
 * enquanto a página está aberta; some no reload. Não guardamos:
 * - `null` (nenhuma fonte reconheceu): senão, depois de o operador cadastrar
 *   manualmente, o próximo bipe reabriria o cadastro em vez de achar a linha
 *   nova no servidor.
 * - `enrichment_status === 'pending'` (falha de infra, decisão #18): precisa
 *   poder ser reprocessado/corrigido, não ficar preso num placeholder.
 */
const catalogCache = new Map<string, ProductCatalog>()

export async function lookupProduct(code: string): Promise<ProductCatalog | null> {
  const key = code.trim()
  const cached = catalogCache.get(key)
  if (cached) return cached

  const result = await invokeFunction<ProductCatalog | null>('catalog-lookup', { code })
  if (result && result.enrichment_status !== 'pending') {
    catalogCache.set(key, result)
  }
  return result
}

/**
 * Invalida no cache em memória as entradas de um EAN cuja identidade mudou --
 * hoje só a correção de foto rejeitada (`correctCatalogEntry`), que troca
 * nome/foto/origem do mesmo código. Sem isto, re-bipar o mesmo produto na
 * mesma sessão traria o cadastro antigo cacheado em vez do corrigido. O `Map`
 * é pequeno (só o que foi bipado na sessão), então varrer é barato.
 */
export function invalidateCatalogCacheByEan(ean: string | null): void {
  if (!ean) return
  for (const [key, value] of catalogCache) {
    if (value.ean === ean) catalogCache.delete(key)
  }
}

/** Zera o cache em memória -- usado só nos testes, pra isolar cada caso. */
export function clearCatalogCache(): void {
  catalogCache.clear()
}

/**
 * Cadastro rápido manual (item sem EAN reconhecido por nenhuma fonte, ou sem
 * código de barras algum). Origem é escolhida pelo operador, já que muitos
 * desses itens não têm código nenhum pra classificar por prefixo GS1.
 */
export async function createManualCatalogEntry(fields: {
  ean?: string | null
  name: string
  brand?: string | null
  photo_url?: string | null
  origin: ProductOrigin
}): Promise<ProductCatalog> {
  return insertCatalogEntry(fields.ean ?? null, 'manual', fields.origin, fields)
}

/**
 * Operador confirmou "confere com o item físico" (CLAUDE.md seção 2, passo
 * 6 da cascata). Marca a entrada como revisada; se a foto veio de foto
 * própria (API não tinha foto), grava no cache compartilhado para beneficiar
 * o próximo item do mesmo produto.
 */
export async function confirmCatalogMatch(
  catalogId: string,
  ownPhotoUrl?: string | null,
): Promise<ProductCatalog> {
  const patch: Partial<ProductCatalog> = { needs_review: false }
  if (ownPhotoUrl) patch.photo_url = ownPhotoUrl

  const { data, error } = await supabase
    .from('product_catalog')
    .update(patch)
    .eq('id', catalogId)
    .select()
    .single()
  if (error) throw error
  return data as ProductCatalog
}

/**
 * Operador rejeitou a foto ("não é este"): a entrada de catálogo cacheada
 * está errada para esse EAN e é corrigida no lugar (mesmo id, mesmo EAN) em
 * vez de criar uma segunda entrada duplicada para o mesmo código.
 */
export async function correctCatalogEntry(
  catalogId: string,
  fields: {
    name: string
    brand?: string | null
    photo_url?: string | null
    origin: ProductOrigin
  },
): Promise<ProductCatalog> {
  const { data, error } = await supabase
    .from('product_catalog')
    .update({
      name: fields.name,
      brand: fields.brand ?? null,
      photo_url: fields.photo_url ?? null,
      origin: fields.origin,
      ncm_pending: fields.origin === 'importado',
      source: 'manual',
      needs_review: false,
      enrichment_status: 'manual',
    })
    .eq('id', catalogId)
    .select()
    .single()
  if (error) throw error
  return data as ProductCatalog
}

/**
 * Preço de referência do Mercado Livre com cache de 30 dias (CLAUDE.md
 * seção 1, decisão #10). **Não é mais chamada automaticamente pela UI**
 * (decisão #22: busca de produtos do ML bloqueada por política deles mesmo
 * autenticado) -- fica pronta pro dia em que o ML liberar/formalizar
 * parceria com o app. A função absorve toda falha de infra e "sem anúncio
 * encontrado" internamente (decide o que cachear no servidor) -- aqui só
 * repassa o resultado.
 */
export async function getReferencePrice(catalog: ProductCatalog): Promise<ReferencePrice | null> {
  if (isReferencePriceFresh(catalog.ref_price_updated_at) && catalog.ref_price_avg !== null) {
    return { min: catalog.ref_price_min!, avg: catalog.ref_price_avg!, max: catalog.ref_price_max! }
  }
  if (!catalog.ean) return null

  return fetchReferencePriceFromApi(catalog.id)
}

export interface BestReferencePrice {
  value: number
  source: 'cosmos' | 'manual'
  updatedAt: string | null
}

/**
 * Plano B do preço de referência (CLAUDE.md decisão #23, depois que a via
 * automática do Mercado Livre foi encerrada): melhor referência disponível,
 * na ordem Cosmos > anotado manualmente > nenhuma. `ref_price_avg` só é
 * preenchido pela Cosmos hoje (ver `catalogCascade.ts`); `manual_ref_price`
 * é o valor que o operador digitou depois de olhar no site do ML. Usado
 * pelo card de referência no recebimento, pela conferência do lote, por
 * `/estoque` e pelo relatório de estoque parado -- sempre a mesma
 * precedência, pra não mostrar números diferentes em telas diferentes.
 */
export function getBestReferencePrice(catalog: ProductCatalog): BestReferencePrice | null {
  if (catalog.ref_price_avg !== null) {
    return { value: catalog.ref_price_avg, source: 'cosmos', updatedAt: catalog.ref_price_updated_at }
  }
  if (catalog.manual_ref_price !== null) {
    return { value: catalog.manual_ref_price, source: 'manual', updatedAt: catalog.manual_ref_price_updated_at }
  }
  return null
}

export type ReferenceComparison = 'below' | 'near' | 'above'

/** Limiar entre "próximo da referência" (âmbar) e "muito acima" (vermelho)
 * -- 15% é um valor padrão meu, não confirmado com o dono (CLAUDE.md seção
 * 7, pendências de decisão). */
const REFERENCE_ABOVE_THRESHOLD = 0.15

/**
 * Classifica o preço de venda contra a melhor referência disponível:
 * `below` (na referência ou abaixo, verde), `near` (até 15% acima, âmbar)
 * ou `above` (mais de 15% acima, vermelho -- risco de não vender por estar
 * caro demais vs. o mercado).
 */
export function compareToReference(salePrice: number, referenceValue: number): ReferenceComparison {
  if (salePrice <= referenceValue) return 'below'
  if (salePrice <= referenceValue * (1 + REFERENCE_ABOVE_THRESHOLD)) return 'near'
  return 'above'
}

/**
 * Preço visto pelo operador no site do Mercado Livre (link "Ver no Mercado
 * Livre" no card de referência), digitado manualmente. Só é usado como
 * referência quando a Cosmos não tem o dado (precedência em
 * `getBestReferencePrice`).
 */
export async function setManualReferencePrice(catalogId: string, price: number): Promise<ProductCatalog> {
  const { data, error } = await supabase
    .from('product_catalog')
    .update({ manual_ref_price: price, manual_ref_price_updated_at: new Date().toISOString() })
    .eq('id', catalogId)
    .select()
    .single()
  if (error) throw error
  return data as ProductCatalog
}

/** Produtos com NCM pendente (item 5 do pacote de melhorias no catálogo).
 * `ean` é único em product_catalog, então cada linha já é um produto
 * distinto -- "mesmo produto = mesmo NCM" é automático pelo schema, não
 * precisa de agrupamento: preencher o NCM de uma linha nunca duplica pro
 * resto do estoque por engano. */
export async function listNcmPending(): Promise<ProductCatalog[]> {
  // Paginado (decisão #69): a fila pode passar de 1.000 produtos importados.
  return fetchAllPages<ProductCatalog>((from, to) =>
    supabase
      .from('product_catalog')
      .select('*')
      .eq('ncm_pending', true)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .order('id')
      .range(from, to),
  )
}

export async function listEnrichmentPending(): Promise<ProductCatalog[]> {
  const { data, error } = await supabase
    .from('product_catalog')
    .select('*')
    .eq('enrichment_status', 'pending')
    .eq('active', true)
    .order('enrichment_attempts', { ascending: false })
  if (error) throw error
  return data as ProductCatalog[]
}

/**
 * Exclusão de item de catálogo (ajuste de UX, tela "Catálogo"): a regra de
 * negócio inteira (papel dono, lógica vs. física, bloqueio quando há estoque
 * vinculado sem venda) mora na RPC `delete_catalog_item`
 * (`0011_exclusao_itens.sql`), checada no servidor -- não só escondendo o
 * botão na UI, mesmo padrão de `create_sale`/`p_override_expired`.
 */
export async function deleteCatalogItem(catalogId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_catalog_item', { p_catalog_id: catalogId })
  if (error) throw error
}

/**
 * Nome do catálogo vale para o EAN em todos os lotes (e é o nome usado na
 * NFC-e, Fase 2) -- edição restrita ao dono, checada no servidor via RPC
 * `update_catalog_name` (`0012_apelido_item.sql`), mesmo padrão de
 * `delete_catalog_item`.
 */
export async function updateCatalogName(catalogId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('update_catalog_name', { p_catalog_id: catalogId, p_name: name })
  if (error) throw error
}

/**
 * Marca do catálogo (Branch 1, item 1). Diferente do nome, que é usado na
 * NFC-e e por isso é restrito ao dono com confirmação (decisão #30/#37), a
 * marca é um campo de menor risco -- edição livre para qualquer papel, sem
 * confirmação, via update direto na tabela (mesmo padrão de `setCatalogNcm`,
 * sem RPC dedicada). `null` limpa a marca. Vale para o EAN em todos os lotes,
 * como qualquer campo de `product_catalog`.
 */
export async function updateCatalogBrand(catalogId: string, brand: string | null): Promise<void> {
  const { error } = await supabase
    .from('product_catalog')
    .update({ brand })
    .eq('id', catalogId)
  if (error) throw error
}

export async function setCatalogNcm(catalogId: string, ncm: string): Promise<ProductCatalog> {
  const { data, error } = await supabase
    .from('product_catalog')
    .update({ ncm, ncm_pending: false })
    .eq('id', catalogId)
    .select()
    .single()
  if (error) throw error
  return data as ProductCatalog
}

/** Aplica o mesmo NCM a vários produtos de uma vez (operador reconhece que
 * vários EANs distintos caem na mesma categoria fiscal). */
export async function bulkSetCatalogNcm(catalogIds: string[], ncm: string): Promise<void> {
  const { error } = await supabase
    .from('product_catalog')
    .update({ ncm, ncm_pending: false })
    .in('id', catalogIds)
  if (error) throw error
}
