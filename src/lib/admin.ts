import { supabase } from './supabaseClient'
import { invokeFunction } from './functions'
import { fetchAllPages } from './paginate'

export interface AdminUser {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  active: boolean
  created_at: string
}

export interface UserActivity {
  registered: number
  sold: number
}

export interface ProductSearchResult {
  id: string
  ean: string | null
  name: string | null
  brand: string | null
}

export interface HistoryEntry {
  operatorName: string | null
  date: string
  quantity: number
}

export interface ProductHistory {
  registrations: HistoryEntry[]
  sales: HistoryEntry[]
}

function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  return invokeFunction<T>('admin-users', body)
}

/** Lista de usuários com e-mail/papel/status (via Edge Function admin-users,
 * que exige service_role e checa que o chamador é dono). */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const { users } = await invokeAdmin<{ users: AdminUser[] }>({ action: 'list' })
  return users
}

export async function setUserPassword(userId: string, password: string): Promise<void> {
  await invokeAdmin({ action: 'set_password', user_id: userId, password })
}

export async function setUserAccess(userId: string, active: boolean): Promise<void> {
  await invokeAdmin({ action: 'set_access', user_id: userId, active })
}

/** Filtro de período da tela /usuarios (decisão #69): Dia = hoje, Mês =
 * desde o dia 1, Ano = desde 1º de janeiro, Tudo = sem filtro. */
export type ActivityPeriod = 'dia' | 'mes' | 'ano' | 'tudo'

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Intervalo (YYYY-MM-DD, data LOCAL) do período, ou `null` pra "Tudo". */
export function activityPeriodRange(
  period: ActivityPeriod,
  now: Date,
): { from: string; to: string } | null {
  const to = localDateKey(now)
  if (period === 'dia') return { from: to, to }
  if (period === 'mes') return { from: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  if (period === 'ano') return { from: localDateKey(new Date(now.getFullYear(), 0, 1)), to }
  return null
}

/** Linhas cruas que alimentam o `aggregateUserActivity` (puro, testável). */
export interface StockAuthorRow {
  created_by: string | null
}
export interface SoldItemRow {
  quantity: number
  sales: { cashier_id: string | null } | null
}

/** Soma por usuário: itens de estoque que ele cadastrou e unidades que vendeu. */
export function aggregateUserActivity(
  stock: StockAuthorRow[],
  soldItems: SoldItemRow[],
): Record<string, UserActivity> {
  const activity: Record<string, UserActivity> = {}
  const ensure = (id: string) => (activity[id] ??= { registered: 0, sold: 0 })
  for (const row of stock) {
    if (row.created_by) ensure(row.created_by).registered += 1
  }
  for (const row of soldItems) {
    const id = row.sales?.cashier_id
    if (id) ensure(id).sold += row.quantity
  }
  return activity
}

/**
 * Atividade por usuário: quantos itens de estoque cada um cadastrou
 * (`stock_items.created_by`) e quantas unidades vendeu (`sale_items.quantity`
 * das vendas concluídas com `sales.cashier_id` dele). Retorna um mapa por id
 * de usuário -- a tela cruza com a lista de usuários (que traz os nomes).
 */
export async function getUserActivity(
  period: ActivityPeriod = 'tudo',
  now: Date = new Date(),
): Promise<Record<string, UserActivity>> {
  const range = activityPeriodRange(period, now)
  const fromISO = range ? new Date(`${range.from}T00:00:00`).toISOString() : null
  const toISO = range ? new Date(`${range.to}T23:59:59.999`).toISOString() : null

  const [stock, soldItems] = await Promise.all([
    // Itens sem autor (anteriores ao 0015) não contam pra ninguém -- nem
    // precisam vir.
    fetchAllPages<StockAuthorRow>((from, to) => {
      let q = supabase.from('stock_items').select('created_by').not('created_by', 'is', null)
      if (fromISO && toISO) q = q.gte('created_at', fromISO).lte('created_at', toISO)
      return q.order('id').range(from, to)
    }),
    // "Vendido no período" = data da VENDA (`sales.created_at`), filtrada no
    // embed `!inner`, que é o que restringe as linhas de `sale_items`.
    fetchAllPages<SoldItemRow>((from, to) => {
      let q = supabase
        .from('sale_items')
        .select('quantity, sales!inner(cashier_id, status, created_at)')
        .eq('sales.status', 'completed')
      if (fromISO && toISO) q = q.gte('sales.created_at', fromISO).lte('sales.created_at', toISO)
      return q.order('id').range(from, to)
    }),
  ])
  return aggregateUserActivity(stock, soldItems)
}

/** Busca produtos do catálogo por nome ou EAN, pra escolher qual ver o
 * histórico. */
export async function searchProductsForHistory(term: string): Promise<ProductSearchResult[]> {
  const like = `%${term}%`
  const { data, error } = await supabase
    .from('product_catalog')
    .select('id, ean, name, brand')
    .or(`name.ilike.${like},ean.ilike.${like}`)
    .limit(10)
  if (error) throw error
  return (data ?? []) as ProductSearchResult[]
}

/**
 * Histórico de um produto (Branch 6): quem cadastrou cada item de estoque
 * daquele catálogo (autor + data + quantidade) e quem vendeu cada unidade
 * (operador + data + quantidade, só vendas concluídas). Nomes resolvidos por
 * um mapa de `profiles`; autor nulo (item anterior ao registro de autoria)
 * fica sem nome ("desconhecido" na UI).
 */
export async function getProductHistory(catalogId: string): Promise<ProductHistory> {
  const [{ data: profiles }, { data: stock, error: stockErr }, { data: sales, error: salesErr }] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name'),
      supabase
        .from('stock_items')
        .select('created_by, created_at, quantity')
        .eq('catalog_id', catalogId)
        .order('created_at', { ascending: false }),
      supabase
        .from('sale_items')
        .select('quantity, sales!inner(cashier_id, created_at, status), stock_items!inner(catalog_id)')
        .eq('stock_items.catalog_id', catalogId)
        .eq('sales.status', 'completed'),
    ])
  if (stockErr) throw stockErr
  if (salesErr) throw salesErr

  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]))

  const registrations: HistoryEntry[] = (stock ?? []).map((row) => {
    const r = row as { created_by: string | null; created_at: string; quantity: number }
    return {
      operatorName: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
      date: r.created_at,
      quantity: r.quantity,
    }
  })

  const salesRows = (sales ?? []) as unknown as {
    quantity: number
    sales: { cashier_id: string | null; created_at: string } | null
  }[]
  const saleEntries: HistoryEntry[] = salesRows
    .map((row) => ({
      operatorName: row.sales?.cashier_id ? (nameById.get(row.sales.cashier_id) ?? null) : null,
      date: row.sales?.created_at ?? '',
      quantity: row.quantity,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  return { registrations, sales: saleEntries }
}
