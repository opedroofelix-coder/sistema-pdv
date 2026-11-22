import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: { fn: null as unknown } }))

vi.mock('./supabaseClient', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => (invokeMock.fn as (...a: unknown[]) => unknown)(...args) } },
}))

const { fetchReferencePriceFromApi, isReferencePriceFresh, mercadoLivreSearchUrl } = await import('./mercadoLivre')

beforeEach(() => {
  invokeMock.fn = vi.fn()
})

describe('fetchReferencePriceFromApi', () => {
  it('chama a Edge Function mercado-livre-price com o catalogId e devolve o resultado', async () => {
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { min: 100, avg: 200, max: 300 },
      error: null,
    })

    const result = await fetchReferencePriceFromApi('cat-1')

    expect(result).toEqual({ min: 100, avg: 200, max: 300 })
    expect(invokeMock.fn).toHaveBeenCalledWith('mercado-livre-price', { body: { catalogId: 'cat-1' } })
  })

  it('retorna null quando a função responde sem anúncio/indisponível', async () => {
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null })

    expect(await fetchReferencePriceFromApi('cat-1')).toBeNull()
  })

  it('propaga erro quando a chamada à Edge Function falha (ex.: offline)', async () => {
    ;(invokeMock.fn as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: new Error('function unavailable'),
    })

    await expect(fetchReferencePriceFromApi('cat-1')).rejects.toThrow('function unavailable')
  })
})

describe('isReferencePriceFresh', () => {
  it('retorna false quando nunca foi buscado (null)', () => {
    expect(isReferencePriceFresh(null)).toBe(false)
  })

  it('retorna true para uma data de ontem', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(isReferencePriceFresh(yesterday)).toBe(true)
  })

  it('retorna false para uma data de 31 dias atrás', () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    expect(isReferencePriceFresh(old)).toBe(false)
  })
})

describe('mercadoLivreSearchUrl', () => {
  it('prefere o EAN quando disponível', () => {
    expect(mercadoLivreSearchUrl({ ean: '7891000100103', name: 'Produto X' })).toBe(
      'https://lista.mercadolivre.com.br/7891000100103',
    )
  })

  it('cai pro nome quando não há EAN', () => {
    expect(mercadoLivreSearchUrl({ ean: null, name: 'Produto Sem Código' })).toBe(
      'https://lista.mercadolivre.com.br/Produto%20Sem%20C%C3%B3digo',
    )
  })

  it('retorna null sem EAN nem nome', () => {
    expect(mercadoLivreSearchUrl({ ean: null, name: null })).toBeNull()
  })
})
