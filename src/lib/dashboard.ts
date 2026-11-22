import { supabase } from './supabaseClient'
import { daysUntilExpiry } from './format'
import { siteRevenueOf } from './reports'
import type { RecordedPaymentMethod, Sale } from './types'

export interface DashboardStats {
  todayTotal: number
  todayCount: number
  /** Parte de `todayTotal`/`monthTotal` vinda do site (decisão #66). */
  todaySiteTotal: number
  monthTotal: number
  monthCount: number
  monthSiteTotal: number
  avgTicket: number
  byPaymentMethod: Partial<Record<RecordedPaymentMethod, number>>
}

export interface ExpiringStockItem {
  id: string
  name: string
  quantityAvailable: number
  daysLeft: number
}

/** Quantos itens listar no card "Itens vencendo" do dashboard -- só os mais
 * urgentes (ordenado por validade), não a lista inteira. */
const EXPIRING_LIST_LIMIT = 5

/** Vendas por página ao montar os cards do mês (abaixo do `max_rows` = 1000). */
const DASHBOARD_PAGE_SIZE = 500

function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayKey = localDateKey(now.toISOString())

  // `sale_payments` traz uma linha por forma (decisão #53), então uma venda
  // mista soma nas duas formas em vez de virar uma categoria "misto" que não
  // diz nada. Venda em forma única também tem sua linha lá -- inclusive as
  // antigas, pelo backfill da migration 0018.
  //
  // Pagina: o PostgREST corta toda resposta em 1.000 linhas (`max_rows`), e um
  // mês com mais de 1.000 vendas deixava de fora justamente as mais recentes --
  // as de hoje sumiam do card "Vendas hoje". Mesma dívida da seção 7 do
  // CLAUDE.md, já contornada em `getStockTotals`/`getBestSalesDay`.
  // Ordem por created_at + id: sem ordem estável a paginação pode repetir ou
  // pular linhas entre páginas.
  const sales: (Pick<Sale, 'total' | 'created_at' | 'channel'> & {
    sale_payments: { method: RecordedPaymentMethod; amount: number }[] | null
  })[] = []
  for (let page = 0; ; page++) {
    const from = page * DASHBOARD_PAGE_SIZE
    const { data, error } = await supabase
      .from('sales')
      .select('total, created_at, channel, sale_payments(method, amount)')
      .eq('status', 'completed')
      .gte('created_at', monthStart)
      .order('created_at')
      .order('id')
      .range(from, from + DASHBOARD_PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as typeof sales
    sales.push(...batch)
    if (batch.length < DASHBOARD_PAGE_SIZE) break
  }

  const monthTotal = sales.reduce((acc, s) => acc + s.total, 0)
  const monthCount = sales.length

  const todaySales = sales.filter((s) => localDateKey(s.created_at) === todayKey)
  const todayTotal = todaySales.reduce((acc, s) => acc + s.total, 0)
  const todayCount = todaySales.length

  const byPaymentMethod: Partial<Record<RecordedPaymentMethod, number>> = {}
  for (const s of sales) {
    for (const payment of s.sale_payments ?? []) {
      byPaymentMethod[payment.method] = (byPaymentMethod[payment.method] ?? 0) + payment.amount
    }
  }

  return {
    todayTotal,
    todayCount,
    todaySiteTotal: siteRevenueOf(todaySales),
    monthTotal,
    monthCount,
    monthSiteTotal: siteRevenueOf(sales),
    avgTicket: monthCount > 0 ? monthTotal / monthCount : 0,
    byPaymentMethod,
  }
}

/**
 * Itens em estoque (não vendidos) com validade nos próximos 90 dias, ou já
 * vencidos -- os `EXPIRING_LIST_LIMIT` mais urgentes, pro card "Itens
 * vencendo" do dashboard (mesmo padrão visual do mockup de referência:
 * nome + "vence em N dias" por linha, não uma contagem agregada). Filtra no
 * banco por uma janela ampla (90 dias) e ordena por validade; `daysLeft`
 * usa `daysUntilExpiry` -- mesma lógica usada na tabela de conferência e no
 * bloqueio do PDV, sem duplicar o cálculo.
 */
export async function getExpiringStockItems(): Promise<ExpiringStockItem[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 90)
  const cutoffKey = localDateKey(cutoff.toISOString())

  const { data, error } = await supabase
    .from('stock_items')
    .select('id, expiry_date, quantity, quantity_sold, nickname, product_catalog(name)')
    .not('expiry_date', 'is', null)
    .lte('expiry_date', cutoffKey)
    .order('expiry_date', { ascending: true })

  if (error) throw error

  const items = data as unknown as {
    id: string
    expiry_date: string
    quantity: number
    quantity_sold: number
    nickname: string | null
    product_catalog: { name: string | null } | null
  }[]

  return items
    .filter((item) => item.quantity_sold < item.quantity) // já vendido, não é mais "estoque"
    .map((item) => ({
      id: item.id,
      name: item.nickname || item.product_catalog?.name || 'Sem descrição',
      quantityAvailable: item.quantity - item.quantity_sold,
      daysLeft: daysUntilExpiry(item.expiry_date),
    }))
    .slice(0, EXPIRING_LIST_LIMIT)
}
