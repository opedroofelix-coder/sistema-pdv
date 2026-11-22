import { supabase } from './supabaseClient'
import type {
  CashMovement,
  CashMovementType,
  CashSession,
  PaymentMethod,
  PaymentSplit,
} from './types'

/**
 * Sessão aberta DESTE operador (decisão #53). Antes não havia filtro por
 * operador porque o banco só permitia uma sessão aberta na loja inteira
 * (índice global, `0003_pdv.sql`); agora é uma por pessoa
 * (`cash_sessions_one_open_per_cashier_idx`, migration 0017), então sem o
 * filtro o PDV pegaria o caixa de outro.
 */
export async function getOpenSession(cashierId: string): Promise<CashSession | null> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .is('closed_at', null)
    .eq('cashier_id', cashierId)
    .maybeSingle()
  if (error) throw error
  return data as CashSession | null
}

/** Sessão aberta com o nome de quem abriu -- só o dono usa, pra enxergar (e
 * fechar) o caixa dos outros operadores. */
export interface OpenSessionWithCashier extends CashSession {
  cashier_name: string | null
}

/**
 * Todas as sessões abertas, com o nome do operador. Usado só pelo dono
 * (decisão do dono: caixa esquecido aberto precisa de alguém que consiga
 * fechar). O `close_cash_session` revalida o papel no servidor -- esconder a
 * lista não seria proteção, já que a RLS é aberta (decisão #25).
 */
export async function listOpenSessions(): Promise<OpenSessionWithCashier[]> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*, cashier:profiles!cash_sessions_cashier_id_fkey(full_name)')
    .is('closed_at', null)
    .order('opened_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as (CashSession & { cashier: { full_name: string | null } | null })[]
  return rows.map(({ cashier, ...session }) => ({
    ...session,
    cashier_name: cashier?.full_name ?? null,
  }))
}

export async function openSession(input: {
  cashier_id: string
  opening_amount: number
}): Promise<CashSession> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .insert(input)
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe um caixa aberto.')
    }
    throw error
  }
  return data as CashSession
}

export async function closeSession(
  sessionId: string,
  closingAmount: number,
): Promise<CashSession> {
  const { data, error } = await supabase
    .rpc('close_cash_session', {
      p_session_id: sessionId,
      p_closing_amount: closingAmount,
    })
    // Sem limite, uma conexão instável deixava o modal preso em "Fechando…"
    // pra sempre. Repetir depois de um timeout é seguro: se o primeiro pedido
    // chegou a fechar, o segundo volta "Sessão já estava fechada", que a tela
    // trata como fechado (CloseSessionModal).
    .abortSignal(AbortSignal.timeout(CLOSE_TIMEOUT_MS))
  if (error) throw error
  return data as CashSession
}

const CLOSE_TIMEOUT_MS = 15000

/** Texto do `raise exception` de `close_cash_session` (0018) quando a sessão
 * já tinha sido fechada -- pelo dono em "Outros caixas abertos", em outro
 * aparelho, ou por um pedido anterior que deu timeout mas chegou ao banco. */
export const SESSION_ALREADY_CLOSED = 'Sessão já estava fechada'

export async function addCashMovement(input: {
  session_id: string
  type: CashMovementType
  amount: number
  reason?: string
}): Promise<CashMovement> {
  const { data, error } = await supabase.from('cash_movements').insert(input).select().single()
  if (error) throw error
  return data as CashMovement
}

export async function listSessionMovements(sessionId: string): Promise<CashMovement[]> {
  const { data, error } = await supabase
    .from('cash_movements')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CashMovement[]
}

// ---------------------------------------------------------------------------
// Relatório de fechamento de caixa (tela só-dono /fechamentos): recalculado das
// tabelas, sem snapshot -- os números de reconciliação já ficam congelados no
// `cash_sessions` no fechamento (`close_cash_session`, 0018). "Guardar 7 dias" =
// a tela só mostra fechamentos recentes; nada de caixa é apagado.
// ---------------------------------------------------------------------------

/** Um fechamento de caixa já reconciliado, pronto pra exibir. */
export interface CashCloseReport {
  session_id: string
  cashier_name: string | null
  opened_at: string
  closed_at: string
  opening_amount: number
  expected_amount: number
  closing_amount: number
  /** contado − esperado: positivo = sobra, negativo = falta, 0 = caixa certo. */
  difference: number
  sales_count: number
  sales_revenue: number
  /** Vendas por forma de pagamento (só as com valor), ordem canônica. */
  payments: PaymentSplit[]
  sangria_total: number
  suprimento_total: number
}

/** Linhas cruas que alimentam o `buildCashCloseReports` (puro, testável). */
export interface ClosedSessionRow {
  id: string
  cashier_name: string | null
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  expected_amount: number | null
}
export interface SessionMovementRow {
  session_id: string
  type: CashMovementType
  amount: number
}
export interface SessionSaleRow {
  session_id: string | null
  total: number
}
export interface SessionPaymentRow {
  session_id: string | null
  method: PaymentMethod
  amount: number
}

/** Ordem de exibição das formas no relatório (dinheiro primeiro). */
const METHOD_ORDER: PaymentMethod[] = ['dinheiro', 'pix', 'credito', 'debito']

/**
 * Monta os relatórios de fechamento a partir das linhas cruas. Pura, pra ser
 * testável sem banco. Preserva a ordem das sessões recebidas (a consulta já
 * ordena por `closed_at` desc).
 */
export function buildCashCloseReports(
  sessions: ClosedSessionRow[],
  movements: SessionMovementRow[],
  sales: SessionSaleRow[],
  payments: SessionPaymentRow[],
): CashCloseReport[] {
  const salesBySession = new Map<string, { count: number; revenue: number }>()
  for (const s of sales) {
    if (!s.session_id) continue
    const cur = salesBySession.get(s.session_id) ?? { count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += s.total
    salesBySession.set(s.session_id, cur)
  }

  const payBySession = new Map<string, Map<PaymentMethod, number>>()
  for (const p of payments) {
    if (!p.session_id) continue
    const byMethod = payBySession.get(p.session_id) ?? new Map<PaymentMethod, number>()
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
    payBySession.set(p.session_id, byMethod)
  }

  const movBySession = new Map<string, { sangria: number; suprimento: number }>()
  for (const m of movements) {
    const cur = movBySession.get(m.session_id) ?? { sangria: 0, suprimento: 0 }
    if (m.type === 'sangria') cur.sangria += m.amount
    else cur.suprimento += m.amount
    movBySession.set(m.session_id, cur)
  }

  return sessions
    .filter((s) => s.closed_at != null)
    .map((s) => {
      const sale = salesBySession.get(s.id) ?? { count: 0, revenue: 0 }
      const mov = movBySession.get(s.id) ?? { sangria: 0, suprimento: 0 }
      const byMethod = payBySession.get(s.id)
      const paymentTotals: PaymentSplit[] = byMethod
        ? METHOD_ORDER.filter((m) => (byMethod.get(m) ?? 0) > 0).map((method) => ({
            method,
            amount: byMethod.get(method) as number,
          }))
        : []
      const closing = s.closing_amount ?? 0
      const expected = s.expected_amount ?? 0
      return {
        session_id: s.id,
        cashier_name: s.cashier_name,
        opened_at: s.opened_at,
        closed_at: s.closed_at as string,
        opening_amount: s.opening_amount,
        expected_amount: expected,
        closing_amount: closing,
        difference: closing - expected,
        sales_count: sale.count,
        sales_revenue: sale.revenue,
        payments: paymentTotals,
        sangria_total: mov.sangria,
        suprimento_total: mov.suprimento,
      }
    })
}

const CLOSE_REPORT_PAGE = 1000

/** `sales` completas das sessões, paginando (o `max_rows`=1000 cortaria uma
 * semana muito movimentada -- mesmo cuidado do `getStockTotals`). */
async function fetchSessionSales(ids: string[]): Promise<SessionSaleRow[]> {
  const rows: SessionSaleRow[] = []
  for (let page = 0; ; page++) {
    const from = page * CLOSE_REPORT_PAGE
    const { data, error } = await supabase
      .from('sales')
      .select('session_id, total')
      .eq('status', 'completed')
      .in('session_id', ids)
      .order('id')
      .range(from, from + CLOSE_REPORT_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as SessionSaleRow[]
    rows.push(...batch)
    if (batch.length < CLOSE_REPORT_PAGE) break
  }
  return rows
}

/** `sale_payments` das sessões (join `sales` pra chegar no `session_id`),
 * paginando pelo mesmo motivo. */
async function fetchSessionPayments(ids: string[]): Promise<SessionPaymentRow[]> {
  const rows: SessionPaymentRow[] = []
  for (let page = 0; ; page++) {
    const from = page * CLOSE_REPORT_PAGE
    const { data, error } = await supabase
      .from('sale_payments')
      .select('method, amount, sales!inner(session_id, status)')
      .eq('sales.status', 'completed')
      .in('sales.session_id', ids)
      .order('id')
      .range(from, from + CLOSE_REPORT_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as unknown as {
      method: PaymentMethod
      amount: number
      sales: { session_id: string | null } | null
    }[]
    for (const r of batch) {
      rows.push({ session_id: r.sales?.session_id ?? null, method: r.method, amount: r.amount })
    }
    if (batch.length < CLOSE_REPORT_PAGE) break
  }
  return rows
}

/**
 * Fechamentos de caixa dos últimos `days` dias (qualquer operador), pro dono
 * acompanhar em `/fechamentos`. Busca as sessões fechadas + movimentos + vendas
 * + pagamentos e reconcilia no cliente (`buildCashCloseReports`).
 */
export async function getRecentCashCloses(days = 7): Promise<CashCloseReport[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: sessionsData, error: sessErr } = await supabase
    .from('cash_sessions')
    .select('*, cashier:profiles!cash_sessions_cashier_id_fkey(full_name)')
    .not('closed_at', 'is', null)
    .gte('closed_at', since)
    .order('closed_at', { ascending: false })
  if (sessErr) throw sessErr

  const sessions: ClosedSessionRow[] = (
    (sessionsData ?? []) as (CashSession & { cashier: { full_name: string | null } | null })[]
  ).map(({ cashier, ...s }) => ({
    id: s.id,
    cashier_name: cashier?.full_name ?? null,
    opened_at: s.opened_at,
    closed_at: s.closed_at,
    opening_amount: s.opening_amount,
    closing_amount: s.closing_amount,
    expected_amount: s.expected_amount,
  }))

  const ids = sessions.map((s) => s.id)
  if (ids.length === 0) return []

  const [movementsData, sales, payments] = await Promise.all([
    supabase.from('cash_movements').select('session_id, type, amount').in('session_id', ids),
    fetchSessionSales(ids),
    fetchSessionPayments(ids),
  ])
  if (movementsData.error) throw movementsData.error

  return buildCashCloseReports(
    sessions,
    (movementsData.data ?? []) as SessionMovementRow[],
    sales,
    payments,
  )
}
