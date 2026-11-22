import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { closeLot, reopenLot, deleteLot, updateLot } = await import('./lots')

beforeEach(() => {
  resetSupabaseMock()
})

describe('ações do lote', () => {
  it('closeLot chama a RPC close_lot com o id do lote', async () => {
    pushRpcResult({ data: null, error: null })

    await closeLot('lote-1')

    expect(rpcCalls[0]).toEqual({ name: 'close_lot', args: { p_lot_id: 'lote-1' } })
  })

  it('reopenLot chama a RPC reopen_lot com o id do lote', async () => {
    pushRpcResult({ data: null, error: null })

    await reopenLot('lote-2')

    expect(rpcCalls[0]).toEqual({ name: 'reopen_lot', args: { p_lot_id: 'lote-2' } })
  })

  it('deleteLot chama a RPC delete_lot com o id do lote', async () => {
    pushRpcResult({ data: null, error: null })

    await deleteLot('lote-3')

    expect(rpcCalls[0]).toEqual({ name: 'delete_lot', args: { p_lot_id: 'lote-3' } })
  })

  it('updateLot chama a RPC update_lot com os três campos do lote', async () => {
    pushRpcResult({ data: null, error: null })

    await updateLot('lote-4', {
      supplier: 'Leiloeira Central',
      purchase_value: 1250.5,
      purchase_date: '2026-10-01',
    })

    expect(rpcCalls[0]).toEqual({
      name: 'update_lot',
      args: {
        p_lot_id: 'lote-4',
        p_supplier: 'Leiloeira Central',
        p_purchase_value: 1250.5,
        p_purchase_date: '2026-10-01',
      },
    })
  })

  // As validações de negócio vivem no banco (0019_lotes_acoes.sql) -- o que o
  // cliente precisa garantir é que a mensagem do `raise exception` chegue
  // inteira na tela, e não vire um "erro ao fechar lote" genérico.
  it('closeLot propaga a mensagem de item sem preço', async () => {
    pushRpcResult({
      data: null,
      error: { message: 'Todos os itens precisam ter preço de venda definido antes de fechar o lote.' },
    })

    await expect(closeLot('lote-1')).rejects.toThrow(
      'Todos os itens precisam ter preço de venda definido antes de fechar o lote.',
    )
  })

  it('deleteLot propaga o bloqueio de lote com itens', async () => {
    pushRpcResult({ data: null, error: { message: 'Exclua os itens deste lote antes de excluí-lo.' } })

    await expect(deleteLot('lote-1')).rejects.toThrow('Exclua os itens deste lote antes de excluí-lo.')
  })

  it('deleteLot propaga o bloqueio de lote com venda registrada', async () => {
    pushRpcResult({
      data: null,
      error: { message: 'Este lote já tem vendas registradas e não pode ser excluído.' },
    })

    await expect(deleteLot('lote-1')).rejects.toThrow(
      'Este lote já tem vendas registradas e não pode ser excluído.',
    )
  })

  it('reopenLot propaga o bloqueio de papel não-dono', async () => {
    pushRpcResult({ data: null, error: { message: 'Somente o dono pode reabrir um lote' } })

    await expect(reopenLot('lote-1')).rejects.toThrow('Somente o dono pode reabrir um lote')
  })

  it('updateLot propaga o bloqueio de papel não-dono', async () => {
    pushRpcResult({ data: null, error: { message: 'Somente o dono pode editar um lote' } })

    await expect(
      updateLot('lote-1', { supplier: 'X', purchase_value: 10, purchase_date: '2026-10-01' }),
    ).rejects.toThrow('Somente o dono pode editar um lote')
  })

  it('updateLot propaga o bloqueio de fornecedor em branco', async () => {
    pushRpcResult({ data: null, error: { message: 'Fornecedor não pode ficar em branco' } })

    await expect(
      updateLot('lote-1', { supplier: '   ', purchase_value: 10, purchase_date: '2026-10-01' }),
    ).rejects.toThrow('Fornecedor não pode ficar em branco')
  })

  it('updateLot propaga o bloqueio de valor pago zerado', async () => {
    pushRpcResult({ data: null, error: { message: 'Valor pago deve ser maior que zero' } })

    await expect(
      updateLot('lote-1', { supplier: 'X', purchase_value: 0, purchase_date: '2026-10-01' }),
    ).rejects.toThrow('Valor pago deve ser maior que zero')
  })
})
