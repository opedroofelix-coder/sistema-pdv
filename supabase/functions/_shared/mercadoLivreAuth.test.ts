import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'
import { getMercadoLivreToken, MercadoLivreAuthError } from './mercadoLivreAuth.ts'

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

function fakeSupabase(initialRow: { access_token: string; expires_at: string } | null) {
  let row = initialRow
  const upserts: unknown[] = []
  return {
    upserts,
    client: {
      from(table: string) {
        if (table !== 'mercado_livre_oauth_token') throw new Error(`tabela inesperada: ${table}`)
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
          upsert: async (values: { access_token: string; expires_at: string }) => {
            row = { access_token: values.access_token, expires_at: values.expires_at }
            upserts.push(values)
            return { data: null, error: null }
          },
        }
      },
    },
  }
}

Deno.test('getMercadoLivreToken: cache válido não chama a API de novo', async () => {
  let called = false
  const restore = stubFetch(() => {
    called = true
    return jsonResponse({ access_token: 'novo', expires_in: 21600 })
  })
  const fake = fakeSupabase({
    access_token: 'cacheado',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  try {
    const token = await getMercadoLivreToken(fake.client, 'id', 'secret')
    assertEquals(token, 'cacheado')
    assertEquals(called, false)
  } finally {
    restore()
  }
})

Deno.test('getMercadoLivreToken: cache expirado busca token novo e grava', async () => {
  const restore = stubFetch((url, init) => {
    assertEquals(url, 'https://api.mercadolibre.com/oauth/token')
    assertEquals(init?.method, 'POST')
    const params = new URLSearchParams(init?.body as string)
    assertEquals(params.get('grant_type'), 'client_credentials')
    assertEquals(params.get('client_id'), 'id-123')
    assertEquals(params.get('client_secret'), 'segredo')
    return jsonResponse({ access_token: 'token-novo', expires_in: 21600 })
  })
  const fake = fakeSupabase({
    access_token: 'vencido',
    expires_at: new Date(Date.now() - 1000).toISOString(),
  })
  try {
    const token = await getMercadoLivreToken(fake.client, 'id-123', 'segredo')
    assertEquals(token, 'token-novo')
    assertEquals(fake.upserts.length, 1)
  } finally {
    restore()
  }
})

Deno.test('getMercadoLivreToken: sem cache nenhum busca token novo', async () => {
  const restore = stubFetch(() => jsonResponse({ access_token: 'primeiro-token', expires_in: 21600 }))
  const fake = fakeSupabase(null)
  try {
    const token = await getMercadoLivreToken(fake.client, 'id', 'secret')
    assertEquals(token, 'primeiro-token')
  } finally {
    restore()
  }
})

Deno.test('getMercadoLivreToken: HTTP não-2xx no oauth/token lança MercadoLivreAuthError', async () => {
  const restore = stubFetch(() => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 }))
  const fake = fakeSupabase(null)
  try {
    await assertRejects(() => getMercadoLivreToken(fake.client, 'id', 'errado'), MercadoLivreAuthError)
  } finally {
    restore()
  }
})

Deno.test('getMercadoLivreToken: resposta sem access_token/expires_in lança erro descritivo', async () => {
  const restore = stubFetch(() => jsonResponse({ foo: 'bar' }))
  const fake = fakeSupabase(null)
  try {
    const err = await assertRejects(() => getMercadoLivreToken(fake.client, 'id', 'secret'), MercadoLivreAuthError)
    assertStringIncludes(err.message, 'formato inesperado')
  } finally {
    restore()
  }
})

Deno.test('getMercadoLivreToken: falha de rede lança MercadoLivreAuthError', async () => {
  const restore = stubFetch(() => {
    throw new TypeError('network down')
  })
  const fake = fakeSupabase(null)
  try {
    await assertRejects(() => getMercadoLivreToken(fake.client, 'id', 'secret'), MercadoLivreAuthError)
  } finally {
    restore()
  }
})
