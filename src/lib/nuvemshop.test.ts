import { describe, expect, it } from 'vitest'
import { buildWebStatusMap, suggestMatches, type UnmatchedVariant } from './nuvemshop'

function variant(id: number, name: string, ignored = false): UnmatchedVariant {
  return { ns_variant_id: id, ns_product_id: id, name, barcode: null, sku: null, stock: 1, image_url: null, ignored }
}

describe('buildWebStatusMap', () => {
  it('vinculado sem erro = No site; com erro ou em revisão = Erro no site', () => {
    const map = buildWebStatusMap(
      [
        { catalog_id: 'a', last_error: null },
        { catalog_id: 'b', last_error: 'HTTP 422' },
      ],
      [{ catalog_id: 'c', reason: 'Produto apagado na Nuvemshop' }],
    )
    expect(map.get('a')).toEqual({ kind: 'ok' })
    expect(map.get('b')).toEqual({
      kind: 'error',
      reason: 'Não foi possível enviar o saldo ao site.',
      detail: 'HTTP 422',
    })
    expect(map.get('c')).toEqual({ kind: 'error', reason: 'Produto apagado na Nuvemshop' })
    expect(map.has('d')).toBe(false)
  })
})

describe('suggestMatches', () => {
  const candidates = [
    variant(1, 'Kit Potes Herméticos Electrolux (3un)'),
    variant(2, 'Pote Hermético Electrolux 1,2L'),
    variant(3, 'Camiseta básica · M'),
    variant(4, 'Kit Potes Hermeticos Electrolux', true),
  ]

  it('ordena por palavras em comum, ignora acento e itens ignorados', () => {
    const result = suggestMatches('Kit 3 potes herméticos Electrolux', candidates)
    expect(result.map((r) => r.ns_variant_id)).toEqual([1])
  })

  it('sem nome ou sem semelhança => nenhuma sugestão', () => {
    expect(suggestMatches(null, candidates)).toEqual([])
    expect(suggestMatches('Air fryer Mondial', candidates)).toEqual([])
  })
})
