import { assertEquals, assertObjectMatch } from 'jsr:@std/assert@1'
import {
  fetchFromCosmos,
  fetchFromOpenBeautyFacts,
  fetchFromOpenFoodFacts,
  fetchFromUpcItemDb,
  guessOriginFromEan,
  normalizeBarcode,
  runCascade,
} from './catalogCascade.ts'

function stubFetch(impl: (url: string) => Promise<Response> | Response) {
  const original = globalThis.fetch
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: any) => impl(String(url))) as any
  return () => {
    globalThis.fetch = original
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

Deno.test('normalizeBarcode: prefixa UPC-A (12 dígitos) com zero para virar EAN-13', () => {
  assertEquals(normalizeBarcode('012345678905'), '0012345678905')
})

Deno.test('normalizeBarcode: mantém EAN-13 inalterado', () => {
  assertEquals(normalizeBarcode('7891000100103'), '7891000100103')
})

Deno.test('normalizeBarcode: mantém EAN-8 inalterado', () => {
  assertEquals(normalizeBarcode('12345670'), '12345670')
})

Deno.test('normalizeBarcode: remove espaços nas bordas', () => {
  assertEquals(normalizeBarcode('  012345678905  '), '0012345678905')
})

Deno.test('guessOriginFromEan: prefixo 789 é nacional', () => {
  assertEquals(guessOriginFromEan('7891000100103'), 'nacional')
})

Deno.test('guessOriginFromEan: prefixo 790 é nacional', () => {
  assertEquals(guessOriginFromEan('7900000000000'), 'nacional')
})

Deno.test('guessOriginFromEan: prefixo fora do Brasil é importado', () => {
  assertEquals(guessOriginFromEan('0012345678905'), 'importado')
})

Deno.test('fetchFromCosmos: sem chave, pula a busca sem chamar fetch', async () => {
  let called = false
  const restore = stubFetch(() => {
    called = true
    return jsonResponse({})
  })
  try {
    const result = await fetchFromCosmos('7891000100103', undefined)
    assertEquals(result, { data: null, error: null })
    assertEquals(called, false)
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: sucesso retorna o produto normalizado', async () => {
  const restore = stubFetch(() =>
    jsonResponse({
      description: 'Achocolatado em pó 400g',
      brand: { name: 'Marca X' },
      thumbnail: 'https://example.com/foto.jpg',
      ncm: { code: '1806.90.00' },
      cest: [{ code: '17.001.00' }],
    }),
  )
  try {
    const result = await fetchFromCosmos('7891000100103', 'token-123')
    assertEquals(result.error, null)
    assertObjectMatch(result.data!, {
      name: 'Achocolatado em pó 400g',
      brand: 'Marca X',
      ncm: '1806.90.00',
    })
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: avg_price > 0 vira refPrice (plano B do preço de referência)', async () => {
  const restore = stubFetch(() =>
    jsonResponse({
      description: 'Refrigerante 2L',
      avg_price: 8.5,
      min_price: 7.0,
      max_price: 10.0,
    }),
  )
  try {
    const result = await fetchFromCosmos('7891000100103', 'token-123')
    assertObjectMatch(result.data!.refPrice!, { min: 7.0, avg: 8.5, max: 10.0 })
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: avg_price 0/null é "sem referência" (não confunde com preço real)', async () => {
  const restore = stubFetch(() =>
    jsonResponse({ description: 'Produto sem preço na Cosmos', avg_price: 0, min_price: 0, max_price: 0 }),
  )
  try {
    const result = await fetchFromCosmos('7891000100103', 'token-123')
    assertEquals(result.data!.refPrice, null)
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: HTTP 401 vira erro de infra (token inválido)', async () => {
  const restore = stubFetch(() => new Response(null, { status: 401 }))
  try {
    const result = await fetchFromCosmos('7891000100103', 'token-invalido')
    assertEquals(result.data, null)
    assertEquals(result.error?.includes('401'), true)
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: HTTP 429 vira erro de infra (cota excedida)', async () => {
  const restore = stubFetch(() => new Response(null, { status: 429 }))
  try {
    const result = await fetchFromCosmos('7891000100103', 'token-123')
    assertEquals(result.data, null)
    assertEquals(result.error?.includes('429'), true)
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: resposta sem description é "não encontrado" (sem erro)', async () => {
  const restore = stubFetch(() => jsonResponse({}))
  try {
    const result = await fetchFromCosmos('0000000000000', 'token-123')
    assertEquals(result, { data: null, error: null })
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: HTTP 404 é "não encontrado" (não erro de infra) -- confirmado contra a API real', async () => {
  const restore = stubFetch(() => new Response(JSON.stringify({ message: 'O recurso solicitado não existe' }), { status: 404 }))
  try {
    const result = await fetchFromCosmos('0000000000000', 'token-123')
    assertEquals(result, { data: null, error: null })
  } finally {
    restore()
  }
})

Deno.test('fetchFromCosmos: falha de rede vira erro de infra, não lança', async () => {
  const restore = stubFetch(() => {
    throw new TypeError('network down')
  })
  try {
    const result = await fetchFromCosmos('7891000100103', 'token-123')
    assertEquals(result.data, null)
    assertEquals(typeof result.error, 'string')
  } finally {
    restore()
  }
})

Deno.test('fetchFromUpcItemDb: sucesso retorna o produto', async () => {
  const restore = stubFetch(() =>
    jsonResponse({ items: [{ title: 'Fone importado', brand: 'AudioCo', images: ['https://x/img.jpg'] }] }),
  )
  try {
    const result = await fetchFromUpcItemDb('0012345678905')
    assertObjectMatch(result.data!, { name: 'Fone importado', brand: 'AudioCo' })
  } finally {
    restore()
  }
})

Deno.test('fetchFromUpcItemDb: lista de items vazia é "não encontrado"', async () => {
  const restore = stubFetch(() => jsonResponse({ items: [] }))
  try {
    const result = await fetchFromUpcItemDb('0012345678905')
    assertEquals(result, { data: null, error: null })
  } finally {
    restore()
  }
})

Deno.test('fetchFromUpcItemDb: HTTP 400 (código não passa na validação deles) é "não encontrado", não erro', async () => {
  const restore = stubFetch(() => new Response(JSON.stringify({ code: 'INVALID_UPC' }), { status: 400 }))
  try {
    const result = await fetchFromUpcItemDb('0000000000000')
    assertEquals(result, { data: null, error: null })
  } finally {
    restore()
  }
})

Deno.test('fetchFromOpenFoodFacts: cai para product_name_pt quando só o PT está preenchido', async () => {
  const restore = stubFetch(() =>
    jsonResponse({ status: 1, product: { product_name_pt: 'Nescau 400g' } }),
  )
  try {
    const result = await fetchFromOpenFoodFacts('7891000100103')
    assertEquals(result.data?.name, 'Nescau 400g')
  } finally {
    restore()
  }
})

Deno.test('fetchFromOpenFoodFacts: status !== 1 é "não encontrado"', async () => {
  const restore = stubFetch(() => jsonResponse({ status: 0 }))
  try {
    const result = await fetchFromOpenFoodFacts('0000000000000')
    assertEquals(result, { data: null, error: null })
  } finally {
    restore()
  }
})

Deno.test('fetchFromOpenFoodFacts: HTTP 404 é "não encontrado" (convenção real da API v2, não erro de infra)', async () => {
  const restore = stubFetch(() =>
    new Response(JSON.stringify({ status: 0, status_verbose: 'product not found' }), { status: 404 }),
  )
  try {
    const result = await fetchFromOpenFoodFacts('0000000000000')
    assertEquals(result, { data: null, error: null })
  } finally {
    restore()
  }
})

Deno.test('fetchFromOpenBeautyFacts: usa o host de beleza, não o de alimentos', async () => {
  let requestedUrl = ''
  const restore = stubFetch((url) => {
    requestedUrl = url
    return jsonResponse({ status: 1, product: { product_name: 'Batom X' } })
  })
  try {
    const result = await fetchFromOpenBeautyFacts('7891000100103')
    assertEquals(result.data?.name, 'Batom X')
    assertEquals(requestedUrl.includes('world.openbeautyfacts.org'), true)
  } finally {
    restore()
  }
})

Deno.test('runCascade: origem nacional tenta Cosmos primeiro e para no primeiro sucesso', async () => {
  const calledHosts: string[] = []
  const restore = stubFetch((url) => {
    calledHosts.push(url)
    if (url.includes('cosmos')) {
      return jsonResponse({ description: 'Produto nacional' })
    }
    return jsonResponse({})
  })
  try {
    const outcome = await runCascade('7891000100103', 'nacional', { cosmosApiKey: 'token' })
    assertEquals(outcome.source, 'cosmos')
    assertEquals(outcome.result?.name, 'Produto nacional')
    assertEquals(calledHosts.length, 1) // não tentou upcitemdb/off depois do sucesso
    assertEquals(outcome.attempts, [{ source: 'cosmos', outcome: 'hit', errorDetail: null }])
  } finally {
    restore()
  }
})

Deno.test('runCascade: origem importado deixa a Cosmos por último', async () => {
  const order: string[] = []
  const restore = stubFetch((url) => {
    if (url.includes('cosmos')) order.push('cosmos')
    else if (url.includes('upcitemdb')) order.push('upcitemdb')
    else if (url.includes('openbeautyfacts')) order.push('openbeautyfacts')
    else if (url.includes('openfoodfacts')) order.push('off')
    return jsonResponse({}) // nenhuma fonte encontra -- força percorrer tudo
  })
  try {
    const outcome = await runCascade('0012345678905', 'importado', { cosmosApiKey: 'token' })
    assertEquals(outcome.result, null)
    assertEquals(order, ['upcitemdb', 'openbeautyfacts', 'off', 'cosmos'])
    // not_found limpo: uma linha 'miss' por fonte tentada, sem 'hit' nenhum.
    assertEquals(
      outcome.attempts.map((a) => a.outcome),
      ['miss', 'miss', 'miss', 'miss'],
    )
  } finally {
    restore()
  }
})

Deno.test('runCascade: erro de infra numa fonte não impede a próxima, mas marca hadInfraError', async () => {
  const restore = stubFetch((url) => {
    if (url.includes('upcitemdb')) return new Response(null, { status: 500 })
    if (url.includes('openbeautyfacts')) return jsonResponse({})
    if (url.includes('openfoodfacts')) return jsonResponse({ status: 1, product: { product_name: 'Achado na OFF' } })
    return jsonResponse({})
  })
  try {
    const outcome = await runCascade('0012345678905', 'importado', { cosmosApiKey: undefined })
    assertEquals(outcome.result?.name, 'Achado na OFF')
    assertEquals(outcome.source, 'off')
    assertEquals(outcome.hadInfraError, true)
    // upcitemdb tentado-e-errado ainda conta como consulta real (importa
    // pra cota da Cosmos e pro relatório de consultas consumidas por API).
    assertEquals(
      outcome.attempts.map((a) => [a.source, a.outcome]),
      [
        ['upcitemdb', 'error'],
        ['openbeautyfacts', 'miss'],
        ['off', 'hit'],
      ],
    )
  } finally {
    restore()
  }
})

Deno.test('runCascade: skipSources pula a fonte sem chamar fetch (cota esgotada)', async () => {
  const calledHosts: string[] = []
  const restore = stubFetch((url) => {
    calledHosts.push(url)
    if (url.includes('upcitemdb')) return jsonResponse({ items: [{ title: 'Achado no UPCitemdb' }] })
    return jsonResponse({})
  })
  try {
    const outcome = await runCascade('7891000100103', 'nacional', {
      cosmosApiKey: 'token',
      skipSources: new Set(['cosmos']),
    })
    assertEquals(outcome.source, 'upcitemdb')
    assertEquals(
      calledHosts.some((h) => h.includes('cosmos')),
      false,
    )
    // cosmos pulada não aparece em attempts -- não é uma consulta real.
    assertEquals(
      outcome.attempts.some((a) => a.source === 'cosmos'),
      false,
    )
  } finally {
    restore()
  }
})

Deno.test('runCascade: nenhuma fonte encontra e nenhum erro de infra -> not_found limpo', async () => {
  const restore = stubFetch(() => jsonResponse({ status: 0 }))
  try {
    const outcome = await runCascade('0012345678905', 'importado', { cosmosApiKey: undefined })
    assertEquals(outcome.result, null)
    assertEquals(outcome.hadInfraError, false)
  } finally {
    restore()
  }
})
