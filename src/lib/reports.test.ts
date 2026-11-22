import { describe, it, expect } from 'vitest'
import { aggregateSales, bestSalesDay, siteRevenueOf, sumLotSaleValues, sumStockTotals } from './reports'
import type { StockItem } from './types'

function stockItem(partial: Partial<StockItem>): StockItem {
  return {
    id: 'x',
    lot_id: 'l',
    catalog_id: null,
    internal_code: null,
    condition: 'novo',
    quantity: 1,
    quantity_sold: 0,
    sale_price: 0,
    allocated_cost: 0,
    photos: null,
    expiry_date: null,
    nickname: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    product_catalog: null,
    lot: null,
    ...partial,
  } as StockItem
}

describe('sumStockTotals', () => {
  it('soma unidades e valor pela quantidade disponível (quantity - quantity_sold)', () => {
    const rows = [
      stockItem({ quantity: 3, quantity_sold: 1, sale_price: 100 }),
      stockItem({ quantity: 5, quantity_sold: 0, sale_price: 20 }),
    ]
    const totals = sumStockTotals(rows)
    // disponível: 2 e 5
    expect(totals.units).toBe(7)
    expect(totals.saleValue).toBe(2 * 100 + 5 * 20) // 300
  })

  it('item todo vendido não entra na conta', () => {
    const rows = [
      stockItem({ quantity: 2, quantity_sold: 2, sale_price: 100 }),
      stockItem({ quantity: 4, quantity_sold: 1, sale_price: 10 }),
    ]
    const totals = sumStockTotals(rows)
    expect(totals.units).toBe(3)
    expect(totals.saleValue).toBe(30)
  })

  it('lista vazia => tudo zero', () => {
    expect(sumStockTotals([])).toEqual({ units: 0, saleValue: 0 })
  })
})

describe('sumLotSaleValues', () => {
  it('soma sale_price × quantity de todas as unidades, agrupando por lote', () => {
    const totals = sumLotSaleValues([
      { lot_id: 'A', sale_price: 60, quantity: 2 }, // 120
      { lot_id: 'A', sale_price: 40, quantity: 3 }, // 120 -> A = 240
      { lot_id: 'B', sale_price: 10, quantity: 5 }, // B = 50
    ])
    expect(totals.get('A')).toBe(240)
    expect(totals.get('B')).toBe(50)
  })

  it('conta a quantidade inteira, inclusive unidades já vendidas', () => {
    // quantity é a quantidade total (vendidas + em estoque); o valor de venda
    // do lote é o total se vender tudo pelo preço marcado.
    const totals = sumLotSaleValues([{ lot_id: 'A', sale_price: 100, quantity: 4 }])
    expect(totals.get('A')).toBe(400)
  })

  it('lista vazia => mapa vazio', () => {
    expect(sumLotSaleValues([]).size).toBe(0)
  })
})

describe('siteRevenueOf', () => {
  it('soma só as vendas do site; sem canal conta como loja', () => {
    expect(
      siteRevenueOf([
        { total: 100, channel: 'site' },
        { total: 50, channel: 'loja' },
        { total: 30 },
        { total: 20, channel: 'site' },
      ]),
    ).toBe(120)
  })

  it('aggregateSales separa o faturamento do site', () => {
    const summary = aggregateSales([
      { total: 90, created_at: '2026-08-10T14:00:00Z', channel: 'site', sale_items: [] },
      { total: 10, created_at: '2026-08-10T15:00:00Z', sale_items: [] },
    ])
    expect(summary.revenue).toBe(100)
    expect(summary.siteRevenue).toBe(90)
  })
})

describe('aggregateSales', () => {
  it('faturamento soma sales.total; lucro desconta o custo congelado', () => {
    const sales = [
      { total: 90, created_at: '2026-08-10T14:00:00Z', sale_items: [{ quantity: 1, cost_at_sale: 40 }] },
      {
        total: 50,
        created_at: '2026-08-12T14:00:00Z',
        sale_items: [
          { quantity: 2, cost_at_sale: 10 },
          { quantity: 1, cost_at_sale: 5 },
        ],
      },
    ]
    const summary = aggregateSales(sales)
    expect(summary.revenue).toBe(140) // 90 + 50
    expect(summary.count).toBe(2)
    // custo: 40 + (2*10 + 1*5) = 40 + 25 = 65
    expect(summary.profit).toBe(140 - 65) // 75
    expect(summary.avgTicket).toBe(70) // 140 / 2
  })

  it('sem vendas => zeros', () => {
    const summary = aggregateSales([])
    expect(summary.revenue).toBe(0)
    expect(summary.count).toBe(0)
    expect(summary.avgTicket).toBe(0)
  })
})

describe('bestSalesDay', () => {
  it('melhor dia = maior faturamento agregado num único dia', () => {
    const sales = [
      { total: 30, created_at: '2026-08-10T14:00:00Z' },
      { total: 30, created_at: '2026-08-10T18:00:00Z' }, // dia 10 => 60
      { total: 45, created_at: '2026-08-12T10:00:00Z' }, // dia 12 => 45
    ]
    // As duas vendas do mesmo dia somam 60 (> 45) -- independente do fuso do
    // runner, os dois timestamps do dia 10 caem no mesmo dia local.
    expect(bestSalesDay(sales)?.total).toBe(60)
  })

  it('sem vendas => nulo', () => {
    expect(bestSalesDay([])).toBeNull()
  })
})
