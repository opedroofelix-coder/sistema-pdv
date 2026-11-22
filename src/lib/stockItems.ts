import { supabase } from './supabaseClient'
import type { StockItem, StockItemCondition } from './types'

export async function listItemsByLot(lotId: string): Promise<StockItem[]> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('*, product_catalog(*)')
    .eq('lot_id', lotId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as StockItem[]
}

/** Linhas por página: o PostgREST corta toda resposta em `max_rows` (1000,
 * ver `supabase/config.toml`), então listagens completas têm que paginar. */
const PAGE_SIZE = 500

/**
 * Busca TODAS as linhas de `stock_items` que casam com o filtro, em páginas.
 * Sem isso a resposta vinha cortada em 1.000 linhas, em silêncio, e os itens
 * mais antigos sumiam de /estoque e da busca por nome do PDV -- embora a
 * bipagem por código, que consulta direto, achasse.
 *
 * As páginas saem **em paralelo**: primeiro uma contagem (`head`, sem
 * linhas), depois todos os blocos de uma vez. Antes eram 8+ pedidos um atrás
 * do outro e a tela de estoque ficava segundos esperando.
 *
 * A ordem da consulta é `created_at` + `id` **crescente** (o mais recente
 * fica por último) e só é invertida no fim: assim um item cadastrado no meio
 * da busca entra no final e não empurra as linhas entre as páginas. Se a
 * última página vier cheia (chegou item depois da contagem), segue buscando;
 * `id` repetido é descartado.
 */
async function fetchAllStockItems(
  applyFilters: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>,
): Promise<StockItem[]> {
  const { count, error: countError } = await applyFilters(
    supabase.from('stock_items').select('id', { count: 'exact', head: true }),
  )
  if (countError) throw countError

  const fetchPage = async (from: number) => {
    const { data, error } = await applyFilters(baseQuery())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    return (data ?? []) as StockItem[]
  }

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  const pages = await Promise.all(Array.from({ length: pageCount }, (_, i) => fetchPage(i * PAGE_SIZE)))
  for (let from = pageCount * PAGE_SIZE; pages[pages.length - 1].length === PAGE_SIZE; from += PAGE_SIZE) {
    pages.push(await fetchPage(from))
  }

  return dedupeById(pages.flat()).reverse()
}

/** Remove linhas repetidas (mesmo `id`), mantendo a primeira. Pura, pra teste. */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
}

function baseQuery() {
  return supabase
    .from('stock_items')
    .select('*, product_catalog(*), lot:lots(id, supplier, status)')
}

/**
 * Estoque geral da loja: todos os itens de todos os lotes, mais recentes
 * primeiro. Usado na tela /estoque (visão consolidada, independente de lote).
 */
export function listAllStockItems(): Promise<StockItem[]> {
  return fetchAllStockItems((q) => q.eq('active', true))
}

/**
 * Itens vendáveis (ativos, com preço > 0), com catálogo e lote, mais recentes
 * primeiro -- base da busca por nome no PDV (Branch 5, item 11). A filtragem
 * por termo e por saldo disponível (quantity_sold < quantity) é feita em
 * memória no componente, mesmo padrão da busca do /estoque (PostgREST não
 * compara duas colunas entre si num filtro). Usa left join no catálogo pra
 * incluir itens sem EAN (código interno).
 */
export function listSellableStockItems(): Promise<StockItem[]> {
  return fetchAllStockItems((q) => q.eq('active', true).gt('sale_price', 0))
}

/** Gravidade da condição, da melhor pra pior. Ao somar peças de condições
 * diferentes na mesma linha (decisão #52), vale a PIOR do conjunto -- senão
 * uma peça com avaria somada numa linha "Novo" ficaria anunciada como nova,
 * pelo preço da nova. */
const CONDITION_SEVERITY: Record<StockItemCondition, number> = {
  novo: 0,
  caixa_aberta: 1,
  usado: 2,
  avaria: 3,
}

/** Pior das duas condições (ver `CONDITION_SEVERITY`). `a` aceita null porque
 * `stock_items.condition` é nullable; nesse caso vale a condição que está
 * chegando. Pura, pra ser testável. */
export function worstCondition(
  a: StockItemCondition | null,
  b: StockItemCondition,
): StockItemCondition {
  if (!a) return b
  return CONDITION_SEVERITY[b] > CONDITION_SEVERITY[a] ? b : a
}

/**
 * Recebe um item já confirmado no fluxo de duas etapas (DESIGN.md seção 2):
 * o mesmo produto no mesmo lote **soma na linha que já existe** em vez de
 * criar outra (decisão #52). Casa por `lot_id` + `catalog_id` entre os itens
 * ativos, sem olhar condição -- a linha fica com a pior condição do conjunto.
 *
 * Detalhes que já custaram bug antes:
 * - `active` PRECISA entrar no filtro: sem ele, uma linha excluída (soft
 *   delete, migration 0011) casaria e a quantidade sumiria numa linha
 *   invisível.
 * - nada de `.maybeSingle()`: lotes que acumularam duplicatas antes desta
 *   correção casam com várias linhas, e o `maybeSingle` estouraria. Soma na
 *   mais antiga.
 * - somar numa linha que já vendeu é seguro: `quantity` sobe, `quantity_sold`
 *   não muda, e o custo das unidades vendidas já está congelado em
 *   `sale_items.cost_at_sale`.
 */
export async function receiveStockItem(
  lotId: string,
  catalogId: string,
  fields: {
    condition: StockItemCondition
    quantity: number
    sale_price: number
    expiry_date?: string | null
  },
): Promise<StockItem> {
  const { data: matches, error: findError } = await supabase
    .from('stock_items')
    .select('*')
    .eq('lot_id', lotId)
    .eq('catalog_id', catalogId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
  if (findError) throw findError

  const existing = (matches ?? [])[0] as StockItem | undefined

  if (existing) {
    // Bipar o mesmo produto de novo não sobrescreve uma validade já
    // registrada com "sem validade" -- só grava se esta bipagem trouxe uma
    // data (ex.: lote misto onde só a segunda leva teve a data digitada).
    const patch: Partial<Pick<StockItem, 'quantity' | 'sale_price' | 'expiry_date' | 'condition'>> = {
      quantity: existing.quantity + fields.quantity,
      sale_price: fields.sale_price,
      condition: worstCondition(existing.condition, fields.condition),
    }
    if (fields.expiry_date) patch.expiry_date = fields.expiry_date

    const { data, error } = await supabase
      .from('stock_items')
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data as StockItem
  }

  const { data, error } = await supabase
    .from('stock_items')
    .insert({
      lot_id: lotId,
      catalog_id: catalogId,
      condition: fields.condition,
      quantity: fields.quantity,
      sale_price: fields.sale_price,
      expiry_date: fields.expiry_date ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as StockItem
}

/**
 * Quantos itens ativos (e em quantos lotes) compartilham este catalog_id --
 * usado no aviso de escopo ao editar o nome do catálogo (decisão #30),
 * porque a mudança vale pro EAN inteiro, não só pro item que abriu o modal.
 */
export async function countItemsByCatalog(catalogId: string): Promise<{ items: number; lots: number }> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('lot_id')
    .eq('catalog_id', catalogId)
    .eq('active', true)
  if (error) throw error
  const lots = new Set(data.map((row) => row.lot_id))
  return { items: data.length, lots: lots.size }
}

/**
 * Nome exibido pra um item de estoque (decisão #30): apelido, se definido,
 * senão o nome do catálogo. Mesma regra em /estoque, PDV, comprovante e
 * conferência do lote.
 */
export function stockItemDisplayName(item: StockItem): string {
  return item.nickname || item.product_catalog?.name || 'Sem descrição'
}

/**
 * Normaliza um nome de produto pra comparação: minúsculas, sem acento e sem
 * espaço sobrando. "Fone  JBL " e "fone jbl" viram a mesma coisa. Pura, pra
 * ser testável.
 */
export function normalizeProductName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Item do lote cujo nome bate com o que o operador digitou no cadastro rápido
 * (decisão #52). Só olha itens que têm entrada de catálogo -- é o `catalog_id`
 * dela que o "Somar a este" reaproveita pra a soma acontecer depois, no
 * `receiveStockItem`. Pura: recebe os itens que a tela já tem em estado, sem
 * consulta nova.
 */
export function findDuplicateInLot(items: StockItem[], typedName: string): StockItem | null {
  const target = normalizeProductName(typedName)
  if (!target) return null
  return (
    items.find(
      (item) =>
        item.active &&
        item.catalog_id !== null &&
        normalizeProductName(stockItemDisplayName(item)) === target,
    ) ?? null
  )
}

export async function updateStockItem(
  id: string,
  input: Partial<Pick<StockItem, 'sale_price' | 'condition' | 'quantity' | 'photos' | 'expiry_date' | 'nickname'>>,
): Promise<StockItem> {
  const { data, error } = await supabase
    .from('stock_items')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as StockItem
}

/**
 * Separa 1 unidade de uma linha com quantity > 1 em uma linha própria, para
 * dar a ela uma condição diferente (ex.: avaria em 1 de 5 unidades).
 */
export async function splitUnit(item: StockItem): Promise<StockItem> {
  if (item.quantity <= 1) {
    throw new Error('Só é possível separar unidade de uma linha com quantidade maior que 1.')
  }

  const { error: updateError } = await supabase
    .from('stock_items')
    .update({ quantity: item.quantity - 1 })
    .eq('id', item.id)
  if (updateError) throw updateError

  const { data, error } = await supabase
    .from('stock_items')
    .insert({
      lot_id: item.lot_id,
      catalog_id: item.catalog_id,
      condition: item.condition,
      quantity: 1,
      sale_price: item.sale_price,
    })
    .select()
    .single()
  if (error) throw error
  return data as StockItem
}

/**
 * Exclusão de item de estoque (ajuste de UX, tela "Estoque"): regra de
 * negócio (papel dono, lógica vs. física conforme histórico de venda) mora
 * na RPC `delete_stock_item` (`0011_exclusao_itens.sql`), checada no
 * servidor -- mesmo padrão de `create_sale`/`p_override_expired`.
 */
export async function deleteStockItem(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_stock_item', { p_stock_item_id: id })
  if (error) throw error
}

/**
 * Resolve um código bipado no PDV para o stock_item vendável correspondente.
 * internal_code é único, então casa direto. Um EAN pode casar mais de um
 * stock_item vendável (mesmo produto em lotes/condições diferentes) — nesse
 * caso escolhe o mais antigo (FIFO). "Vendável" = sale_price > 0 e
 * quantity_sold < quantity (comparação feita em JS pois PostgREST não
 * compara duas colunas entre si em um filtro).
 */
export async function findSellableStockItem(code: string): Promise<StockItem | null> {
  const { data: byCode, error: codeError } = await supabase
    .from('stock_items')
    .select('*, product_catalog(*)')
    .eq('internal_code', code)
    .eq('active', true)
    .gt('sale_price', 0)
    .maybeSingle()
  if (codeError) throw codeError
  if (byCode) {
    return byCode.quantity_sold < byCode.quantity ? (byCode as StockItem) : null
  }

  const { data: candidates, error: eanError } = await supabase
    .from('stock_items')
    .select('*, product_catalog!inner(*)')
    .eq('product_catalog.ean', code)
    .eq('active', true)
    .gt('sale_price', 0)
    .order('created_at', { ascending: true })
  if (eanError) throw eanError

  const sellable = (candidates as StockItem[]).find((item) => item.quantity_sold < item.quantity)
  return sellable ?? null
}
