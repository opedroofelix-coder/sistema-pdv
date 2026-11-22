import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import {
  addDays,
  buildCashFlow,
  buildDre,
  expenseStatus,
  monthRange,
  rateFor,
  shiftMonth,
  type FeeRate,
} from './finance'

/** Meio-dia local: o dia não muda com o fuso de quem roda o teste. */
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString()

const BASE_RATES: FeeRate[] = [
  { id: '1', method: 'dinheiro', fee_percent: 0, settle_days: 0, valid_from: '2000-01-01' },
  { id: '2', method: 'pix', fee_percent: 0, settle_days: 0, valid_from: '2000-01-01' },
  { id: '3', method: 'debito', fee_percent: 1, settle_days: 1, valid_from: '2000-01-01' },
  { id: '4', method: 'credito', fee_percent: 3, settle_days: 30, valid_from: '2000-01-01' },
  { id: '5', method: 'online', fee_percent: 5, settle_days: 14, valid_from: '2000-01-01' },
]

describe('datas', () => {
  it('monthRange e shiftMonth atravessam o ano', () => {
    expect(monthRange('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(addDays('2026-10-03', 30)).toBe('2026-11-02')
  })
})

describe('rateFor', () => {
  it('usa a taxa vigente na data, sem reescrever o passado', () => {
    const rates: FeeRate[] = [
      ...BASE_RATES,
      { id: '6', method: 'credito', fee_percent: 4, settle_days: 2, valid_from: '2026-11-01' },
    ]
    expect(rateFor(rates, 'credito', '2026-10-31')).toEqual({ fee_percent: 3, settle_days: 30 })
    expect(rateFor(rates, 'credito', '2026-11-01')).toEqual({ fee_percent: 4, settle_days: 2 })
  })

  it('sem linha cadastrada, 0% em D+0', () => {
    expect(rateFor([], 'pix', '2026-11-01')).toEqual({ fee_percent: 0, settle_days: 0 })
  })
})

describe('expenseStatus', () => {
  const today = '2026-11-02'
  it('classifica paga, vencida, vence em breve e em aberto', () => {
    expect(expenseStatus({ paid_at: '2026-11-01', due_date: '2026-10-01' }, today)).toBe('paga')
    expect(expenseStatus({ paid_at: null, due_date: '2026-11-01' }, today)).toBe('vencida')
    expect(expenseStatus({ paid_at: null, due_date: '2026-11-02' }, today)).toBe('vence_em_breve')
    expect(expenseStatus({ paid_at: null, due_date: '2026-11-09' }, today)).toBe('vence_em_breve')
    expect(expenseStatus({ paid_at: null, due_date: '2026-11-10' }, today)).toBe('em_aberto')
  })
})

describe('buildDre', () => {
  it('faturamento − taxas − CMV − despesas = lucro líquido', () => {
    const dre = buildDre({
      sales: [
        { total: 100, created_at: at('2026-11-02'), sale_items: [{ quantity: 2, cost_at_sale: 20 }] },
        { total: 200, created_at: at('2026-11-03'), sale_items: [{ quantity: 1, cost_at_sale: 90 }] },
      ],
      payments: [
        // venda mista: a taxa é por parcela, pela forma de cada uma
        { method: 'dinheiro', amount: 40, created_at: at('2026-11-02') },
        { method: 'credito', amount: 60, created_at: at('2026-11-02') },
        { method: 'online', amount: 200, created_at: at('2026-11-03') },
      ],
      expenses: [
        { amount: 50, category_name: 'Aluguel' },
        { amount: 10, category_name: 'Energia' },
        { amount: 5, category_name: null },
      ],
      rates: BASE_RATES,
    })
    expect(dre.salesCount).toBe(2)
    expect(dre.revenue).toBe(300)
    expect(dre.fees).toBeCloseTo(1.8 + 10, 2) // 3% de 60 + 5% de 200
    expect(dre.netRevenue).toBeCloseTo(288.2, 2)
    expect(dre.cmv).toBe(130)
    expect(dre.grossProfit).toBeCloseTo(158.2, 2)
    expect(dre.expensesTotal).toBe(65)
    expect(dre.netProfit).toBeCloseTo(93.2, 2)
    expect(dre.netMargin).toBeCloseTo(93.2 / 300, 4)
    expect(dre.expensesByCategory).toEqual([
      { name: 'Aluguel', amount: 50 },
      { name: 'Energia', amount: 10 },
      { name: 'Sem categoria', amount: 5 },
    ])
  })

  it('sem venda nem despesa, tudo zero e margem nula', () => {
    const dre = buildDre({ sales: [], payments: [], expenses: [], rates: BASE_RATES })
    expect(dre.netProfit).toBe(0)
    expect(dre.netMargin).toBeNull()
  })

  it('não acumula erro de ponto flutuante', () => {
    const dre = buildDre({
      sales: [0.1, 0.2, 0.3].map((total) => ({ total, created_at: at('2026-11-02'), sale_items: [] })),
      payments: [],
      expenses: [],
      rates: BASE_RATES,
    })
    expect(dre.revenue).toBe(0.6)
  })
})

describe('buildCashFlow', () => {
  const base = {
    rates: BASE_RATES,
    from: '2026-11-01',
    to: '2026-11-30',
    today: '2026-11-10',
  }

  it('crédito cai depois do prazo e já sem a taxa; dinheiro cai no dia', () => {
    const flow = buildCashFlow({
      ...base,
      payments: [
        { method: 'credito', amount: 100, created_at: at('2026-10-05') }, // cai 04/11
        { method: 'dinheiro', amount: 50, created_at: at('2026-11-05') },
        { method: 'credito', amount: 100, created_at: at('2026-11-05') }, // cai 05/12, fora
      ],
      expenses: [],
      lots: [],
      openingBalance: 0,
      openingDate: null,
    })
    expect(flow.days.map((d) => [d.date, d.inflow])).toEqual([
      ['2026-11-04', 97],
      ['2026-11-05', 50],
    ])
    expect(flow.startBalance).toBeNull()
    expect(flow.endBalance).toBe(147)
  })

  it('lote entra como saída no fluxo (e não no DRE)', () => {
    const flow = buildCashFlow({
      ...base,
      payments: [],
      expenses: [],
      lots: [{ supplier: 'Leilão RF', purchase_value: 4500, purchase_date: '2026-11-02' }],
      openingBalance: 0,
      openingDate: null,
    })
    expect(flow.days).toHaveLength(1)
    expect(flow.days[0]).toMatchObject({ date: '2026-11-02', outflow: 4500, forecast: false })
    expect(flow.days[0].labels).toEqual(['Lote — Leilão RF'])
    expect(flow.realizedOut).toBe(4500)
  })

  it('conta em aberto é prevista no vencimento; vencida e não paga cai hoje', () => {
    const flow = buildCashFlow({
      ...base,
      payments: [],
      expenses: [
        { description: 'Aluguel', amount: 3500, due_date: '2026-11-15', paid_at: null },
        { description: 'Energia', amount: 690, due_date: '2026-10-30', paid_at: null },
        { description: 'Embalagens', amount: 900, due_date: '2026-11-01', paid_at: '2026-11-01' },
      ],
      lots: [],
      openingBalance: 0,
      openingDate: null,
    })
    expect(flow.days.map((d) => [d.date, d.outflow, d.forecast])).toEqual([
      ['2026-11-01', 900, false],
      ['2026-11-10', 690, true],
      ['2026-11-15', 3500, true],
    ])
    expect(flow.realizedOut).toBe(900)
    expect(flow.forecastOut).toBe(4190)
  })

  it('saldo inicial + movimento entre ele e o começo do mês = saldo de partida', () => {
    const flow = buildCashFlow({
      ...base,
      payments: [
        { method: 'pix', amount: 999, created_at: at('2026-09-20') }, // antes do saldo inicial: ignorado
        { method: 'pix', amount: 200, created_at: at('2026-10-20') },
        { method: 'pix', amount: 100, created_at: at('2026-11-03') },
      ],
      expenses: [{ description: 'Água', amount: 50, due_date: '2026-10-25', paid_at: '2026-10-25' }],
      lots: [],
      openingBalance: 1000,
      openingDate: '2026-10-01',
    })
    expect(flow.startBalance).toBe(1150)
    expect(flow.days).toEqual([
      expect.objectContaining({ date: '2026-11-03', inflow: 100, balance: 1250 }),
    ])
    expect(flow.endBalance).toBe(1250)
  })

  it('agrupa por semana do mês pro gráfico', () => {
    const flow = buildCashFlow({
      ...base,
      payments: [{ method: 'pix', amount: 10, created_at: at('2026-11-08') }],
      expenses: [{ description: 'X', amount: 5, due_date: '2026-11-29', paid_at: null }],
      lots: [],
      openingBalance: 0,
      openingDate: null,
    })
    expect(flow.weeks.map((w) => w.label)).toEqual(['01–07', '08–14', '15–21', '22–28', '29–30'])
    expect(flow.weeks[1].inRealized).toBe(10)
    expect(flow.weeks[4].outForecast).toBe(5)
  })
})
