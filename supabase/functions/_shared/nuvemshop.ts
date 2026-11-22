// Integração com a Nuvemshop (decisão #66): cliente da API REST + funções
// puras usadas pelas Edge Functions `nuvemshop-sync`, `nuvemshop-oauth` e
// `nuvemshop-webhook`. As funções puras ficam separadas do I/O pra serem
// testadas sem rede (nuvemshop.test.ts).
//
// Referência da API: https://github.com/TiendaNube/api-docs
//   * base https://api.tiendanube.com/v1/{store_id} (domínio documentado; a
//     Nuvemshop é a marca brasileira da mesma plataforma)
//   * token OAuth não expira (só invalida se reinstalarem o app)
//   * rate limit: leaky bucket de 40 req, escoa 2 req/s -> 429 quando estoura
//   * paginação: per_page até 200

const API_BASE = 'https://api.tiendanube.com/v1'
const TOKEN_URL = 'https://www.tiendanube.com/apps/authorize/token'
const AUTHORIZE_URL = 'https://www.nuvemshop.com.br/apps'
const USER_AGENT = 'Sistema-PDV'
const FETCH_TIMEOUT_MS = 15_000
export const PAGE_SIZE = 200

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/**
 * - retry: 429/5xx/rede -- volta pra fila com espera (nuvemshop_requeue)
 * - not_found: 404 -- o produto foi apagado na Nuvemshop
 * - auth: 401/403 -- token inválido (app desinstalado)
 * - invalid: outro 4xx -- dado recusado; grava em last_error pro dono ver
 */
export type NuvemshopErrorKind = 'retry' | 'not_found' | 'auth' | 'invalid'

export class NuvemshopError extends Error {
  constructor(
    message: string,
    readonly kind: NuvemshopErrorKind,
    readonly status?: number,
  ) {
    super(message)
  }
}

export function classifyStatus(status: number): NuvemshopErrorKind {
  if (status === 429 || status >= 500) return 'retry'
  if (status === 404) return 'not_found'
  if (status === 401 || status === 403) return 'auth'
  return 'invalid'
}

// ---------------------------------------------------------------------------
// Tipos da API (só os campos que usamos)
// ---------------------------------------------------------------------------

export type LocalizedText = string | Record<string, string | null | undefined> | null | undefined

export interface NsVariant {
  id: number
  product_id: number
  price?: string | null
  stock?: number | null
  stock_management?: boolean
  sku?: string | null
  barcode?: string | null
  values?: { pt?: string; es?: string; en?: string }[]
}

export interface NsProduct {
  id: number
  name: LocalizedText
  variants: NsVariant[]
  images?: { src: string }[]
}

export interface NsOrderProduct {
  variant_id: number | string | null
  product_id?: number | string | null
  name?: string | null
  price: string | number
  quantity: number | string
}

export interface NsOrder {
  id: number | string
  number?: number | string | null
  payment_status?: string | null
  status?: string | null
  subtotal?: string | number | null
  total?: string | number | null
  shipping_cost_customer?: string | number | null
  products: NsOrderProduct[]
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export interface NuvemshopClientOptions {
  storeId: number | string
  accessToken: string
  fetchImpl?: typeof fetch
}

export function createNuvemshopClient({ storeId, accessToken, fetchImpl }: NuvemshopClientOptions) {
  const doFetch = fetchImpl ?? fetch

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await doFetch(`${API_BASE}/${storeId}${path}`, {
        method,
        headers: {
          // A documentação antiga usa `Authentication: bearer`, a nova usa
          // `Authorization: Bearer` -- mandamos os dois.
          Authentication: `bearer ${accessToken}`,
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (err) {
      throw new NuvemshopError(`${method} ${path}: falha de rede (${String(err)})`, 'retry')
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new NuvemshopError(
        `${method} ${path}: HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ''}`,
        classifyStatus(res.status),
        res.status,
      )
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    getStore: () =>
      request<{ name: LocalizedText; url_with_protocol?: string; original_domain?: string }>('GET', '/store'),

    listProducts: (page: number) =>
      request<NsProduct[]>('GET', `/products?page=${page}&per_page=${PAGE_SIZE}`),

    /** null quando nenhum produto tem o SKU (404). */
    async getProductBySku(sku: string): Promise<NsProduct | null> {
      try {
        return await request<NsProduct>('GET', `/products/sku/${encodeURIComponent(sku)}`)
      } catch (err) {
        if (err instanceof NuvemshopError && err.kind === 'not_found') return null
        throw err
      }
    },

    createProduct: (payload: CreateProductPayload) => request<NsProduct>('POST', '/products', payload),

    updateVariantStock: (productId: number, variantId: number, stock: number) =>
      request<NsVariant>('PUT', `/products/${productId}/variants/${variantId}`, {
        stock_management: true,
        stock,
      }),

    getOrder: (orderId: string | number) => request<NsOrder>('GET', `/orders/${orderId}`),

    listWebhooks: () => request<{ id: number; event: string; url: string }[]>('GET', '/webhooks'),

    createWebhook: (event: string, url: string) =>
      request<{ id: number }>('POST', '/webhooks', { event, url }),
  }
}

export type NuvemshopClient = ReturnType<typeof createNuvemshopClient>

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(appId: string, state: string): string {
  return `${AUTHORIZE_URL}/${encodeURIComponent(appId)}/authorize?state=${encodeURIComponent(state)}`
}

export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; storeId: number }> {
  let res: Response
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    throw new NuvemshopError(`authorize/token: falha de rede (${String(err)})`, 'retry')
  }
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    user_id?: string | number
    error?: string
    error_description?: string
  }
  if (!res.ok || !data.access_token || data.user_id == null) {
    throw new NuvemshopError(
      `authorize/token: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`,
      classifyStatus(res.status || 400),
      res.status,
    )
  }
  return { accessToken: data.access_token, storeId: Number(data.user_id) }
}

// ---------------------------------------------------------------------------
// HMAC (state do OAuth e assinatura dos webhooks)
// ---------------------------------------------------------------------------

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Webhook: X-Linkedstore-HMAC-SHA256 = hex(HMAC-SHA256(corpo cru, client secret)). */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  clientSecret: string,
): Promise<boolean> {
  if (!header) return false
  const expected = await hmacHex(clientSecret, rawBody)
  return constantTimeEqual(expected, header.trim().toLowerCase())
}

const STATE_MAX_AGE_MS = 15 * 60_000

/**
 * `state` do OAuth: só o dono logado gera (via nuvemshop-sync), e a function
 * de callback recusa qualquer instalação sem um state válido e recente.
 * Sem isso, qualquer pessoa que instalasse o app na PRÓPRIA loja trocaria as
 * credenciais e o estoque passaria a ser enviado pra loja dela.
 */
export async function signState(secret: string, now = Date.now()): Promise<string> {
  const payload = `v1.${now}`
  return `${payload}.${await hmacHex(secret, payload)}`
}

export async function verifyState(state: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!state) return false
  const parts = state.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return false
  const issuedAt = Number(parts[1])
  if (!Number.isFinite(issuedAt) || now - issuedAt > STATE_MAX_AGE_MS || issuedAt - now > 60_000) {
    return false
  }
  const expected = await hmacHex(secret, `${parts[0]}.${parts[1]}`)
  return constantTimeEqual(expected, parts[2])
}

// ---------------------------------------------------------------------------
// Funções puras
// ---------------------------------------------------------------------------

export function localizedText(value: LocalizedText): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.pt ?? value.es ?? value.en ?? Object.values(value).find((v) => !!v) ?? ''
}

/**
 * Normaliza um código de barras pra comparar com product_catalog.ean: só
 * dígitos, UPC-A de 12 dígitos vira EAN-13 com zero à esquerda (mesma regra
 * do catalog-lookup). Vazio -> null.
 */
export function normalizeBarcode(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 12 ? `0${digits}` : digits
}

export function normalizeSku(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

export interface CatalogIndexes {
  /** EAN normalizado -> catalog_id */
  byEan: Map<string, string>
  /** código interno (maiúsculo) -> catalog_id, pra produto sem código de barras */
  byInternalCode: Map<string, string>
  /** catálogos que já têm vínculo (não vincula de novo) */
  linkedCatalogIds: Set<string>
  /** variantes que já têm vínculo */
  linkedVariantIds: Set<number>
}

export interface VariantMatch {
  catalog_id: string
  ns_product_id: number
  ns_variant_id: number
}

export interface UnmatchedVariant {
  ns_variant_id: number
  ns_product_id: number
  name: string
  barcode: string | null
  sku: string | null
  stock: number | null
  image_url: string | null
}

/** Nome exibido de uma variante: "Camiseta · M" quando tem atributos. */
export function variantDisplayName(product: NsProduct, variant: NsVariant): string {
  const base = localizedText(product.name) || `Produto ${product.id}`
  const values = (variant.values ?? []).map((v) => v.pt ?? v.es ?? v.en).filter(Boolean)
  return values.length > 0 ? `${base} · ${values.join(' / ')}` : base
}

/**
 * Casa as variantes do site com o catálogo daqui, nessa ordem:
 *   1. campo "Código de barras" (barcode) = EAN  -- regra do dono
 *   2. SKU = EAN (produtos criados por outras ferramentas às vezes guardam ali)
 *   3. SKU = código interno (produto sem código de barras)
 * Um catálogo casa com no máximo uma variante; a primeira encontrada fica, as
 * demais vão pra lista de revisão.
 */
export function matchVariants(
  products: NsProduct[],
  idx: CatalogIndexes,
): { matches: VariantMatch[]; unmatched: UnmatchedVariant[] } {
  const matches: VariantMatch[] = []
  const unmatched: UnmatchedVariant[] = []
  const taken = new Set(idx.linkedCatalogIds)

  for (const product of products) {
    for (const variant of product.variants ?? []) {
      if (idx.linkedVariantIds.has(variant.id)) continue

      const barcode = normalizeBarcode(variant.barcode)
      const sku = normalizeSku(variant.sku)
      const skuDigits = normalizeBarcode(variant.sku)
      const catalogId =
        (barcode && idx.byEan.get(barcode)) ||
        (skuDigits && idx.byEan.get(skuDigits)) ||
        (sku && idx.byInternalCode.get(sku)) ||
        null

      if (catalogId && !taken.has(catalogId)) {
        taken.add(catalogId)
        matches.push({ catalog_id: catalogId, ns_product_id: product.id, ns_variant_id: variant.id })
      } else {
        unmatched.push({
          ns_variant_id: variant.id,
          ns_product_id: product.id,
          name: variantDisplayName(product, variant),
          barcode: variant.barcode?.trim() || null,
          sku: variant.sku?.trim() || null,
          stock: variant.stock ?? null,
          image_url: product.images?.[0]?.src ?? null,
        })
      }
    }
  }
  return { matches, unmatched }
}

/** Linha da view nuvemshop_catalog_stock. */
export interface CatalogStockRow {
  catalog_id: string
  ean: string | null
  name: string | null
  brand: string | null
  photo_url: string | null
  catalog_active: boolean
  available: number
  create_price: number | string | null
  sku: string | null
}

/** Saldo que vai pro site: 0 quando o produto foi excluído aqui. */
export function desiredStock(row: Pick<CatalogStockRow, 'catalog_active' | 'available'> | null): number {
  if (!row || !row.catalog_active) return 0
  return Math.max(0, Math.trunc(Number(row.available) || 0))
}

export interface CreateProductPayload {
  name: { pt: string }
  brand?: string
  published: boolean
  images?: { src: string }[]
  variants: {
    price: string
    stock_management: boolean
    stock: number
    sku?: string
    barcode?: string
  }[]
}

/**
 * Produto novo no site. O preço vai SÓ aqui (regra do dono): o maior
 * sale_price entre os lotes com saldo. Depois disso é editado na Nuvemshop.
 */
export function buildCreateProductPayload(row: CatalogStockRow): CreateProductPayload {
  const price = Number(row.create_price ?? 0)
  const payload: CreateProductPayload = {
    name: { pt: (row.name ?? '').trim() || 'Produto sem nome' },
    published: true,
    variants: [
      {
        price: price.toFixed(2),
        stock_management: true,
        stock: desiredStock(row),
        ...(row.sku ? { sku: row.sku } : {}),
        ...(row.ean ? { barcode: row.ean } : {}),
      },
    ],
  }
  if (row.brand?.trim()) payload.brand = row.brand.trim()
  if (row.photo_url) payload.images = [{ src: row.photo_url }]
  return payload
}

/** Escolhe a variante de um produto achado por SKU (a do SKU, senão a primeira). */
export function pickVariantBySku(product: NsProduct, sku: string): NsVariant | null {
  const wanted = normalizeSku(sku)
  return product.variants?.find((v) => normalizeSku(v.sku) === wanted) ?? product.variants?.[0] ?? null
}

function toNumber(value: string | number | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export interface WebSaleInput {
  external_order_id: string
  external_order_number: string | null
  discount: number
  items: { ns_variant_id: number | null; quantity: number; unit_price: number; name: string }[]
}

/**
 * Pedido da Nuvemshop -> argumento de create_web_sale. Frete não entra no
 * faturamento (não é mercadoria). Desconto = subtotal dos itens − (total −
 * frete): cobre cupom, desconto do meio de pagamento e promoção sem
 * depender de cada campo da API.
 */
export function orderToWebSale(order: NsOrder): WebSaleInput {
  const items = (order.products ?? [])
    .map((p) => ({
      ns_variant_id: p.variant_id == null || p.variant_id === '' ? null : Number(p.variant_id),
      quantity: Math.trunc(toNumber(p.quantity)),
      unit_price: Math.round(toNumber(p.price) * 100) / 100,
      name: (p.name ?? '').trim(),
    }))
    .filter((i) => i.quantity > 0)

  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const goods = toNumber(order.total) - toNumber(order.shipping_cost_customer)
  const discount = Math.max(0, Math.round((subtotal - goods) * 100) / 100)

  return {
    external_order_id: String(order.id),
    external_order_number: order.number == null ? null : String(order.number),
    discount: order.total == null ? 0 : discount,
    items,
  }
}

export const WEBHOOK_EVENTS = ['order/paid', 'order/cancelled', 'product/deleted'] as const

/** Webhooks obrigatórios da LGPD: não guardamos dado de cliente, só confirma. */
export const LGPD_EVENTS = ['store/redact', 'customers/redact', 'customers/data_request']

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
