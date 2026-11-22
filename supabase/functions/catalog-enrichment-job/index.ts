// Job diário (pg_cron + pg_net, ver migration 0007): reprocessa
// product_catalog com enrichment_status='pending', respeitando a cota da
// Cosmos (Basic = 25/dia) e priorizando produtos com estoque não vendido.
// Não é chamada de usuário -- verify_jwt fica desligado no config.toml e a
// proteção é comparar o Bearer recebido com a própria service role key
// (só quem já tem acesso de service role no projeto consegue disparar).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { type CatalogSource, type ProductOrigin, runCascade } from '../_shared/catalogCascade.ts'
import { reportInfraErrorToSentry } from '../_shared/sentry.ts'
import { isServiceRoleToken } from '../_shared/serviceAuth.ts'

const COSMOS_DAILY_LIMIT = 25
/** Depois de N tentativas sem resolver (infra ou not_found), o job para de
 * insistir sozinho -- fica pending pro operador tratar manualmente na fila
 * de catálogo pendente (evita bater nas APIs pra sempre por um EAN que
 * nenhuma fonte tem). */
const MAX_ENRICHMENT_ATTEMPTS = 10
const BATCH_LIMIT = 100

interface PendingRow {
  id: string
  ean: string | null
  origin: ProductOrigin | null
  enrichment_attempts: number
  stock_items: { quantity: number; quantity_sold: number }[]
}

Deno.serve(async (req) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!(await isServiceRoleToken(token, serviceRoleKey))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
  const cosmosApiKey = Deno.env.get('COSMOS_API_KEY')

  const startOfDayUtc = new Date()
  startOfDayUtc.setUTCHours(0, 0, 0, 0)
  // Conta toda TENTATIVA de Cosmos (hit/miss/error), não só as que
  // resolveram -- uma consulta perdida ainda gastou cota real.
  const { count: cosmosUsedToday } = await supabase
    .from('catalog_lookup_log')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'cosmos')
    .gte('created_at', startOfDayUtc.toISOString())

  let cosmosCallsThisRun = 0
  const cosmosBudgetLeft = () => COSMOS_DAILY_LIMIT - (cosmosUsedToday ?? 0) - cosmosCallsThisRun

  const { data: pending, error: selectError } = await supabase
    .from('product_catalog')
    .select('id, ean, origin, enrichment_attempts, stock_items(quantity, quantity_sold)')
    .eq('enrichment_status', 'pending')
    .lt('enrichment_attempts', MAX_ENRICHMENT_ATTEMPTS)
    .order('enrichment_last_attempt_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT)

  if (selectError) {
    console.error('catalog-enrichment-job: erro ao buscar pendentes', selectError)
    return new Response(JSON.stringify({ error: selectError.message }), { status: 500 })
  }

  // Prioriza produtos com estoque ainda não vendido -- são os que mais
  // importam pro operador resolver rápido.
  const rows = (pending ?? []) as PendingRow[]
  const hasActiveStock = (row: PendingRow) =>
    row.stock_items.some((si) => si.quantity_sold < si.quantity)
  const ordered = [...rows.filter(hasActiveStock), ...rows.filter((r) => !hasActiveStock(r))]

  let processed = 0
  let resolved = 0

  for (const row of ordered) {
    if (!row.ean) continue // defensivo: nao deveria existir pending sem ean

    const skipSources = new Set<CatalogSource>()
    if (cosmosBudgetLeft() <= 0) skipSources.add('cosmos')

    const origin = row.origin ?? 'importado'
    const outcome = await runCascade(row.ean, origin, { cosmosApiKey, skipSources })
    processed++
    cosmosCallsThisRun += outcome.attempts.filter((a) => a.source === 'cosmos').length

    if (outcome.attempts.length > 0) {
      await supabase.from('catalog_lookup_log').insert(
        outcome.attempts.map((a) => ({
          ean: row.ean,
          origin,
          source: a.source,
          outcome: a.outcome,
          error_detail: a.errorDetail,
        })),
      )
    }

    if (outcome.result && outcome.source) {
      const ncmPending = origin === 'importado' && !outcome.result.ncm
      await supabase
        .from('product_catalog')
        .update({
          name: outcome.result.name,
          brand: outcome.result.brand,
          photo_url: outcome.result.photo_url,
          ncm: outcome.result.ncm,
          cest: outcome.result.cest,
          source: outcome.source,
          ncm_pending: ncmPending,
          enrichment_status: 'resolved',
          enrichment_attempts: row.enrichment_attempts + 1,
          enrichment_last_attempt_at: new Date().toISOString(),
          ref_price_min: outcome.result.refPrice?.min ?? null,
          ref_price_avg: outcome.result.refPrice?.avg ?? null,
          ref_price_max: outcome.result.refPrice?.max ?? null,
          ref_price_updated_at: outcome.result.refPrice ? new Date().toISOString() : null,
        })
        .eq('id', row.id)

      resolved++
      continue
    }

    await supabase
      .from('product_catalog')
      .update({
        enrichment_attempts: row.enrichment_attempts + 1,
        enrichment_last_attempt_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (outcome.hadInfraError) {
      await reportInfraErrorToSentry(`Retry diário de catálogo falhou: ${outcome.lastErrorDetail}`, {
        ean: row.ean,
      })
    }
  }

  return Response.json({ processed, resolved, cosmosCallsThisRun })
})
