import { describe, it, expect } from 'vitest'
import {
  buildCashCloseReports,
  type ClosedSessionRow,
  type SessionMovementRow,
  type SessionPaymentRow,
  type SessionSaleRow,
} from './cashSessions'

function session(over: Partial<ClosedSessionRow> = {}): ClosedSessionRow {
  return {
    id: 's1',
    cashier_name: 'Ana',
    opened_at: '2026-09-16T08:00:00Z',
    closed_at: '2026-09-16T18:00:00Z',
    opening_amount: 50,
    closing_amount: 740,
    expected_amount: 745,
    ...over,
  }
}

describe('buildCashCloseReports', () => {
  it('reconcilia um fechamento: diferença, vendas, formas e movimentos', () => {
    const movements: SessionMovementRow[] = [
      { session_id: 's1', type: 'sangria', amount: 30 },
      { session_id: 's1', type: 'suprimento', amount: 25 },
    ]
    const sales: SessionSaleRow[] = [
      { session_id: 's1', total: 700 },
      { session_id: 's1', total: 20 },
    ]
    const payments: SessionPaymentRow[] = [
      { session_id: 's1', method: 'dinheiro', amount: 700 },
      { session_id: 's1', method: 'pix', amount: 20 },
    ]
    const [r] = buildCashCloseReports([session()], movements, sales, payments)
    expect(r.difference).toBe(-5) // contado 740 − esperado 745 = falta 5
    expect(r.sales_count).toBe(2)
    expect(r.sales_revenue).toBe(720)
    expect(r.payments).toEqual([
      { method: 'dinheiro', amount: 700 },
      { method: 'pix', amount: 20 },
    ])
    expect(r.sangria_total).toBe(30)
    expect(r.suprimento_total).toBe(25)
  })

  it('diferença: certo (0), sobra (> 0)', () => {
    const [certo] = buildCashCloseReports([session({ closing_amount: 745 })], [], [], [])
    expect(certo.difference).toBe(0)
    const [sobra] = buildCashCloseReports([session({ closing_amount: 800 })], [], [], [])
    expect(sobra.difference).toBe(55)
  })

  it('formas: ordem canônica (dinheiro primeiro) e soma por forma', () => {
    const payments: SessionPaymentRow[] = [
      { session_id: 's1', method: 'credito', amount: 10 },
      { session_id: 's1', method: 'dinheiro', amount: 40 },
      { session_id: 's1', method: 'dinheiro', amount: 60 }, // soma: 100
    ]
    const [r] = buildCashCloseReports([session()], [], [], payments)
    expect(r.payments).toEqual([
      { method: 'dinheiro', amount: 100 },
      { method: 'credito', amount: 10 },
    ])
  })

  it('sessão sem vendas nem movimentos zera tudo', () => {
    const [r] = buildCashCloseReports([session()], [], [], [])
    expect(r.sales_count).toBe(0)
    expect(r.sales_revenue).toBe(0)
    expect(r.payments).toEqual([])
    expect(r.sangria_total).toBe(0)
    expect(r.suprimento_total).toBe(0)
  })

  it('ignora sessão ainda aberta (closed_at nulo)', () => {
    const reports = buildCashCloseReports([session({ closed_at: null })], [], [], [])
    expect(reports).toHaveLength(0)
  })
})
