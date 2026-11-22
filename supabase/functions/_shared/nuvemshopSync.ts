// Operações da integração com a Nuvemshop que mexem no banco (decisão #66).
// Usadas por `nuvemshop-sync` (fila, importação) e `nuvemshop-oauth`
// (importação logo depois de conectar). Lógica pura em ./nuvemshop.ts.

import {
  buildCreateProductPayload,
  type CatalogIndexes,
  type CatalogStockRow,
  createNuvemshopClient,
  desiredStock,
  matchVariants,
  normalizeBarcode,
  normalizeSku,
  type NsProduct,
  type NuvemshopClient,
  NuvemshopError,
  PAGE_SIZE,
  pickVariantBySku,
  sleep,
} from './nuvemshop.ts'

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

/** Pausa entre produtos ao drenar a fila: fica abaixo dos 2 req/s da API. */
const THROTTLE_MS = 600
const DB_PAGE = 1000

export interface Credentials {
  store_id: number
  access_token: string
  auto_create: boolean
}

export async function loadCredentials(db: SupabaseClient): Promise<Credentials | null> {
  const { data, error } = await db
    .from('nuvemshop_credentials')
    .select('store_id, access_token, auto_create')
    .maybeSingle()
  if (error) throw new Error(`Erro ao ler credenciais: ${error.message}`)
  return data ?? null
}

export function clientFor(creds: Credentials): NuvemshopClient {
  return createNuvemshopClient({ storeId: creds.store_id, accessToken: creds.access_token })
}

/** Lê todas as linhas de uma consulta paginando (max_rows = 1000, decisão #50). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await build(from, from + DB_PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < DB_PAGE) break
  }
  return rows
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ---------------------------------------------------------------------------
// Um produto da fila
// ---------------------------------------------------------------------------

export type ProcessOutcome = 'synced' | 'created' | 'linked' | 'skipped' | 'retry' | 'error' | 'unlinked'

async function markUnlinked(db: SupabaseClient, catalogId: string) {
  await db.from('nuvemshop_links').delete().eq('catalog_id', catalogId)
  await db.from('nuvemshop_catalog_choices').upsert({
    catalog_id: catalogId,
    choice: 'review',
    reason: 'Produto apagado na Nuvemshop',
    updated_at: new Date().toISOString(),
  })
}

export async function processCatalog(
  db: SupabaseClient,
  api: NuvemshopClient,
  creds: Credentials,
  catalogId: string,
  attempts: number,
): Promise<ProcessOutcome> {
  const [{ data: link, error: linkError }, { data: state, error: stateError }] = await Promise.all([
    db.from('nuvemshop_links').select('ns_product_id, ns_variant_id').eq('catalog_id', catalogId).maybeSingle(),
    db.from('nuvemshop_catalog_stock').select('*').eq('catalog_id', catalogId).maybeSingle(),
  ])
  if (linkError) throw new Error(linkError.message)
  if (stateError) throw new Error(stateError.message)
  const row = state as CatalogStockRow | null

  try {
    // Vinculado: só o saldo vai pro site (preço nunca é reenviado).
    if (link) {
      const stock = desiredStock(row)
      await api.updateVariantStock(link.ns_product_id, link.ns_variant_id, stock)
      await db
        .from('nuvemshop_links')
        .update({ last_synced_stock: stock, last_synced_at: new Date().toISOString(), last_error: null, last_error_at: null })
        .eq('catalog_id', catalogId)
      return 'synced'
    }

    // Sem vínculo: cria no site se liberado e se tem saldo.
    const { data: choice } = await db
      .from('nuvemshop_catalog_choices')
      .select('choice')
      .eq('catalog_id', catalogId)
      .maybeSingle()
    const allowed = choice?.choice === 'create' || (creds.auto_create && !choice)
    if (!allowed || !row || desiredStock(row) <= 0) return 'skipped'

    // Antes de criar, procura pelo SKU: cobre produto que alguém já criou
    // lá, e uma criação anterior cujo vínculo não chegou a ser gravado.
    if (row.sku) {
      const existing = await api.getProductBySku(row.sku)
      const variant = existing ? pickVariantBySku(existing, row.sku) : null
      if (existing && variant) {
        const stock = desiredStock(row)
        await api.updateVariantStock(existing.id, variant.id, stock)
        await saveLink(db, catalogId, existing.id, variant.id, 'linked', stock)
        return 'linked'
      }
    }

    const created = await api.createProduct(buildCreateProductPayload(row))
    const variant = created.variants?.[0]
    if (!variant) throw new NuvemshopError('Produto criado sem variante', 'invalid')
    await saveLink(db, catalogId, created.id, variant.id, 'created', desiredStock(row))
    return 'created'
  } catch (err) {
    if (err instanceof NuvemshopError && err.kind === 'retry') {
      await db.rpc('nuvemshop_requeue', { p_catalog_id: catalogId, p_attempts: attempts })
      return 'retry'
    }
    if (err instanceof NuvemshopError && err.kind === 'not_found' && link) {
      await markUnlinked(db, catalogId)
      return 'unlinked'
    }
    const message = errorMessage(err)
    if (link) {
      await db
        .from('nuvemshop_links')
        .update({ last_error: message, last_error_at: new Date().toISOString() })
        .eq('catalog_id', catalogId)
    } else {
      await db.from('nuvemshop_catalog_choices').upsert({
        catalog_id: catalogId,
        choice: 'review',
        reason: `Não foi possível criar no site: ${message}`.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
    }
    return 'error'
  }
}

async function saveLink(
  db: SupabaseClient,
  catalogId: string,
  productId: number,
  variantId: number,
  origin: 'linked' | 'created',
  stock: number,
) {
  const now = new Date().toISOString()
  const { error } = await db.from('nuvemshop_links').upsert({
    catalog_id: catalogId,
    ns_product_id: productId,
    ns_variant_id: variantId,
    origin,
    last_synced_stock: stock,
    last_synced_at: now,
    last_error: null,
    last_error_at: null,
  })
  if (error) throw new Error(`Erro ao gravar vínculo: ${error.message}`)
  await db.from('nuvemshop_catalog_choices').delete().eq('catalog_id', catalogId)
  await db.from('nuvemshop_unmatched').delete().eq('ns_variant_id', variantId)
}

// ---------------------------------------------------------------------------
// Drenar a fila
// ---------------------------------------------------------------------------

export async function drainQueue(
  db: SupabaseClient,
  creds: Credentials,
  { batch = 20, maxBatches = 5 } = {},
): Promise<Record<ProcessOutcome, number>> {
  const api = clientFor(creds)
  const counts: Record<ProcessOutcome, number> = {
    synced: 0, created: 0, linked: 0, skipped: 0, retry: 0, error: 0, unlinked: 0,
  }

  for (let round = 0; round < maxBatches; round++) {
    const { data: claimed, error } = await db.rpc('nuvemshop_claim_queue', { p_limit: batch })
    if (error) throw new Error(`Erro ao ler a fila: ${error.message}`)
    if (!claimed || claimed.length === 0) break

    for (const item of claimed as { catalog_id: string; attempts: number }[]) {
      try {
        counts[await processCatalog(db, api, creds, item.catalog_id, item.attempts)]++
      } catch (err) {
        // Erro do nosso lado (banco): volta pra fila em vez de se perder.
        console.error('nuvemshop-sync: erro processando', item.catalog_id, err)
        await db.rpc('nuvemshop_requeue', { p_catalog_id: item.catalog_id, p_attempts: item.attempts })
        counts.retry++
      }
      await sleep(THROTTLE_MS)
    }
    if (claimed.length < batch) break
  }
  return counts
}

// ---------------------------------------------------------------------------
// Importação: casa o que já existe no site e monta a lista de revisão
// ---------------------------------------------------------------------------

export async function listAllProducts(api: NuvemshopClient): Promise<NsProduct[]> {
  const all: NsProduct[] = []
  for (let page = 1; page <= 500; page++) {
    let products: NsProduct[]
    try {
      products = await api.listProducts(page)
    } catch (err) {
      // A API responde 404 quando a página passa do fim.
      if (err instanceof NuvemshopError && err.kind === 'not_found') break
      throw err
    }
    all.push(...products)
    if (products.length < PAGE_SIZE) break
    await sleep(THROTTLE_MS)
  }
  return all
}

export async function buildCatalogIndexes(db: SupabaseClient): Promise<CatalogIndexes> {
  const [catalogs, codes, links] = await Promise.all([
    fetchAll<{ id: string; ean: string | null }>((from, to) =>
      db.from('product_catalog').select('id, ean').eq('active', true).not('ean', 'is', null).order('id').range(from, to)),
    fetchAll<{ catalog_id: string; internal_code: string | null }>((from, to) =>
      db.from('stock_items').select('catalog_id, internal_code').eq('active', true).not('catalog_id', 'is', null)
        .order('id').range(from, to)),
    fetchAll<{ catalog_id: string; ns_variant_id: number }>((from, to) =>
      db.from('nuvemshop_links').select('catalog_id, ns_variant_id').order('catalog_id').range(from, to)),
  ])

  const byEan = new Map<string, string>()
  for (const c of catalogs) {
    const ean = normalizeBarcode(c.ean)
    if (ean && !byEan.has(ean)) byEan.set(ean, c.id)
  }
  const byInternalCode = new Map<string, string>()
  for (const s of codes) {
    const code = normalizeSku(s.internal_code)
    if (code && !byInternalCode.has(code)) byInternalCode.set(code, s.catalog_id)
  }
  return {
    byEan,
    byInternalCode,
    linkedCatalogIds: new Set(links.map((l) => l.catalog_id)),
    linkedVariantIds: new Set(links.map((l) => Number(l.ns_variant_id))),
  }
}

export async function runImport(db: SupabaseClient, creds: Credentials) {
  const api = clientFor(creds)
  const [products, idx] = await Promise.all([listAllProducts(api), buildCatalogIndexes(db)])
  const { matches, unmatched } = matchVariants(products, idx)

  // Vínculos novos (origin = linked) -- e cada um entra na fila pra receber
  // o saldo daqui.
  for (let i = 0; i < matches.length; i += 200) {
    const chunk = matches.slice(i, i + 200)
    const { error } = await db.from('nuvemshop_links').upsert(
      chunk.map((m) => ({ ...m, origin: 'linked' })),
      { onConflict: 'catalog_id', ignoreDuplicates: true },
    )
    if (error) throw new Error(`Erro ao gravar vínculos: ${error.message}`)
    await db.from('nuvemshop_catalog_choices').delete().in('catalog_id', chunk.map((m) => m.catalog_id))
  }

  // Lista "Do site, sem par aqui": substitui a anterior mantendo o "Ignorar".
  const existing = await fetchAll<{ ns_variant_id: number; ignored: boolean }>((from, to) =>
    db.from('nuvemshop_unmatched').select('ns_variant_id, ignored').order('ns_variant_id').range(from, to))
  const ignored = new Set(existing.filter((e) => e.ignored).map((e) => Number(e.ns_variant_id)))
  const current = new Set(unmatched.map((u) => u.ns_variant_id))
  const stale = existing.map((e) => Number(e.ns_variant_id)).filter((id) => !current.has(id))
  for (let i = 0; i < stale.length; i += 200) {
    await db.from('nuvemshop_unmatched').delete().in('ns_variant_id', stale.slice(i, i + 200))
  }
  const now = new Date().toISOString()
  for (let i = 0; i < unmatched.length; i += 200) {
    const { error } = await db.from('nuvemshop_unmatched').upsert(
      unmatched.slice(i, i + 200).map((u) => ({ ...u, ignored: ignored.has(u.ns_variant_id), updated_at: now })),
    )
    if (error) throw new Error(`Erro ao gravar lista de revisão: ${error.message}`)
  }

  // Todo produto vinculado recebe o saldo daqui (inclusive os de antes).
  const linked = await fetchAll<{ catalog_id: string }>((from, to) =>
    db.from('nuvemshop_links').select('catalog_id').order('catalog_id').range(from, to))
  for (let i = 0; i < linked.length; i += 500) {
    const { error } = await db.from('nuvemshop_sync_queue').upsert(
      linked.slice(i, i + 500).map((l) => ({ catalog_id: l.catalog_id, available_at: now })),
    )
    if (error) throw new Error(`Erro ao enfileirar: ${error.message}`)
  }

  await db.from('nuvemshop_credentials').update({ last_import_at: now }).eq('id', true)

  return {
    products: products.length,
    linked: matches.length,
    unmatched: unmatched.length,
  }
}
