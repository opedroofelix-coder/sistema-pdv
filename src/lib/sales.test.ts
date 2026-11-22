import { describe, it, expect } from 'vitest'
import { isPaymentComplete, primaryPaymentMethod, remainingToPay, saleItemLineName } from './sales'
import type { PaymentSplit } from './types'

const pix = (amount: number): PaymentSplit => ({ method: 'pix', amount })
const dinheiro = (amount: number): PaymentSplit => ({ method: 'dinheiro', amount })

describe('remainingToPay', () => {
  it('sem forma escolhida, falta o total inteiro', () => {
    expect(remainingToPay(137.4, [])).toBe(137.4)
  })

  it('desconta o que já foi lançado', () => {
    expect(remainingToPay(100, [pix(60)])).toBe(40)
  })

  it('negativo quando as parcelas passam do total', () => {
    expect(remainingToPay(100, [pix(60), dinheiro(50)])).toBe(-10)
  })
})

describe('isPaymentComplete', () => {
  it('nenhuma forma escolhida nunca fecha (decisão #53, item 1)', () => {
    expect(isPaymentComplete(100, [])).toBe(false)
    // Inclusive numa venda de total zero: escolher a forma continua obrigatório.
    expect(isPaymentComplete(0, [])).toBe(false)
  })

  it('fecha quando a soma bate com o total', () => {
    expect(isPaymentComplete(100, [pix(100)])).toBe(true)
    expect(isPaymentComplete(137.4, [pix(80), dinheiro(57.4)])).toBe(true)
  })

  it('não fecha se falta ou passa', () => {
    expect(isPaymentComplete(100, [pix(60)])).toBe(false)
    expect(isPaymentComplete(100, [pix(60), dinheiro(50)])).toBe(false)
  })

  it('tolera 1 centavo de arredondamento na divisão', () => {
    // 100 / 3 arredondado dá 33,33 × 3 = 99,99 -- um centavo a menos.
    expect(isPaymentComplete(100, [pix(33.33), pix(33.33), dinheiro(33.33)])).toBe(true)
    expect(isPaymentComplete(100, [pix(33.3), dinheiro(33.3)])).toBe(false)
  })

  it('parcela zerada não fecha (o create_sale recusaria: amount > 0)', () => {
    expect(isPaymentComplete(100, [pix(100), dinheiro(0)])).toBe(false)
  })
})

describe('primaryPaymentMethod', () => {
  it('sem parcela nenhuma => null', () => {
    expect(primaryPaymentMethod([])).toBeNull()
  })

  it('uma forma só => a própria forma', () => {
    expect(primaryPaymentMethod([pix(100)])).toBe('pix')
  })

  it('duas ou mais => misto', () => {
    expect(primaryPaymentMethod([pix(60), dinheiro(40)])).toBe('misto')
  })
})

describe('saleItemLineName', () => {
  it('item avulso: usa a descrição', () => {
    expect(saleItemLineName({ description: 'Diversos', stock_items: null })).toBe('Diversos')
  })

  it('item de estoque: apelido tem prioridade sobre o catálogo (decisão #30)', () => {
    expect(
      saleItemLineName({
        description: null,
        stock_items: { nickname: 'Fone azul', product_catalog: { name: 'Fone JBL' } },
      }),
    ).toBe('Fone azul')
  })

  it('item de estoque sem apelido: cai no nome do catálogo', () => {
    expect(
      saleItemLineName({
        description: null,
        stock_items: { nickname: null, product_catalog: { name: 'Fone JBL' } },
      }),
    ).toBe('Fone JBL')
  })

  it('sem apelido e sem nome de catálogo: fallback', () => {
    expect(
      saleItemLineName({
        description: null,
        stock_items: { nickname: null, product_catalog: null },
      }),
    ).toBe('Sem descrição')
  })
})
