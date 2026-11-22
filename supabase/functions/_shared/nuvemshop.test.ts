import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1'
import {
  buildCreateProductPayload,
  type CatalogIndexes,
  classifyStatus,
  createNuvemshopClient,
  desiredStock,
  exchangeCodeForToken,
  matchVariants,
  normalizeBarcode,
  type NsProduct,
  NuvemshopError,
  orderToWebSale,
  pickVariantBySku,
  signState,
  verifyState,
  verifyWebhookSignature,
} from './nuvemshop.ts'

function indexes(partial: Partial<CatalogIndexes> = {}): CatalogIndexes {
  return {
    byEan: new Map(),
    byInternalCode: new Map(),
    linkedCatalogIds: new Set(),
    linkedVariantIds: new Set(),
    ...partial,
  }
}

function product(id: number, variants: Partial<NsProduct['variants'][number]>[], name = `Produto ${id}`): NsProduct {
  return {
    id,
    name: { pt: name },
    variants: variants.map((v, i) => ({ id: id * 10 + i, product_id: id, ...v })),
  }
}

Deno.test('classifyStatus: 429/5xx retry, 404 not_found, 401/403 auth, resto invalid', () => {
  assertEquals(classifyStatus(429), 'retry')
  assertEquals(classifyStatus(503), 'retry')
  assertEquals(classifyStatus(404), 'not_found')
  assertEquals(classifyStatus(401), 'auth')
  assertEquals(classifyStatus(403), 'auth')
  assertEquals(classifyStatus(422), 'invalid')
})

Deno.test('normalizeBarcode: só dígitos e UPC-A vira EAN-13', () => {
  assertEquals(normalizeBarcode(' 789-1234567890 '), '7891234567890')
  assertEquals(normalizeBarcode('012345678905'), '0012345678905')
  assertEquals(normalizeBarcode(''), null)
  assertEquals(normalizeBarcode(null), null)
})

Deno.test('matchVariants: casa pelo código de barras, SKU=EAN e SKU=código interno', () => {
  const idx = indexes({
    byEan: new Map([
      ['7890000000001', 'cat-a'],
      ['7890000000002', 'cat-b'],
    ]),
    byInternalCode: new Map([['EST-000318', 'cat-c']]),
  })
  const { matches, unmatched } = matchVariants(
    [
      product(1, [{ barcode: '7890000000001' }]),
      product(2, [{ barcode: null, sku: '7890000000002' }]),
      product(3, [{ sku: 'est-000318' }]),
      product(4, [{ barcode: '1111111111111', sku: 'PH12' }], 'Pote hermético'),
    ],
    idx,
  )
  assertEquals(matches.map((m) => [m.catalog_id, m.ns_product_id, m.ns_variant_id]), [
    ['cat-a', 1, 10],
    ['cat-b', 2, 20],
    ['cat-c', 3, 30],
  ])
  assertEquals(unmatched.length, 1)
  assertEquals(unmatched[0].name, 'Pote hermético')
  assertEquals(unmatched[0].sku, 'PH12')
})

Deno.test('matchVariants: um catálogo casa com uma variante só; já vinculados são pulados', () => {
  const idx = indexes({
    byEan: new Map([['7890000000001', 'cat-a'], ['7890000000009', 'cat-z']]),
    linkedCatalogIds: new Set(['cat-z']),
    linkedVariantIds: new Set([99]),
  })
  const { matches, unmatched } = matchVariants(
    [
      product(1, [{ barcode: '7890000000001' }, { barcode: '7890000000001', values: [{ pt: 'M' }] }], 'Camiseta'),
      product(5, [{ barcode: '7890000000009' }]),
      { id: 9, name: 'Já vinculado', variants: [{ id: 99, product_id: 9, barcode: '7890000000001' }] },
    ],
    idx,
  )
  assertEquals(matches.map((m) => m.ns_variant_id), [10])
  // segunda variante com o mesmo código e o produto cujo catálogo já tem
  // vínculo vão pra revisão; a variante já vinculada some.
  assertEquals(unmatched.map((u) => [u.ns_variant_id, u.name]), [
    [11, 'Camiseta · M'],
    [50, 'Produto 5'],
  ])
})

Deno.test('desiredStock: produto excluído aqui vai a 0, nunca negativo', () => {
  assertEquals(desiredStock({ catalog_active: true, available: 4 }), 4)
  assertEquals(desiredStock({ catalog_active: false, available: 4 }), 0)
  assertEquals(desiredStock({ catalog_active: true, available: -2 }), 0)
  assertEquals(desiredStock(null), 0)
})

Deno.test('buildCreateProductPayload: preço de criação, código de barras, SKU e foto', () => {
  const payload = buildCreateProductPayload({
    catalog_id: 'c',
    ean: '7890000000001',
    name: ' Air fryer ',
    brand: 'Mondial',
    photo_url: 'https://x/foto.jpg',
    catalog_active: true,
    available: 3,
    create_price: '289.9',
    sku: '7890000000001',
  })
  assertEquals(payload, {
    name: { pt: 'Air fryer' },
    brand: 'Mondial',
    published: true,
    images: [{ src: 'https://x/foto.jpg' }],
    variants: [{ price: '289.90', stock_management: true, stock: 3, sku: '7890000000001', barcode: '7890000000001' }],
  })

  const semCodigo = buildCreateProductPayload({
    catalog_id: 'c', ean: null, name: 'Luminária', brand: null, photo_url: null,
    catalog_active: true, available: 1, create_price: 59, sku: 'EST-000318',
  })
  assertEquals(semCodigo.variants[0], { price: '59.00', stock_management: true, stock: 1, sku: 'EST-000318' })
  assertFalse('images' in semCodigo)
})

Deno.test('pickVariantBySku: a variante do SKU, senão a primeira', () => {
  const p = product(1, [{ sku: 'A' }, { sku: 'b' }])
  assertEquals(pickVariantBySku(p, 'B')?.id, 11)
  assertEquals(pickVariantBySku(p, 'Z')?.id, 10)
})

Deno.test('orderToWebSale: frete fora, desconto = subtotal − (total − frete)', () => {
  const sale = orderToWebSale({
    id: 555,
    number: 1287,
    total: '590.00',
    shipping_cost_customer: '20.00',
    products: [
      { variant_id: 9001, price: '280.00', quantity: 2, name: 'Air fryer' },
      { variant_id: '9002', price: '30', quantity: '1', name: 'Fone' },
      { variant_id: null, price: '5', quantity: 0, name: 'zerado' },
    ],
  })
  assertEquals(sale.external_order_id, '555')
  assertEquals(sale.external_order_number, '1287')
  assertEquals(sale.items.map((i) => [i.ns_variant_id, i.quantity, i.unit_price]), [[9001, 2, 280], [9002, 1, 30]])
  assertEquals(sale.discount, 20) // subtotal 590 − (590 − 20) = 20
})

Deno.test('orderToWebSale: frete grátis e sem desconto', () => {
  const sale = orderToWebSale({
    id: 1, total: '100', shipping_cost_customer: '0',
    products: [{ variant_id: 1, price: '50', quantity: 2 }],
  })
  assertEquals(sale.discount, 0)
})

Deno.test('verifyWebhookSignature: HMAC hex do corpo cru com o client secret', async () => {
  // HMAC-SHA256("segredo", '{"event":"order/paid"}') calculado à parte.
  const body = '{"event":"order/paid"}'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('segredo'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))),
    (b) => b.toString(16).padStart(2, '0')).join('')

  assert(await verifyWebhookSignature(body, sig, 'segredo'))
  assert(await verifyWebhookSignature(body, sig.toUpperCase(), 'segredo'))
  assertFalse(await verifyWebhookSignature(body + ' ', sig, 'segredo'))
  assertFalse(await verifyWebhookSignature(body, sig, 'outro'))
  assertFalse(await verifyWebhookSignature(body, null, 'segredo'))
})

Deno.test('state do OAuth: válido por 15 min, assinado com o secret', async () => {
  const now = 1_800_000_000_000
  const state = await signState('segredo', now)
  assert(await verifyState(state, 'segredo', now + 60_000))
  assertFalse(await verifyState(state, 'segredo', now + 16 * 60_000))
  assertFalse(await verifyState(state, 'outro', now))
  assertFalse(await verifyState(state.replace('v1.1', 'v1.2'), 'segredo', now))
  assertFalse(await verifyState(null, 'segredo', now))
})

Deno.test('cliente: manda token e User-Agent; erro HTTP vira NuvemshopError classificado', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const api = createNuvemshopClient({
    storeId: 123,
    accessToken: 'tok',
    fetchImpl: ((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/variants/20')) return Promise.resolve(new Response('slow down', { status: 429 }))
      if (url.includes('/products/sku/')) return Promise.resolve(new Response('{}', { status: 404 }))
      return Promise.resolve(Response.json({ id: 10, product_id: 1, stock: 4 }))
    }) as typeof fetch,
  })

  await api.updateVariantStock(1, 10, 4)
  const headers = calls[0].init!.headers as Record<string, string>
  assertEquals(calls[0].url, 'https://api.tiendanube.com/v1/123/products/1/variants/10')
  assertEquals(calls[0].init!.method, 'PUT')
  assertEquals(JSON.parse(String(calls[0].init!.body)), { stock_management: true, stock: 4 })
  assertEquals(headers.Authentication, 'bearer tok')
  assert(headers['User-Agent'].startsWith('Sistema-PDV'))

  const err = await assertRejects(() => api.updateVariantStock(2, 20, 1), NuvemshopError)
  assertEquals(err.kind, 'retry')

  assertEquals(await api.getProductBySku('EST 1'), null)
  assertEquals(calls.at(-1)!.url, 'https://api.tiendanube.com/v1/123/products/sku/EST%201')
})

Deno.test('exchangeCodeForToken: devolve token e id da loja', async () => {
  const result = await exchangeCodeForToken('123', 'sec', 'xyz', ((_url: string, init?: RequestInit) => {
    const body = new URLSearchParams(String(init!.body))
    assertEquals(body.get('grant_type'), 'authorization_code')
    assertEquals(body.get('code'), 'xyz')
    return Promise.resolve(Response.json({ access_token: 'abc', token_type: 'bearer', user_id: '789' }))
  }) as typeof fetch)
  assertEquals(result, { accessToken: 'abc', storeId: 789 })

  await assertRejects(
    () => exchangeCodeForToken('123', 'sec', 'velho', (() =>
      Promise.resolve(Response.json({ error: 'invalid_grant' }, { status: 400 }))) as typeof fetch),
    NuvemshopError,
    'invalid_grant',
  )
})
