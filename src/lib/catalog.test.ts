import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseMock, pushResult, resetSupabaseMock, insertCalls, updateCalls, invokeMock, rpcCalls, pushRpcResult } =
  vi.hoisted(() => {
    const queue: { data: unknown; error: unknown }[] = []
    const rpcQueue: { data: unknown; error: unknown }[] = []
    const insertCalls: unknown[] = []
    const updateCalls: unknown[] = []
    const rpcCalls: { name: string; args: unknown }[] = []
    const invokeMock = { fn: null as unknown }

    function nextResult() {
      return queue.shift() ?? { data: null, error: null }
    }

    function pushResult(result: { data: unknown; error: unknown }) {
      queue.push(result)
    }

    function pushRpcResult(result: { data: unknown; error: unknown }) {
      rpcQueue.push(result)
    }

    function resetSupabaseMock() {
      queue.length = 0
      rpcQueue.length = 0
      insertCalls.length = 0
      updateCalls.length = 0
      rpcCalls.length = 0
    }

    function builder() {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.insert = (payload: unknown) => {
        insertCalls.push(payload)
        return b
      }
      b.update = (payload: unknown) => {
        updateCalls.push(payload)
        return b
      }
      b.maybeSingle = () => Promise.resolve(nextResult())
      b.single = () => Promise.resolve(nextResult())
      b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(nextResult()).then(resolve, reject)
      return b
    }

    const supabaseMock = {
      from: () => builder(),
      functions: { invoke: (...args: unknown[]) => (invokeMock.fn as (...a: unknown[]) => unknown)(...args) },
      rpc: (name: string, args: unknown) => {
        rpcCalls.push({ name, args })
        return Promise.resolve(rpcQueue.shift() ?? { data: null, error: null })
      },
    }
    return { supabaseMock, pushResult, resetSupabaseMock, insertCalls, updateCalls, invokeMock, rpcCalls, pushRpcResult }
  })

vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }))
vi.mock('./mercadoLivre', () => ({
  fetchReferencePriceFromApi: vi.fn(),
  isReferencePriceFresh: vi.fn(),
}))

const { fetchReferencePriceFromApi, isReferencePriceFresh } = await import('./mercadoLivre')
const {
  lookupProduct,
  createManualCatalogEntry,
  confirmCatalogMatch,
  correctCatalogEntry,
  getReferencePrice,
  getBestReferencePrice,
  compareToReference,
  setManualReferencePrice,
  deleteCatalogItem,
  invalidateCatalogCacheByEan,
  clearCatalogCache,
} = await import('./catalog')

beforeEach(() => {
  resetSupabaseMock()
  invokeMock.fn = vi.fn()
  // O cache de lookup é um Map de módulo -- zera entre casos pra não vazar de
  // um teste pro outro (senão um código já cacheado pularia a Edge Function).
  clearCatalogCache()
  vi.mocked(fetchReferencePriceFromApi).mockReset()
  vi.mocked(isReferencePriceFresh).mockReset()
})

describe('lookupProduct', () => {
  it('chama a Edge Function catalog-lookup com o código e devolve o resultado', async () => {
    const catalog = { id: 'cat-1', ean: '7891000100103', name: 'Produto' }
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: catalog, error: null })

    const result = await lookupProduct('7891000100103')

    expect(result).toEqual(catalog)
    expect(invokeMock.fn).toHaveBeenCalledWith('catalog-lookup', { body: { code: '7891000100103' } })
  })

  it('retorna null quando a função não encontra o produto em nenhuma fonte', async () => {
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null })

    const result = await lookupProduct('0000000000000')

    expect(result).toBeNull()
  })

  it('propaga erro quando a chamada à Edge Function falha', async () => {
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: new Error('function unavailable'),
    })

    await expect(lookupProduct('7891000100103')).rejects.toThrow('function unavailable')
  })
})

describe('lookupProduct — cache em memória', () => {
  it('no 2º bipe do mesmo código retorna do cache, sem chamar a Edge Function de novo', async () => {
    const catalog = { id: 'cat-c1', ean: '7891000100103', name: 'Produto', enrichment_status: 'resolved' }
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: catalog, error: null })

    const first = await lookupProduct('7891000100103')
    const second = await lookupProduct('7891000100103')

    expect(first).toEqual(catalog)
    expect(second).toEqual(catalog)
    expect(invokeMock.fn).toHaveBeenCalledTimes(1)
  })

  it('não cacheia null: código não encontrado re-consulta o servidor no bipe seguinte', async () => {
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null })

    await lookupProduct('0000000000000')
    await lookupProduct('0000000000000')

    expect(invokeMock.fn).toHaveBeenCalledTimes(2)
  })

  it('não cacheia entrada pending (falha de infra): reprocessa no bipe seguinte', async () => {
    const pending = { id: 'cat-c2', ean: '7899999999999', enrichment_status: 'pending' }
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: pending, error: null })

    await lookupProduct('7899999999999')
    await lookupProduct('7899999999999')

    expect(invokeMock.fn).toHaveBeenCalledTimes(2)
  })

  it('invalidateCatalogCacheByEan derruba a entrada e força novo lookup', async () => {
    const catalog = { id: 'cat-c3', ean: '7891000100103', name: 'Antigo', enrichment_status: 'resolved' }
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: catalog, error: null })

    await lookupProduct('7891000100103')
    invalidateCatalogCacheByEan('7891000100103')
    await lookupProduct('7891000100103')

    expect(invokeMock.fn).toHaveBeenCalledTimes(2)
  })

  it('invalidateCatalogCacheByEan ignora ean null e não afeta outras entradas', async () => {
    const catalog = { id: 'cat-c4', ean: '7891000100103', name: 'Produto', enrichment_status: 'resolved' }
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: catalog, error: null })

    await lookupProduct('7891000100103')
    invalidateCatalogCacheByEan(null)
    await lookupProduct('7891000100103')

    expect(invokeMock.fn).toHaveBeenCalledTimes(1)
  })
})

describe('createManualCatalogEntry', () => {
  it('grava source=manual com a origem escolhida pelo operador', async () => {
    pushResult({ data: { id: 'cat-7' }, error: null })

    await createManualCatalogEntry({ name: 'Sem código', origin: 'importado' })

    expect(insertCalls[0]).toMatchObject({ source: 'manual', origin: 'importado', ean: null })
  })
})

describe('confirmCatalogMatch', () => {
  it('marca needs_review=false sem mexer na foto quando não há foto própria', async () => {
    pushResult({ data: { id: 'cat-8' }, error: null })

    await confirmCatalogMatch('cat-8')

    expect(updateCalls[0]).toEqual({ needs_review: false })
  })

  it('grava a foto própria quando informada (API não tinha foto)', async () => {
    pushResult({ data: { id: 'cat-9' }, error: null })

    await confirmCatalogMatch('cat-9', 'https://x/propria.jpg')

    expect(updateCalls[0]).toEqual({ needs_review: false, photo_url: 'https://x/propria.jpg' })
  })
})

describe('correctCatalogEntry', () => {
  it('corrige a entrada existente em vez de duplicar, e marca ncm_pending para importado', async () => {
    pushResult({ data: { id: 'cat-10' }, error: null })

    await correctCatalogEntry('cat-10', { name: 'Nome correto', origin: 'importado' })

    expect(updateCalls[0]).toMatchObject({
      name: 'Nome correto',
      origin: 'importado',
      ncm_pending: true,
      source: 'manual',
      needs_review: false,
    })
  })
})

describe('getReferencePrice', () => {
  const baseCatalog = {
    id: 'cat-11',
    ean: '7891000100103',
    ref_price_min: null,
    ref_price_avg: null,
    ref_price_max: null,
    ref_price_updated_at: null,
  } as Parameters<typeof getReferencePrice>[0]

  it('retorna o valor cacheado sem chamar a API quando o cache ainda está fresco', async () => {
    vi.mocked(isReferencePriceFresh).mockReturnValue(true)
    const fresh = { ...baseCatalog, ref_price_min: 10, ref_price_avg: 20, ref_price_max: 30 }

    const result = await getReferencePrice(fresh)

    expect(result).toEqual({ min: 10, avg: 20, max: 30 })
    expect(fetchReferencePriceFromApi).not.toHaveBeenCalled()
  })

  it('busca na Edge Function quando o cache está ausente/vencido e repassa o resultado', async () => {
    vi.mocked(isReferencePriceFresh).mockReturnValue(false)
    vi.mocked(fetchReferencePriceFromApi).mockResolvedValue({ min: 5, avg: 8, max: 12 })

    const result = await getReferencePrice(baseCatalog)

    expect(result).toEqual({ min: 5, avg: 8, max: 12 })
    expect(fetchReferencePriceFromApi).toHaveBeenCalledWith('cat-11')
    // Cache agora é gravado inteiramente pela Edge Function -- o cliente
    // não grava mais em product_catalog aqui.
    expect(updateCalls).toHaveLength(0)
  })

  it('repassa null quando a Edge Function responde sem referência (sem anúncio ou erro de infra)', async () => {
    vi.mocked(isReferencePriceFresh).mockReturnValue(false)
    vi.mocked(fetchReferencePriceFromApi).mockResolvedValue(null)

    const result = await getReferencePrice(baseCatalog)

    expect(result).toBeNull()
    expect(updateCalls).toHaveLength(0)
  })

  it('propaga erro quando a chamada à Edge Function em si falha (ex.: offline)', async () => {
    vi.mocked(isReferencePriceFresh).mockReturnValue(false)
    vi.mocked(fetchReferencePriceFromApi).mockRejectedValue(new Error('offline'))

    await expect(getReferencePrice(baseCatalog)).rejects.toThrow('offline')
  })

  it('retorna null sem consultar a API quando o catálogo não tem EAN', async () => {
    vi.mocked(isReferencePriceFresh).mockReturnValue(false)

    const result = await getReferencePrice({ ...baseCatalog, ean: null })

    expect(result).toBeNull()
    expect(fetchReferencePriceFromApi).not.toHaveBeenCalled()
  })
})

describe('getBestReferencePrice', () => {
  const baseCatalog = {
    ref_price_min: null,
    ref_price_avg: null,
    ref_price_max: null,
    ref_price_updated_at: null,
    manual_ref_price: null,
    manual_ref_price_updated_at: null,
  } as Parameters<typeof getBestReferencePrice>[0]

  it('prioriza a Cosmos quando ref_price_avg existe', () => {
    const catalog = {
      ...baseCatalog,
      ref_price_avg: 20,
      ref_price_updated_at: '2026-01-01T00:00:00Z',
      manual_ref_price: 99,
    }
    expect(getBestReferencePrice(catalog)).toEqual({
      value: 20,
      source: 'cosmos',
      updatedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('cai pro valor anotado manualmente quando não há Cosmos', () => {
    const catalog = { ...baseCatalog, manual_ref_price: 15, manual_ref_price_updated_at: '2026-02-01T00:00:00Z' }
    expect(getBestReferencePrice(catalog)).toEqual({
      value: 15,
      source: 'manual',
      updatedAt: '2026-02-01T00:00:00Z',
    })
  })

  it('retorna null sem nenhuma referência disponível', () => {
    expect(getBestReferencePrice(baseCatalog)).toBeNull()
  })
})

describe('compareToReference', () => {
  it('below: preço de venda na referência ou abaixo', () => {
    expect(compareToReference(100, 100)).toBe('below')
    expect(compareToReference(90, 100)).toBe('below')
  })

  it('near: até 15% acima da referência', () => {
    expect(compareToReference(114, 100)).toBe('near')
  })

  it('above: mais de 15% acima da referência', () => {
    expect(compareToReference(116, 100)).toBe('above')
  })
})

describe('setManualReferencePrice', () => {
  it('grava manual_ref_price e a data', async () => {
    pushResult({ data: { id: 'cat-20', manual_ref_price: 42 }, error: null })

    await setManualReferencePrice('cat-20', 42)

    expect(updateCalls[0]).toMatchObject({ manual_ref_price: 42 })
    expect(typeof (updateCalls[0] as { manual_ref_price_updated_at: string }).manual_ref_price_updated_at).toBe(
      'string',
    )
  })
})

describe('deleteCatalogItem', () => {
  it('chama a RPC delete_catalog_item com o id do catálogo', async () => {
    pushRpcResult({ data: null, error: null })

    await deleteCatalogItem('cat-21')

    expect(rpcCalls[0]).toEqual({ name: 'delete_catalog_item', args: { p_catalog_id: 'cat-21' } })
  })

  it('propaga a mensagem de erro da RPC (ex.: bloqueio por estoque vinculado ou papel não-dono)', async () => {
    pushRpcResult({ data: null, error: { message: 'Há itens de estoque vinculados a este produto — exclua-os primeiro' } })

    await expect(deleteCatalogItem('cat-22')).rejects.toThrow(
      'Há itens de estoque vinculados a este produto — exclua-os primeiro',
    )
  })
})
