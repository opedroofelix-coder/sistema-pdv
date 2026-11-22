import { describe, it, expect } from 'vitest'
import { activityPeriodRange, aggregateUserActivity } from './admin'

describe('aggregateUserActivity', () => {
  it('conta itens cadastrados e soma unidades vendidas por usuário', () => {
    const result = aggregateUserActivity(
      [{ created_by: 'a' }, { created_by: 'a' }, { created_by: 'b' }, { created_by: null }],
      [
        { quantity: 2, sales: { cashier_id: 'a' } },
        { quantity: 3, sales: { cashier_id: 'c' } },
        { quantity: 1, sales: { cashier_id: 'a' } },
        { quantity: 5, sales: null },
      ],
    )
    expect(result).toEqual({
      a: { registered: 2, sold: 3 },
      b: { registered: 1, sold: 0 },
      c: { registered: 0, sold: 3 },
    })
  })

  it('sem dados -> mapa vazio', () => {
    expect(aggregateUserActivity([], [])).toEqual({})
  })
})

describe('activityPeriodRange', () => {
  const now = new Date(2026, 10, 2, 15, 30) // 02/11/2026, horário local

  it('Dia = só hoje', () => {
    expect(activityPeriodRange('dia', now)).toEqual({ from: '2026-11-02', to: '2026-11-02' })
  })
  it('Mês = do dia 1 até hoje', () => {
    expect(activityPeriodRange('mes', now)).toEqual({ from: '2026-11-01', to: '2026-11-02' })
  })
  it('Ano = de 1º de janeiro até hoje', () => {
    expect(activityPeriodRange('ano', now)).toEqual({ from: '2026-01-01', to: '2026-11-02' })
  })
  it('Tudo = sem filtro', () => {
    expect(activityPeriodRange('tudo', now)).toBeNull()
  })
})
