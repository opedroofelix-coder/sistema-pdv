import { supabase } from './supabaseClient'
import { invokeFunction } from './functions'

/**
 * Integração com a loja na Nuvemshop (decisão #66). O banco faz o trabalho
 * pesado (fila, venda do site) e as Edge Functions falam com a API; aqui fica
 * só o que as telas leem e as ações do dono (todas checadas no servidor).
 */

export interface NuvemshopConnection {
  store_id: number
  store_name: string | null
  store_url: string | null
  auto_create: boolean
  connected_at: string
  last_import_at: string | null
}

export interface NuvemshopLink {
  catalog_id: string
  ns_product_id: number
  ns_variant_id: number
  origin: 'linked' | 'created'
  last_synced_at: string | null
  last_error: string | null
}

export type CatalogChoice = 'create' | 'exclude' | 'review'

/** Produto daqui com saldo e sem par no site (view nuvemshop_pending_catalog). */
export interface PendingCatalog {
  catalog_id: string
  ean: string | null
  name: string | null
  brand: string | null
  photo_url: string | null
  available: number
  create_price: number | null
  sku: string | null
  choice: CatalogChoice | null
  reason: string | null
}

/** Variante do site sem par aqui. */
export interface UnmatchedVariant {
  ns_variant_id: number
  ns_product_id: number
  name: string
  barcode: string | null
  sku: string | null
  stock: number | null
  image_url: string | null
  ignored: boolean
}

export interface OrderIssue {
  id: string
  external_order_number: string | null
  kind: 'sem_estoque' | 'nao_vinculado'
  item_name: string | null
  quantity: number | null
  created_at: string
}

/** Estado de um produto no site, pro selo do card em /estoque. */
export type WebStatus = { kind: 'ok' } | { kind: 'error'; reason: string; detail?: string }

const PAGE = 1000

/** Lê todas as páginas (o PostgREST corta em 1.000 linhas -- decisões #50/#64). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export async function getConnection(): Promise<NuvemshopConnection | null> {
  const { data, error } = await supabase.from('nuvemshop_connection').select('*').maybeSingle()
  if (error) throw error
  return (data as NuvemshopConnection | null) ?? null
}

export function listLinks(): Promise<NuvemshopLink[]> {
  return fetchAll<NuvemshopLink>((from, to) =>
    supabase
      .from('nuvemshop_links')
      .select('catalog_id, ns_product_id, ns_variant_id, origin, last_synced_at, last_error')
      .order('catalog_id')
      .range(from, to),
  )
}

export function listPendingCatalog(): Promise<PendingCatalog[]> {
  return fetchAll<PendingCatalog>((from, to) =>
    supabase.from('nuvemshop_pending_catalog').select('*').order('name').order('catalog_id').range(from, to),
  )
}

export function listUnmatched(): Promise<UnmatchedVariant[]> {
  return fetchAll<UnmatchedVariant>((from, to) =>
    supabase.from('nuvemshop_unmatched').select('*').order('name').order('ns_variant_id').range(from, to),
  )
}

/** Produtos marcados "Não vender no site" (pra poder desfazer). */
export async function listExcluded(): Promise<{ catalog_id: string; name: string | null; ean: string | null }[]> {
  const rows = await fetchAll<{ catalog_id: string; product_catalog: { name: string | null; ean: string | null } | null }>(
    (from, to) =>
      supabase
        .from('nuvemshop_catalog_choices')
        .select('catalog_id, product_catalog(name, ean)')
        .eq('choice', 'exclude')
        .order('catalog_id')
        .range(from, to) as unknown as PromiseLike<{
        data: { catalog_id: string; product_catalog: { name: string | null; ean: string | null } | null }[] | null
        error: unknown
      }>,
  )
  return rows.map((r) => ({ catalog_id: r.catalog_id, name: r.product_catalog?.name ?? null, ean: r.product_catalog?.ean ?? null }))
}

export async function listOpenIssues(): Promise<OrderIssue[]> {
  const { data, error } = await supabase
    .from('nuvemshop_order_issues')
    .select('id, external_order_number, kind, item_name, quantity, created_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrderIssue[]
}

/** Vendas do site hoje (nº e faturamento), pro card de Integrações. */
export async function getTodaySiteSales(): Promise<{ count: number; total: number }> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const { data, error } = await supabase
    .from('sales')
    .select('total')
    .eq('channel', 'site')
    .eq('status', 'completed')
    .gte('created_at', start)
  if (error) throw error
  const rows = (data ?? []) as { total: number }[]
  return { count: rows.length, total: rows.reduce((acc, r) => acc + r.total, 0) }
}

/**
 * Selo de cada produto do catálogo em /estoque: vinculado e sem erro = "No
 * site"; vínculo com erro, ou produto em revisão (ex.: apagado na Nuvemshop)
 * = "Erro no site". Sem entrada = não aparece selo. Função pura pra teste.
 */
export function buildWebStatusMap(
  links: Pick<NuvemshopLink, 'catalog_id' | 'last_error'>[],
  reviews: { catalog_id: string; reason: string | null }[],
): Map<string, WebStatus> {
  const map = new Map<string, WebStatus>()
  for (const r of reviews) {
    map.set(r.catalog_id, { kind: 'error', reason: r.reason ?? 'Precisa de revisão' })
  }
  for (const l of links) {
    // A mensagem da API é técnica: vai no `detail` (tooltip), o card mostra a frase.
    map.set(
      l.catalog_id,
      l.last_error
        ? { kind: 'error', reason: 'Não foi possível enviar o saldo ao site.', detail: l.last_error }
        : { kind: 'ok' },
    )
  }
  return map
}

export async function getWebStatusByCatalog(): Promise<Map<string, WebStatus>> {
  const [links, reviews] = await Promise.all([
    fetchAll<Pick<NuvemshopLink, 'catalog_id' | 'last_error'>>((from, to) =>
      supabase.from('nuvemshop_links').select('catalog_id, last_error').order('catalog_id').range(from, to),
    ),
    fetchAll<{ catalog_id: string; reason: string | null }>((from, to) =>
      supabase
        .from('nuvemshop_catalog_choices')
        .select('catalog_id, reason')
        .eq('choice', 'review')
        .order('catalog_id')
        .range(from, to),
    ),
  ])
  return buildWebStatusMap(links, reviews)
}

/**
 * Sugestões de vínculo pra um produto daqui na lista de revisão: variantes do
 * site sem par cujo nome compartilha palavras com o nome daqui. Só ordena
 * por número de palavras em comum (sem acento, ≥ 3 letras) -- é uma ajuda
 * pra achar o par, o dono confirma. Função pura pra teste.
 */
export function suggestMatches(name: string | null, candidates: UnmatchedVariant[], limit = 3): UnmatchedVariant[] {
  const words = tokenize(name)
  if (words.size === 0) return []
  return candidates
    .filter((c) => !c.ignored)
    .map((c) => {
      const other = tokenize(c.name)
      let common = 0
      for (const w of words) if (other.has(w)) common++
      return { c, score: common / Math.max(words.size, 1) }
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c)
}

function tokenize(text: string | null): Set<string> {
  return new Set(
    (text ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  )
}

// ---------------------------------------------------------------------------
// Ações (todas exigem dono -- checado no servidor)
// ---------------------------------------------------------------------------

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export function linkProduct(catalogId: string, nsVariantId: number) {
  return rpc('nuvemshop_link', { p_catalog_id: catalogId, p_ns_variant_id: nsVariantId })
}

/** "Criar no site" (create), "Não vender no site" (exclude), desfazer (null). */
export function setCatalogChoice(catalogId: string, choice: 'create' | 'exclude' | null) {
  return rpc('nuvemshop_set_choice', { p_catalog_id: catalogId, p_choice: choice })
}

export function setUnmatchedIgnored(nsVariantId: number, ignored: boolean) {
  return rpc('nuvemshop_set_ignored', { p_ns_variant_id: nsVariantId, p_ignored: ignored })
}

/** "Criar os restantes no site": devolve quantos produtos entraram na fila. */
export async function enableAutoCreate(): Promise<number> {
  return Number(await rpc('nuvemshop_enable_auto_create', {}))
}

export function resolveIssue(issueId: string) {
  return rpc('nuvemshop_resolve_issue', { p_issue_id: issueId })
}

/** Link de instalação do app com `state` assinado (gerado no servidor). */
export async function getConnectUrl(): Promise<string> {
  const { url } = await invokeFunction<{ url: string }>('nuvemshop-sync', { action: 'connect_url' })
  return url
}

/** "Sincronizar agora": relê o site, refaz a lista de revisão e envia saldos. */
export function syncNow() {
  return invokeFunction<{ products: number; linked: number; unmatched: number }>('nuvemshop-sync', {
    action: 'import',
  })
}
