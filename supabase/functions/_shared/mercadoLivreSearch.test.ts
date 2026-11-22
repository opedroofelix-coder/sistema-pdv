import { assertEquals, assertObjectMatch, assertStringIncludes } from 'jsr:@std/assert@1'
import { searchMercadoLivrePrice } from './mercadoLivreSearch.ts'

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const original = globalThis.fetch
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: any, init?: any) => impl(String(url), init)) as any
  return () => {
    globalThis.fetch = original
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

Deno.test('searchMercadoLivrePrice: envia o token no header Authorization', async () => {
  let receivedAuth: string | null = null
  const restore = stubFetch((url, init) => {
    receivedAuth = (init?.headers as Record<string, string>)?.Authorization ?? null
    assertStringIncludes(url, 'q=7891000053508')
    return jsonResponse({ results: [{ price: 10 }] })
  })
  try {
    await searchMercadoLivrePrice('7891000053508', 'meu-token')
    assertEquals(receivedAuth, 'Bearer meu-token')
  } finally {
    restore()
  }
})

Deno.test('searchMercadoLivrePrice: calcula min/média/máx dos preços válidos', async () => {
  const restore = stubFetch(() =>
    jsonResponse({ results: [{ price: 10 }, { price: 20 }, { price: 30 }, { price: 0 }, {}] }),
  )
  try {
    const outcome = await searchMercadoLivrePrice('7891000053508', 'token')
    assertEquals(outcome.error, null)
    assertObjectMatch(outcome.price!, { min: 10, max: 30, avg: 20 })
  } finally {
    restore()
  }
})

Deno.test('searchMercadoLivrePrice: results vazio é "sem anúncio" (sem erro)', async () => {
  const restore = stubFetch(() => jsonResponse({ results: [] }))
  try {
    const outcome = await searchMercadoLivrePrice('7891000053508', 'token')
    assertEquals(outcome, { price: null, error: null })
  } finally {
    restore()
  }
})

Deno.test('searchMercadoLivrePrice: HTTP 403 vira erro de infra', async () => {
  const restore = stubFetch(() => new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 }))
  try {
    const outcome = await searchMercadoLivrePrice('7891000053508', 'token')
    assertEquals(outcome.price, null)
    assertStringIncludes(outcome.error!, '403')
  } finally {
    restore()
  }
})

Deno.test('searchMercadoLivrePrice: resposta sem "results" (formato mudou) vira erro, não "sem anúncio"', async () => {
  const restore = stubFetch(() => jsonResponse({ items: [] }))
  try {
    const outcome = await searchMercadoLivrePrice('7891000053508', 'token')
    assertEquals(outcome.price, null)
    assertStringIncludes(outcome.error!, 'formato inesperado')
  } finally {
    restore()
  }
})

Deno.test('searchMercadoLivrePrice: falha de rede vira erro de infra, não lança', async () => {
  const restore = stubFetch(() => {
    throw new TypeError('network down')
  })
  try {
    const outcome = await searchMercadoLivrePrice('7891000053508', 'token')
    assertEquals(outcome.price, null)
    assertEquals(typeof outcome.error, 'string')
  } finally {
    restore()
  }
})
