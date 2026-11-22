import { supabase } from './supabaseClient'
import { fetchAllPages } from './paginate'
import type {
  CatalogHitRateReport,
  CatalogLookupLog,
  CatalogLookupSource,
  CatalogSourceOriginStat,
  IntegrationHealth,
  LotMarginReport,
  SalesDayTotal,
  SaleChannel,
  SalesSummary,
  StockItem,
  StockTotals,
} from './types'

/** Chave de data local (YYYY-MM-DD) -- agrupa por dia no fuso do operador,
 * não em UTC (uma venda às 22h no Brasil não pode cair no dia seguinte). */
function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getLotMarginReport(): Promise<LotMarginReport[]> {
  const { data, error } = await supabase
    .from('lot_margin_report')
    .select('*')
    .order('revenue', { ascending: false })
  if (error) throw error
  return data as LotMarginReport[]
}

type StockTotalsRow = Pick<StockItem, 'quantity' | 'quantity_sold' | 'sale_price'>

/**
 * Totais do estoque (decisão #50): unidades disponíveis e quanto elas valem
 * pelo preço de venda. `sale_price` é unitário e disponível = quantity −
 * quantity_sold; item já todo vendido não conta. Função pura pra ser testável
 * sem banco.
 */
export function sumStockTotals(rows: StockTotalsRow[]): StockTotals {
  let units = 0
  let saleValue = 0
  for (const item of rows) {
    const available = item.quantity - item.quantity_sold
    if (available <= 0) continue
    units += available
    saleValue += item.sale_price * available
  }
  return { units, saleValue }
}

/** Quantas linhas buscar por página em `getStockTotals` -- o PostgREST corta
 * toda resposta em `max_rows` (1000, ver `supabase/config.toml`), então uma
 * consulta só devolveria um total errado assim que o estoque passasse disso
 * (em produção já são ~1.038 itens). */
const STOCK_PAGE_SIZE = 1000

/** Idem pras vendas em `getBestSalesDay`. */
const SALES_PAGE_SIZE = 1000
const SALES_SUMMARY_PAGE_SIZE = 500

/**
 * Soma o estoque inteiro, paginando até acabar. Traz só as três colunas que
 * entram na conta -- sem o join de catálogo/lote do `listAllStockItems`, que
 * seria desperdício aqui.
 */
export async function getStockTotals(): Promise<StockTotals> {
  const rows: StockTotalsRow[] = []
  for (let page = 0; ; page++) {
    const from = page * STOCK_PAGE_SIZE
    const { data, error } = await supabase
      .from('stock_items')
      .select('quantity, quantity_sold, sale_price')
      .eq('active', true)
      .order('id')
      .range(from, from + STOCK_PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as StockTotalsRow[]
    rows.push(...batch)
    if (batch.length < STOCK_PAGE_SIZE) break
  }
  return sumStockTotals(rows)
}

type LotSaleValueRow = Pick<StockItem, 'lot_id' | 'sale_price' | 'quantity'>

/**
 * Valor de venda total de cada lote = soma de `sale_price × quantity` de todos
 * os itens ativos do lote (todas as unidades, vendidas ou não — é o total se
 * vender tudo pelo preço marcado). Mostrado no card de `/lotes` pra o dono ver
 * o lucro/prejuízo projetado (valor de venda − valor pago). Pura, testável.
 */
export function sumLotSaleValues(rows: LotSaleValueRow[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.lot_id, (totals.get(row.lot_id) ?? 0) + row.sale_price * row.quantity)
  }
  return totals
}

/**
 * Total de venda por lote, paginando o estoque inteiro (o `max_rows` = 1000
 * cortaria a resposta assim que passasse disso — mesmo motivo do
 * `getStockTotals`). Traz só as três colunas que entram na conta.
 */
export async function getLotSaleTotals(): Promise<Map<string, number>> {
  const rows: LotSaleValueRow[] = []
  for (let page = 0; ; page++) {
    const from = page * STOCK_PAGE_SIZE
    const { data, error } = await supabase
      .from('stock_items')
      .select('lot_id, sale_price, quantity')
      .eq('active', true)
      .order('id')
      .range(from, from + STOCK_PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as LotSaleValueRow[]
    rows.push(...batch)
    if (batch.length < STOCK_PAGE_SIZE) break
  }
  return sumLotSaleValues(rows)
}

type SaleAggregateRow = {
  total: number
  created_at: string
  /** Ausente = loja (vendas anteriores à decisão #66 e linhas de teste). */
  channel?: SaleChannel | null
  sale_items: { quantity: number; cost_at_sale: number }[] | null
}

/**
 * Faturamento do site dentro de um conjunto de vendas (decisão #66) -- o que
 * sobra do total é da loja. Venda sem canal conta como loja. Função pura pra
 * ser testável sem banco; usada no card do Dashboard e na seção Vendas.
 */
export function siteRevenueOf(sales: { total: number; channel?: SaleChannel | null }[]): number {
  return sales.reduce((acc, s) => (s.channel === 'site' ? acc + s.total : acc), 0)
}

/**
 * Agrega vendas concluídas num resumo (Branch 3). Faturamento é a soma de
 * `sales.total` (já líquido do desconto); o custo total usa o snapshot
 * congelado `cost_at_sale` de cada item (a margem histórica não muda depois),
 * então o lucro = faturamento − custo já absorve o desconto corretamente.
 * Função pura pra ser testável sem banco.
 */
export function aggregateSales(sales: SaleAggregateRow[]): SalesSummary {
  const revenue = sales.reduce((acc, s) => acc + s.total, 0)
  const count = sales.length
  const totalCost = sales.reduce(
    (acc, s) => acc + (s.sale_items ?? []).reduce((a, si) => a + si.cost_at_sale * si.quantity, 0),
    0,
  )

  return {
    revenue,
    siteRevenue: siteRevenueOf(sales),
    profit: revenue - totalCost,
    count,
    avgTicket: count > 0 ? revenue / count : 0,
  }
}

/**
 * Dia de maior faturamento entre as vendas recebidas -- agrupa por data
 * LOCAL (uma venda às 22h no Brasil não pode cair no dia seguinte) e devolve
 * o maior. Empate fica com o primeiro encontrado. Função pura pra ser
 * testável sem banco.
 */
export function bestSalesDay(sales: { total: number; created_at: string }[]): SalesDayTotal | null {
  const byDay = new Map<string, number>()
  for (const s of sales) {
    const key = localDateKey(s.created_at)
    byDay.set(key, (byDay.get(key) ?? 0) + s.total)
  }
  let best: SalesDayTotal | null = null
  for (const [date, total] of byDay) {
    if (!best || total > best.total) best = { date, total }
  }
  return best
}

/**
 * Recorde de faturamento num dia, sobre TODA a operação (decisão #51) -- não
 * respeita o seletor de período da seção Vendas, de propósito: é a meta a
 * bater, e ela não muda porque o dono trocou o intervalo na tela. Pagina pelo
 * mesmo motivo do `getStockTotals` (`max_rows` corta a resposta em 1.000) e
 * traz só as duas colunas que entram na conta.
 */
export async function getBestSalesDay(): Promise<SalesDayTotal | null> {
  const rows: { total: number; created_at: string }[] = []
  for (let page = 0; ; page++) {
    const from = page * SALES_PAGE_SIZE
    const { data, error } = await supabase
      .from('sales')
      .select('total, created_at')
      .eq('status', 'completed')
      .order('created_at')
      .range(from, from + SALES_PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as { total: number; created_at: string }[]
    rows.push(...batch)
    if (batch.length < SALES_PAGE_SIZE) break
  }
  return bestSalesDay(rows)
}

/**
 * Resumo de vendas concluídas entre `fromISO` e `toISO` (Branch 3). Traz cada
 * venda com seus itens (pro custo congelado) e delega a agregação a
 * `aggregateSales`.
 */
export async function getSalesSummary(fromISO: string, toISO: string): Promise<SalesSummary> {
  // Pagina em blocos de 500: sem isso um período com mais de 1.000 vendas
  // (o mês já passou disso) vinha cortado pelo `max_rows` e os KPIs saíam
  // baixos, em silêncio -- pendência registrada na decisão #51.
  const rows: SaleAggregateRow[] = []
  for (let page = 0; ; page++) {
    const from = page * SALES_SUMMARY_PAGE_SIZE
    const { data, error } = await supabase
      .from('sales')
      .select('total, created_at, channel, sale_items(quantity, cost_at_sale)')
      .eq('status', 'completed')
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .order('created_at')
      .order('id')
      .range(from, from + SALES_SUMMARY_PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as SaleAggregateRow[]
    rows.push(...batch)
    if (batch.length < SALES_SUMMARY_PAGE_SIZE) break
  }
  return aggregateSales(rows)
}

/**
 * Item 3 do pacote de melhorias no catálogo: taxa de acerto por fonte,
 * separada por nacional × importado, mais EANs inéditos/dia e % de cache
 * hit -- usado pra dimensionar os planos das APIs (CLAUDE.md).
 *
 * `catalog_lookup_log` grava uma linha por FONTE EFETIVAMENTE CONSULTADA,
 * não uma por lookup (ver migration 0006): um cache hit é sempre 1 linha
 * (source='cache'), mas um lookup que caiu na cascata externa pode gerar
 * várias linhas (uma por fonte tentada até resolver ou esgotar). Por isso
 * "consultas consumidas por API" é contagem direta de linhas por fonte
 * (é exatamente 1 linha = 1 chamada real), mas "EANs inéditos/dia" e "%
 * cache hit" contam EAN DISTINTO por dia entre as linhas não-cache, senão
 * um EAN que passou por 3 fontes no mesmo dia contaria como 3 consultas
 * novas.
 */
export async function getCatalogHitRateReport(days: number): Promise<CatalogHitRateReport> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  // Paginado (decisão #69): o log ganha ao menos uma linha por bipagem no
  // recebimento, e uma janela de 30 dias passa fácil de 1.000 linhas.
  const rows = await fetchAllPages<Pick<CatalogLookupLog, 'ean' | 'origin' | 'source' | 'outcome' | 'created_at'>>((from, to) =>
    supabase
      .from('catalog_lookup_log')
      .select('ean, origin, source, outcome, created_at')
      .gte('created_at', since)
      .order('created_at')
      .order('id')
      .range(from, to),
  )

  const bySourceOriginMap = new Map<string, CatalogSourceOriginStat>()
  for (const row of rows) {
    const key = `${row.source}|${row.origin ?? ''}`
    const stat = bySourceOriginMap.get(key) ?? {
      source: row.source,
      origin: row.origin,
      hits: 0,
      misses: 0,
      errors: 0,
    }
    if (row.outcome === 'hit') stat.hits++
    else if (row.outcome === 'miss') stat.misses++
    else stat.errors++
    bySourceOriginMap.set(key, stat)
  }
  const bySourceOrigin = [...bySourceOriginMap.values()].sort((a, b) =>
    a.source === b.source ? (a.origin ?? '').localeCompare(b.origin ?? '') : a.source.localeCompare(b.source),
  )

  const dailyMap = new Map<string, { cacheHits: number; cascadeEans: Set<string> }>()
  for (const row of rows) {
    const day = row.created_at.slice(0, 10)
    const bucket = dailyMap.get(day) ?? { cacheHits: 0, cascadeEans: new Set<string>() }
    if (row.source === 'cache') bucket.cacheHits++
    else bucket.cascadeEans.add(row.ean)
    dailyMap.set(day, bucket)
  }
  const daily = [...dailyMap.entries()]
    .map(([day, bucket]) => {
      const newEans = bucket.cascadeEans.size
      const totalEvents = bucket.cacheHits + newEans
      return {
        day,
        newEans,
        cacheHits: bucket.cacheHits,
        cacheHitPct: totalEvents > 0 ? (bucket.cacheHits / totalEvents) * 100 : 0,
      }
    })
    .sort((a, b) => b.day.localeCompare(a.day))

  return { bySourceOrigin, daily }
}

const HEALTH_SOURCES: { id: CatalogLookupSource; label: string }[] = [
  { id: 'cosmos', label: 'Cosmos' },
  { id: 'upcitemdb', label: 'UPCitemdb' },
  { id: 'openbeautyfacts', label: 'Open Beauty Facts' },
  { id: 'off', label: 'Open Food Facts' },
]
const HEALTH_ERROR_WINDOW_HOURS = 24
const HEALTH_ACTIVITY_WINDOW_DAYS = 7

/**
 * Painel de saúde das integrações de catálogo: status por fonte, derivado
 * de `catalog_lookup_log` (uma linha por fonte efetivamente consultada, ver
 * migration 0006) -- `erro_recente` se houve `outcome='error'` nas últimas
 * 24h, `sem_atividade` se não há nenhuma consulta nos últimos 7 dias, senão
 * `operacional`. O Mercado Livre não entra nessa consulta: a via automática
 * foi encerrada (CLAUDE.md decisão #22), então não há mais linhas dele em
 * `catalog_lookup_log` -- aparece com status estático `acesso_restrito`,
 * deliberadamente distinto de `erro_recente` pra não parecer uma falha de
 * infra (é bloqueio de política do ML, não um problema no nosso lado).
 */
export async function getIntegrationHealth(): Promise<IntegrationHealth[]> {
  const since = new Date(Date.now() - HEALTH_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  // Paginado (decisão #69): 7 dias de log passam de 1.000 linhas.
  const rows = await fetchAllPages<Pick<CatalogLookupLog, 'source' | 'outcome' | 'error_detail' | 'created_at'>>((from, to) =>
    supabase
    .from('catalog_lookup_log')
    .select('source, outcome, error_detail, created_at')
    .in(
      'source',
      HEALTH_SOURCES.map((s) => s.id),
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to),
  )
  const errorSince = new Date(Date.now() - HEALTH_ERROR_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const catalogSourcesHealth: IntegrationHealth[] = HEALTH_SOURCES.map(({ id, label }) => {
    const sourceRows = rows.filter((r) => r.source === id)
    if (sourceRows.length === 0) {
      return {
        id,
        label,
        status: 'sem_atividade',
        detail: `Sem consultas nos últimos ${HEALTH_ACTIVITY_WINDOW_DAYS} dias`,
        lastEventAt: null,
      }
    }
    const lastEventAt = sourceRows[0].created_at
    const recentError = sourceRows.find((r) => r.outcome === 'error' && r.created_at >= errorSince)
    if (recentError) {
      return {
        id,
        label,
        status: 'erro_recente',
        detail: recentError.error_detail ?? 'Erro de infra recente',
        lastEventAt,
      }
    }
    return { id, label, status: 'operacional', detail: 'Respondendo normalmente', lastEventAt }
  })

  return [
    ...catalogSourcesHealth,
    {
      id: 'mercadolivre',
      label: 'Mercado Livre',
      status: 'acesso_restrito',
      detail:
        'Busca de produtos bloqueada por política do ML mesmo autenticado (decisão #22) -- via automática encerrada, infra OAuth pronta aguardando parceria',
      lastEventAt: null,
    },
  ]
}
