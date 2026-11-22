import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StockItem } from './types'

const { supabaseMock, resetSupabaseMock, rpcCalls, pushRpcResult } = vi.hoisted(() => {
  const rpcQueue: { data: unknown; error: unknown }[] = []
  const rpcCalls: { name: string; args: unknown }[] = []

  function pushRpcResult(result: { data: unknown; error: unknown }) {
    rpcQueue.push(result)
  }

  function resetSupabaseMock() {
    rpcQueue.length = 0
    rpcCalls.length = 0
  }

  const supabaseMock = {
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return Promise.resolve(rpcQueue.shift() ?? { data: null, error: null })
    },
  }
  return { supabaseMock, resetSupabaseMock, rpcCalls, pushRpcResult }
})

vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }))

const { deleteStockItem } = await import('./stockItems')

beforeEach(() => {
  resetSupabaseMock()
})

describe('deleteStockItem', () => {
  it('chama a RPC delete_stock_item com o id do item', async () => {
    pushRpcResult({ data: null, error: null })

    await deleteStockItem('item-1')

    expect(rpcCalls[0]).toEqual({ name: 'delete_stock_item', args: { p_stock_item_id: 'item-1' } })
  })

  it('propaga a mensagem de erro da RPC (ex.: papel não-dono)', async () => {
    pushRpcResult({ data: null, error: { message: 'Somente o dono pode excluir itens do estoque' } })

    await expect(deleteStockItem('item-2')).rejects.toThrow('Somente o dono pode excluir itens do estoque')
  })
})

const { worstCondition, normalizeProductName, findDuplicateInLot } = await import('./stockItems')

function item(partial: Partial<StockItem>): StockItem {
  return {
    id: 'x',
    lot_id: 'l',
    catalog_id: 'c',
    internal_code: null,
    condition: 'novo',
    quantity: 1,
    quantity_sold: 0,
    sale_price: 10,
    allocated_cost: 0,
    photos: [],
    expiry_date: null,
    nickname: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    product_catalog: null,
    lot: null,
    ...partial,
  } as StockItem
}

describe('worstCondition', () => {
  it('novo perde pra qualquer condição pior', () => {
    expect(worstCondition('novo', 'caixa_aberta')).toBe('caixa_aberta')
    expect(worstCondition('novo', 'avaria')).toBe('avaria')
    expect(worstCondition('caixa_aberta', 'novo')).toBe('caixa_aberta')
  })

  it('avaria é a pior de todas', () => {
    expect(worstCondition('avaria', 'usado')).toBe('avaria')
    expect(worstCondition('usado', 'avaria')).toBe('avaria')
  })

  it('condição nula (coluna é nullable) cede pra que está chegando', () => {
    expect(worstCondition(null, 'usado')).toBe('usado')
  })
})

describe('normalizeProductName', () => {
  it('ignora maiúscula, acento e espaço sobrando', () => {
    expect(normalizeProductName('  Fone   Bluetooth JBL ')).toBe('fone bluetooth jbl')
    expect(normalizeProductName('Cafeteira Elétrica')).toBe('cafeteira eletrica')
  })
})

describe('findDuplicateInLot', () => {
  const items = [
    item({ id: 'a', nickname: null, product_catalog: { name: 'Fone JBL' } as StockItem['product_catalog'] }),
    item({ id: 'b', nickname: 'Panela Clock', catalog_id: 'c2' }),
  ]

  it('acha pelo nome do catálogo, ignorando acento e caixa', () => {
    expect(findDuplicateInLot(items, 'fone  jbl')?.id).toBe('a')
  })

  it('acha pelo apelido do item (decisão #30)', () => {
    expect(findDuplicateInLot(items, 'PANELA CLOCK')?.id).toBe('b')
  })

  it('nome inédito não casa com nada', () => {
    expect(findDuplicateInLot(items, 'Liquidificador')).toBeNull()
  })

  it('nome vazio nunca casa', () => {
    expect(findDuplicateInLot(items, '   ')).toBeNull()
  })

  it('ignora item excluído e item sem catálogo', () => {
    const rows = [
      item({ id: 'del', active: false, nickname: 'Fone JBL' }),
      item({ id: 'semcat', catalog_id: null, nickname: 'Fone JBL' }),
    ]
    expect(findDuplicateInLot(rows, 'Fone JBL')).toBeNull()
  })
})

const { dedupeById } = await import('./stockItems')

describe('dedupeById', () => {
  it('descarta linhas repetidas mantendo a primeira e a ordem', () => {
    const rows = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'a', v: 3 },
      { id: 'c', v: 4 },
    ]
    expect(dedupeById(rows)).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 4 },
    ])
  })
})
