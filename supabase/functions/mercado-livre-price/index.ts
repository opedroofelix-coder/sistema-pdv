// Preco de referencia do Mercado Livre (CLAUDE.md secao 1, decisao #10):
// busca por EAN, calcula min/media/max dos anuncios ativos, cache de 30
// dias em product_catalog.ref_price_*. Migrou pro servidor porque a API
// publica de busca passou a exigir OAuth (403 sem token, ver decisao #22) --
// mesmo padrao das demais integracoes de catalogo (catalog-lookup).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts'
import { getMercadoLivreToken, MercadoLivreAuthError } from '../_shared/mercadoLivreAuth.ts'
import { searchMercadoLivrePrice } from '../_shared/mercadoLivreSearch.ts'
import { reportInfraErrorToSentry } from '../_shared/sentry.ts'

const REF_PRICE_CACHE_DAYS = 30

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function isFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  return ageMs < REF_PRICE_CACHE_DAYS * 24 * 60 * 60 * 1000
}

interface CatalogRow {
  id: string
  ean: string | null
  ref_price_min: number | null
  ref_price_avg: number | null
  ref_price_max: number | null
  ref_price_updated_at: string | null
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  let catalogId: unknown
  try {
    ;({ catalogId } = await req.json())
  } catch {
    return jsonResponse({ error: 'JSON inválido no corpo da requisição' }, 400)
  }
  if (typeof catalogId !== 'string' || !catalogId.trim()) {
    return jsonResponse({ error: 'Campo "catalogId" é obrigatório' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { data: catalog, error: catalogError } = await supabase
      .from('product_catalog')
      .select('id, ean, ref_price_min, ref_price_avg, ref_price_max, ref_price_updated_at')
      .eq('id', catalogId)
      .maybeSingle()
    if (catalogError) throw catalogError

    const row = catalog as CatalogRow | null
    if (!row) return jsonResponse(null)

    // Recheca frescor no servidor mesmo que o cliente já tenha checado --
    // nunca confia só no estado (possivelmente desatualizado) que veio dele.
    if (isFresh(row.ref_price_updated_at)) {
      if (row.ref_price_avg === null) return jsonResponse(null)
      return jsonResponse({ min: row.ref_price_min, avg: row.ref_price_avg, max: row.ref_price_max })
    }

    if (!row.ean) return jsonResponse(null)

    const clientId = Deno.env.get('MERCADO_LIVRE_CLIENT_ID')
    const clientSecret = Deno.env.get('MERCADO_LIVRE_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      // Sem credenciais configuradas: mesma semantica de "indisponível" das
      // outras fontes sem chave (ex.: Cosmos sem COSMOS_API_KEY) -- não é
      // erro de infra pontual, mas também não deve virar ruído no Sentry a
      // cada chamada enquanto o app ainda não foi registrado no portal do ML.
      return jsonResponse(
        row.ref_price_avg !== null
          ? { min: row.ref_price_min, avg: row.ref_price_avg, max: row.ref_price_max }
          : null,
      )
    }

    let outcome: { price: { min: number; avg: number; max: number } | null; error: string | null }
    try {
      const token = await getMercadoLivreToken(supabase, clientId, clientSecret)
      outcome = await searchMercadoLivrePrice(row.ean, token)
    } catch (err) {
      outcome = { price: null, error: err instanceof MercadoLivreAuthError ? err.message : String(err) }
    }

    if (outcome.error) {
      // Erro de infra (ou falha ao obter token): não grava o cache -- uma
      // instabilidade momentânea não pode virar "sem anúncio" por 30 dias
      // (mesma regra já documentada em src/lib/catalog.ts). Responde com o
      // valor cacheado atual (se houver) em vez de null puro, pra não perder
      // uma referência válida por causa de uma falha transitória na busca.
      await reportInfraErrorToSentry(`Falha ao buscar preço de referência no Mercado Livre: ${outcome.error}`, {
        catalogId: row.id,
        ean: row.ean,
      })
      return jsonResponse(
        row.ref_price_avg !== null
          ? { min: row.ref_price_min, avg: row.ref_price_avg, max: row.ref_price_max }
          : null,
      )
    }

    // Resposta válida da API (com ou sem anúncios) -- cacheia normalmente.
    const { error: updateError } = await supabase
      .from('product_catalog')
      .update({
        ref_price_min: outcome.price?.min ?? null,
        ref_price_avg: outcome.price?.avg ?? null,
        ref_price_max: outcome.price?.max ?? null,
        ref_price_updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (updateError) throw updateError

    return jsonResponse(outcome.price)
  } catch (err) {
    console.error('mercado-livre-price: erro inesperado', err)
    // Preço de referência nunca trava o recebimento -- mesmo um erro
    // inesperado aqui responde 200/null em vez de 500, pra UI só mostrar
    // "referência indisponível" (o catch do cliente cobre falha de rede
    // pra alcançar a função em si).
    await reportInfraErrorToSentry(
      `Erro inesperado em mercado-livre-price: ${err instanceof Error ? err.message : String(err)}`,
      { catalogId },
    )
    return jsonResponse(null)
  }
})
