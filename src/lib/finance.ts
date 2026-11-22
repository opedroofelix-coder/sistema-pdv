/**
 * Módulo financeiro (decisão #72, `/financeiro`, só dono).
 *
 * Duas réguas diferentes, que não se misturam:
 *  - **DRE (lucro do mês)**, por competência: venda conta no dia da venda pelo
 *    valor bruto; compra de lote NÃO é despesa (vira estoque e entra pelo CMV
 *    conforme vende); despesa conta no mês a que se refere.
 *  - **Fluxo de caixa**, pelo dinheiro: venda conta no dia em que cai na conta
 *    (dia da venda + prazo da forma), já sem a taxa; compra de lote é saída no
 *    dia da compra; despesa é saída no dia em que foi paga.
 *
 * Sangria/suprimento ficam fora dos dois: é dinheiro mudando de lugar, não
 * entrando nem saindo da empresa.
 *
 * As contas são feitas em **centavos inteiros** (lição da decisão #53: em
 * ponto flutuante 100 − 33,33 × 3 não dá 0,01).
 */
import { supabase } from './supabaseClient'
import { fetchAllPages } from './paginate'
import type { RecordedPaymentMethod } from './types'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type FeeMethod = RecordedPaymentMethod

export const FEE_METHODS: FeeMethod[] = ['dinheiro', 'pix', 'debito', 'credito', 'online']

export const FEE_METHOD_LABEL: Record<FeeMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  online: 'Site (Nuvemshop)',
}

export type ExpensePaidMethod = 'dinheiro' | 'pix' | 'cartao' | 'boleto' | 'transferencia'

export const EXPENSE_PAID_METHOD_LABEL: Record<ExpensePaidMethod, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
}

export interface FeeRate {
  id: string
  method: FeeMethod
  fee_percent: number
  settle_days: number
  /** YYYY-MM-DD */
  valid_from: string
}

export interface FinanceCategory {
  id: string
  name: string
  active: boolean
}

export interface FinanceRecurring {
  id: string
  description: string
  category_id: string | null
  amount: number
  day_of_month: number
  start_month: string
  end_month: string | null
  last_generated_month: string | null
  active: boolean
}

export interface FinanceExpense {
  id: string
  description: string
  category_id: string | null
  amount: number
  /** Dia 1 do mês a que a despesa se refere (YYYY-MM-01). */
  competence_month: string
  due_date: string
  paid_at: string | null
  paid_method: ExpensePaidMethod | null
  recurring_id: string | null
  notes: string | null
  created_at: string
}

export interface FinanceSettings {
  opening_balance: number
  opening_date: string | null
}

// ---------------------------------------------------------------------------
// Datas (YYYY-MM-DD, sempre no fuso local -- mesma regra de reports.ts)
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Data local de um timestamp (venda à noite não cai no dia seguinte). */
export function localDateKey(iso: string): string {
  return dateKeyOf(new Date(iso))
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, days: number): string {
  const d = parseKey(key)
  d.setDate(d.getDate() + days)
  return dateKeyOf(d)
}

export function todayKey(): string {
  return dateKeyOf(new Date())
}

/** `{ from, to }` do mês (`month` = qualquer data YYYY-MM-DD dentro dele). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` }
}

/** Primeiro dia do mês deslocado em `delta` meses. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return dateKeyOf(d)
}

export function monthLabel(month: string): string {
  const label = parseKey(monthRange(month).from).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Limites ISO (UTC) do intervalo de dias locais [from, to]. */
function isoBounds(from: string, to: string): { fromISO: string; toISO: string } {
  return {
    fromISO: new Date(`${from}T00:00:00`).toISOString(),
    toISO: new Date(`${to}T23:59:59.999`).toISOString(),
  }
}

const toCents = (v: number) => Math.round(Number(v) * 100)
const fromCents = (c: number) => c / 100

// ---------------------------------------------------------------------------
// Taxas
// ---------------------------------------------------------------------------

/** Taxa/prazo vigente da forma na data: a linha com maior `valid_from <= date`.
 * Sem linha (não deveria acontecer -- a migration semeia todas), 0% em D+0. */
export function rateFor(
  rates: FeeRate[],
  method: FeeMethod,
  date: string,
): { fee_percent: number; settle_days: number } {
  let best: FeeRate | null = null
  for (const r of rates) {
    if (r.method !== method || r.valid_from > date) continue
    if (!best || r.valid_from > best.valid_from) best = r
  }
  return best
    ? { fee_percent: Number(best.fee_percent), settle_days: Number(best.settle_days) }
    : { fee_percent: 0, settle_days: 0 }
}

/** Taxa em centavos de uma parcela de pagamento. */
function feeCents(amountCents: number, feePercent: number): number {
  return Math.round((amountCents * feePercent) / 100)
}

// ---------------------------------------------------------------------------
// Status de uma conta
// ---------------------------------------------------------------------------

export type ExpenseStatus = 'paga' | 'vencida' | 'vence_em_breve' | 'em_aberto'

export const DUE_SOON_DAYS = 7

export function expenseStatus(
  e: Pick<FinanceExpense, 'paid_at' | 'due_date'>,
  today: string,
): ExpenseStatus {
  if (e.paid_at) return 'paga'
  if (e.due_date < today) return 'vencida'
  if (e.due_date <= addDays(today, DUE_SOON_DAYS)) return 'vence_em_breve'
  return 'em_aberto'
}

/** Dias entre duas datas (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

export interface DreSaleRow {
  total: number
  created_at: string
  sale_items: { quantity: number; cost_at_sale: number }[] | null
}

export interface DrePaymentRow {
  method: FeeMethod
  amount: number
  /** created_at da venda */
  created_at: string
}

export interface DreExpenseRow {
  amount: number
  category_name: string | null
}

export interface Dre {
  salesCount: number
  revenue: number
  fees: number
  netRevenue: number
  cmv: number
  grossProfit: number
  expensesByCategory: { name: string; amount: number }[]
  expensesTotal: number
  netProfit: number
  /** lucro líquido ÷ faturamento (0..1); null sem faturamento */
  netMargin: number | null
}

export function buildDre(input: {
  sales: DreSaleRow[]
  payments: DrePaymentRow[]
  expenses: DreExpenseRow[]
  rates: FeeRate[]
}): Dre {
  let revenue = 0
  let cmv = 0
  for (const s of input.sales) {
    revenue += toCents(s.total)
    for (const it of s.sale_items ?? []) cmv += toCents(it.cost_at_sale) * it.quantity
  }

  let fees = 0
  for (const p of input.payments) {
    const { fee_percent } = rateFor(input.rates, p.method, localDateKey(p.created_at))
    fees += feeCents(toCents(p.amount), fee_percent)
  }

  const byCat = new Map<string, number>()
  let expensesTotal = 0
  for (const e of input.expenses) {
    const name = e.category_name ?? 'Sem categoria'
    const c = toCents(e.amount)
    byCat.set(name, (byCat.get(name) ?? 0) + c)
    expensesTotal += c
  }

  const netRevenue = revenue - fees
  const grossProfit = netRevenue - cmv
  const netProfit = grossProfit - expensesTotal

  return {
    salesCount: input.sales.length,
    revenue: fromCents(revenue),
    fees: fromCents(fees),
    netRevenue: fromCents(netRevenue),
    cmv: fromCents(cmv),
    grossProfit: fromCents(grossProfit),
    expensesByCategory: [...byCat.entries()]
      .map(([name, c]) => ({ name, amount: fromCents(c) }))
      .sort((a, b) => b.amount - a.amount),
    expensesTotal: fromCents(expensesTotal),
    netProfit: fromCents(netProfit),
    netMargin: revenue > 0 ? netProfit / revenue : null,
  }
}

// ---------------------------------------------------------------------------
// Fluxo de caixa
// ---------------------------------------------------------------------------

export interface CashFlowExpenseRow {
  description: string
  amount: number
  due_date: string
  paid_at: string | null
}

export interface CashFlowLotRow {
  supplier: string | null
  purchase_value: number
  purchase_date: string
}

export interface CashFlowDay {
  date: string
  inflow: number
  outflow: number
  /** saldo acumulado no fim do dia */
  balance: number
  /** dia futuro ou com algum valor ainda não realizado */
  forecast: boolean
  labels: string[]
}

export interface CashFlowWeek {
  label: string
  inRealized: number
  inForecast: number
  outRealized: number
  outForecast: number
}

export interface CashFlow {
  /** Saldo no começo de `from`; null quando o saldo inicial não foi definido. */
  startBalance: number | null
  days: CashFlowDay[]
  weeks: CashFlowWeek[]
  realizedIn: number
  realizedOut: number
  forecastIn: number
  forecastOut: number
  endBalance: number
}

interface FlowEvent {
  date: string
  cents: number // + entrada, − saída
  forecast: boolean
  label: string
}

/**
 * Monta o fluxo de caixa de [from, to].
 *
 * - Venda: entra em `dia da venda + settle_days`, líquida da taxa.
 * - Despesa paga: sai em `paid_at`. Em aberto: sai prevista no vencimento --
 *   ou hoje, se já venceu (é dinheiro que precisa sair agora).
 * - Lote: sai em `purchase_date`.
 *
 * Com saldo inicial definido (`openingDate`), tudo que aconteceu entre ele e
 * `from` vira o saldo de partida; antes dele é ignorado (já está no saldo
 * informado). Sem saldo inicial, o período parte de zero.
 */
export function buildCashFlow(input: {
  payments: DrePaymentRow[]
  rates: FeeRate[]
  expenses: CashFlowExpenseRow[]
  lots: CashFlowLotRow[]
  openingBalance: number
  openingDate: string | null
  from: string
  to: string
  today: string
}): CashFlow {
  const { from, to, today, openingDate } = input
  const events: FlowEvent[] = []

  const byMethodDay = new Map<string, number>()
  for (const p of input.payments) {
    const saleDay = localDateKey(p.created_at)
    const { fee_percent, settle_days } = rateFor(input.rates, p.method, saleDay)
    const gross = toCents(p.amount)
    const date = addDays(saleDay, settle_days)
    const key = `${date}|${p.method}`
    byMethodDay.set(key, (byMethodDay.get(key) ?? 0) + gross - feeCents(gross, fee_percent))
  }
  for (const [key, cents] of byMethodDay) {
    const [date, method] = key.split('|') as [string, FeeMethod]
    events.push({
      date,
      cents,
      forecast: date > today,
      label: `Vendas (${FEE_METHOD_LABEL[method]})`,
    })
  }

  for (const e of input.expenses) {
    if (e.paid_at) {
      events.push({ date: e.paid_at, cents: -toCents(e.amount), forecast: e.paid_at > today, label: e.description })
    } else {
      const date = e.due_date < today ? today : e.due_date
      events.push({ date, cents: -toCents(e.amount), forecast: true, label: `${e.description} (em aberto)` })
    }
  }

  for (const l of input.lots) {
    events.push({
      date: l.purchase_date,
      cents: -toCents(l.purchase_value),
      forecast: l.purchase_date > today,
      label: `Lote — ${l.supplier?.trim() || 'sem fornecedor'}`,
    })
  }

  // Saldo de partida.
  let balance = 0
  const hasOpening = openingDate !== null
  if (hasOpening) {
    balance = toCents(input.openingBalance)
    for (const ev of events) {
      if (ev.date >= openingDate && ev.date < from) balance += ev.cents
    }
  }
  const startBalance = hasOpening ? fromCents(balance) : null

  const inPeriod = events
    .filter((ev) => ev.date >= from && ev.date <= to && (!hasOpening || ev.date >= openingDate))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cents < b.cents ? 1 : -1))

  const days: CashFlowDay[] = []
  let realizedIn = 0
  let realizedOut = 0
  let forecastIn = 0
  let forecastOut = 0
  const dayMap = new Map<string, { inflow: number; outflow: number; forecast: boolean; labels: string[] }>()
  for (const ev of inPeriod) {
    const d = dayMap.get(ev.date) ?? { inflow: 0, outflow: 0, forecast: ev.date > today, labels: [] }
    if (ev.cents >= 0) d.inflow += ev.cents
    else d.outflow += -ev.cents
    if (ev.forecast) d.forecast = true
    if (!d.labels.includes(ev.label)) d.labels.push(ev.label)
    dayMap.set(ev.date, d)

    if (ev.cents >= 0) {
      if (ev.forecast) forecastIn += ev.cents
      else realizedIn += ev.cents
    } else if (ev.forecast) forecastOut += -ev.cents
    else realizedOut += -ev.cents
  }
  for (const [date, d] of [...dayMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    balance += d.inflow - d.outflow
    days.push({
      date,
      inflow: fromCents(d.inflow),
      outflow: fromCents(d.outflow),
      balance: fromCents(balance),
      forecast: d.forecast,
      labels: d.labels,
    })
  }

  // Semanas do período (blocos de 7 dias a partir de `from`), pro gráfico.
  const weeks: CashFlowWeek[] = []
  for (let start = from; start <= to; start = addDays(start, 7)) {
    const endRaw = addDays(start, 6)
    const end = endRaw > to ? to : endRaw
    const w = { inR: 0, inF: 0, outR: 0, outF: 0 }
    for (const ev of inPeriod) {
      if (ev.date < start || ev.date > end) continue
      if (ev.cents >= 0) {
        if (ev.forecast) w.inF += ev.cents
        else w.inR += ev.cents
      } else if (ev.forecast) w.outF += -ev.cents
      else w.outR += -ev.cents
    }
    weeks.push({
      label: `${start.slice(8, 10)}–${end.slice(8, 10)}`,
      inRealized: fromCents(w.inR),
      inForecast: fromCents(w.inF),
      outRealized: fromCents(w.outR),
      outForecast: fromCents(w.outF),
    })
  }

  return {
    startBalance,
    days,
    weeks,
    realizedIn: fromCents(realizedIn),
    realizedOut: fromCents(realizedOut),
    forecastIn: fromCents(forecastIn),
    forecastOut: fromCents(forecastOut),
    endBalance: fromCents(balance),
  }
}

// ---------------------------------------------------------------------------
// Leitura e gravação (Supabase)
// ---------------------------------------------------------------------------

/** Gera as contas das despesas fixas até o fim do mês seguinte. */
export async function generateRecurring(): Promise<number> {
  const until = monthRange(shiftMonth(todayKey(), 1)).to
  const { data, error } = await supabase.rpc('finance_generate_recurring', { p_until: until })
  if (error) throw error
  return (data as number) ?? 0
}

export async function listCategories(): Promise<FinanceCategory[]> {
  const { data, error } = await supabase.from('finance_categories').select('id, name, active').order('name')
  if (error) throw error
  return (data ?? []) as FinanceCategory[]
}

export async function createCategory(name: string): Promise<FinanceCategory> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Informe o nome da categoria.')
  const { data, error } = await supabase
    .from('finance_categories')
    .insert({ name: trimmed })
    .select('id, name, active')
    .single()
  if (error) throw error
  return data as FinanceCategory
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('finance_categories').update({ active }).eq('id', id)
  if (error) throw error
}

export async function listFeeRates(): Promise<FeeRate[]> {
  const { data, error } = await supabase
    .from('finance_fee_rates')
    .select('id, method, fee_percent, settle_days, valid_from')
    .order('valid_from')
  if (error) throw error
  return (data ?? []) as FeeRate[]
}

/** Grava novas taxas valendo a partir de `validFrom` (upsert por forma+data). */
export async function saveFeeRates(
  rows: { method: FeeMethod; fee_percent: number; settle_days: number }[],
  validFrom: string,
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase
    .from('finance_fee_rates')
    .upsert(
      rows.map((r) => ({ ...r, valid_from: validFrom })),
      { onConflict: 'method,valid_from' },
    )
  if (error) throw error
}

export async function getSettings(): Promise<FinanceSettings> {
  const { data, error } = await supabase
    .from('finance_settings')
    .select('opening_balance, opening_date')
    .maybeSingle()
  if (error) throw error
  return (data as FinanceSettings | null) ?? { opening_balance: 0, opening_date: null }
}

export async function saveSettings(s: FinanceSettings): Promise<void> {
  const { error } = await supabase
    .from('finance_settings')
    .update({ ...s, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) throw error
}

export async function listRecurring(): Promise<FinanceRecurring[]> {
  const { data, error } = await supabase.from('finance_recurring').select('*').order('day_of_month')
  if (error) throw error
  return (data ?? []) as FinanceRecurring[]
}

export async function updateRecurring(
  id: string,
  patch: Partial<Pick<FinanceRecurring, 'description' | 'category_id' | 'amount' | 'day_of_month' | 'active'>>,
): Promise<void> {
  const { error } = await supabase.from('finance_recurring').update(patch).eq('id', id)
  if (error) throw error
}

export interface ExpenseInput {
  description: string
  category_id: string | null
  amount: number
  competence_month: string
  due_date: string
  paid_at: string | null
  paid_method: ExpensePaidMethod | null
  notes?: string | null
}

function validateExpense(input: ExpenseInput): void {
  if (!input.description.trim()) throw new Error('Informe a descrição.')
  if (!(input.amount > 0)) throw new Error('Informe um valor maior que zero.')
  if (!input.due_date) throw new Error('Informe o vencimento.')
}

/**
 * Cria uma despesa. Com `repeatMonthly`, cria também o molde da despesa fixa
 * (vencimento no mesmo dia, todo mês) e liga a conta deste mês a ele -- os
 * meses seguintes saem de `generateRecurring`.
 */
export async function createExpense(input: ExpenseInput, repeatMonthly = false): Promise<void> {
  validateExpense(input)
  const competence = monthRange(input.competence_month).from
  let recurringId: string | null = null
  if (repeatMonthly) {
    const day = Math.min(Number(input.due_date.slice(8, 10)), 28)
    const { data, error } = await supabase
      .from('finance_recurring')
      .insert({
        description: input.description.trim(),
        category_id: input.category_id,
        amount: input.amount,
        day_of_month: day,
        start_month: competence,
        last_generated_month: competence,
      })
      .select('id')
      .single()
    if (error) throw error
    recurringId = (data as { id: string }).id
  }
  const { error } = await supabase.from('finance_expenses').insert({
    ...input,
    description: input.description.trim(),
    competence_month: competence,
    recurring_id: recurringId,
  })
  if (error) throw error
  if (repeatMonthly) await generateRecurring()
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  validateExpense(input)
  const { error } = await supabase
    .from('finance_expenses')
    .update({
      ...input,
      description: input.description.trim(),
      competence_month: monthRange(input.competence_month).from,
    })
    .eq('id', id)
  if (error) throw error
}

export async function markExpensePaid(
  id: string,
  paidAt: string | null,
  method: ExpensePaidMethod | null,
): Promise<void> {
  const { error } = await supabase
    .from('finance_expenses')
    .update({ paid_at: paidAt, paid_method: paidAt ? method : null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('finance_expenses').delete().eq('id', id)
  if (error) throw error
}

const EXPENSE_COLUMNS =
  'id, description, category_id, amount, competence_month, due_date, paid_at, paid_method, recurring_id, notes, created_at'

/**
 * Contas da tela "Contas a pagar" no mês: as do próprio mês + as em aberto de
 * meses anteriores (conta vencida não some só porque o mês virou).
 */
export async function listExpensesForMonth(month: string): Promise<FinanceExpense[]> {
  const m = monthRange(month).from
  return fetchAllPages<FinanceExpense>((from, to) =>
    supabase
      .from('finance_expenses')
      .select(EXPENSE_COLUMNS)
      .or(`competence_month.eq.${m},and(paid_at.is.null,competence_month.lt.${m})`)
      .order('due_date')
      .order('id')
      .range(from, to),
  )
}

/** Contas em aberto que vencem até `until` (alerta do Resumo). */
export async function listOpenExpensesDueBy(until: string): Promise<FinanceExpense[]> {
  return fetchAllPages<FinanceExpense>((from, to) =>
    supabase
      .from('finance_expenses')
      .select(EXPENSE_COLUMNS)
      .is('paid_at', null)
      .lte('due_date', until)
      .order('due_date')
      .order('id')
      .range(from, to),
  )
}

/** Pagamentos de vendas concluídas cuja VENDA caiu em [from, to]. */
async function fetchPayments(from: string, to: string): Promise<DrePaymentRow[]> {
  const { fromISO, toISO } = isoBounds(from, to)
  const rows = await fetchAllPages<{
    method: FeeMethod
    amount: number
    sales: { created_at: string } | null
  }>((a, b) =>
    supabase
      .from('sale_payments')
      .select('method, amount, sales!inner(created_at, status)')
      .eq('sales.status', 'completed')
      .gte('sales.created_at', fromISO)
      .lte('sales.created_at', toISO)
      .order('id')
      .range(a, b),
  )
  return rows
    .filter((r) => r.sales)
    .map((r) => ({ method: r.method, amount: Number(r.amount), created_at: r.sales!.created_at }))
}

export async function getDre(month: string, categories: FinanceCategory[]): Promise<Dre> {
  const { from, to } = monthRange(month)
  const { fromISO, toISO } = isoBounds(from, to)
  const [sales, payments, expenses, rates] = await Promise.all([
    fetchAllPages<DreSaleRow>((a, b) =>
      supabase
        .from('sales')
        .select('total, created_at, sale_items(quantity, cost_at_sale)')
        .eq('status', 'completed')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at')
        .order('id')
        .range(a, b),
    ),
    fetchPayments(from, to),
    fetchAllPages<{ amount: number; category_id: string | null }>((a, b) =>
      supabase
        .from('finance_expenses')
        .select('amount, category_id')
        .eq('competence_month', from)
        .order('id')
        .range(a, b),
    ),
    listFeeRates(),
  ])
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  return buildDre({
    sales,
    payments,
    rates,
    expenses: expenses.map((e) => ({
      amount: Number(e.amount),
      category_name: e.category_id ? (catName.get(e.category_id) ?? null) : null,
    })),
  })
}

export async function getCashFlow(month: string): Promise<CashFlow> {
  const { from, to } = monthRange(month)
  const [settings, rates] = await Promise.all([getSettings(), listFeeRates()])
  const openingDate = settings.opening_date

  // Começo da busca: o saldo inicial (se anterior ao mês) ou o próprio mês;
  // recua o maior prazo de recebimento pra pegar a venda de crédito do mês
  // anterior que cai neste.
  const maxSettle = rates.reduce((m, r) => Math.max(m, Number(r.settle_days)), 0)
  const base = openingDate && openingDate < from ? openingDate : from
  const fetchFrom = addDays(base, -maxSettle)
  const eventsFrom = openingDate && openingDate < from ? openingDate : from

  const [payments, paid, open, lots] = await Promise.all([
    fetchPayments(fetchFrom, to),
    fetchAllPages<CashFlowExpenseRow>((a, b) =>
      supabase
        .from('finance_expenses')
        .select('description, amount, due_date, paid_at')
        .gte('paid_at', eventsFrom)
        .lte('paid_at', to)
        .order('id')
        .range(a, b),
    ),
    fetchAllPages<CashFlowExpenseRow>((a, b) =>
      supabase
        .from('finance_expenses')
        .select('description, amount, due_date, paid_at')
        .is('paid_at', null)
        .lte('due_date', to)
        .order('id')
        .range(a, b),
    ),
    fetchAllPages<CashFlowLotRow>((a, b) =>
      supabase
        .from('lots')
        .select('supplier, purchase_value, purchase_date')
        .gte('purchase_date', eventsFrom)
        .lte('purchase_date', to)
        .order('id')
        .range(a, b),
    ),
  ])

  return buildCashFlow({
    payments,
    rates,
    expenses: [...paid, ...open].map((e) => ({ ...e, amount: Number(e.amount) })),
    lots: lots.map((l) => ({ ...l, purchase_value: Number(l.purchase_value) })),
    openingBalance: Number(settings.opening_balance),
    openingDate,
    from,
    to,
    today: todayKey(),
  })
}
