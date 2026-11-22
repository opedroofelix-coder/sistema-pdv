// Resolve um código bipado no recebimento: cache -> cascata externa roteada
// por prefixo GTIN (ver _shared/catalogCascade.ts) -> grava em
// product_catalog. Chamado pelo cliente via supabase.functions.invoke --
// nenhuma chave de API de catálogo roda no navegador (CLAUDE.md: pacote de
// melhorias no catálogo, ajuste de segurança prioritário).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts'
import { guessOriginFromEan, normalizeBarcode, runCascade } from '../_shared/catalogCascade.ts'
import { reportInfraErrorToSentry } from '../_shared/sentry.ts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  let code: unknown
  try {
    ;({ code } = await req.json())
  } catch {
    return jsonResponse({ error: 'JSON inválido no corpo da requisição' }, 400)
  }
  if (typeof code !== 'string' || !code.trim()) {
    return jsonResponse({ error: 'Campo "code" é obrigatório' }, 400)
  }

  const ean = normalizeBarcode(code)
  const origin = guessOriginFromEan(ean)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    // service role: a função grava em product_catalog/catalog_lookup_log
    // independente de quem chamou -- o app já exige sessão autenticada pra
    // chegar até aqui (RLS de leitura já cobre o resto da tela).
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { data: cached, error: cacheError } = await supabase
      .from('product_catalog')
      .select('*')
      .eq('ean', ean)
      .maybeSingle()
    if (cacheError) throw cacheError

    if (cached) {
      // `ean` é único em product_catalog -- um item excluído logicamente
      // (ajuste de UX: exclusão de itens no catálogo) não pode simplesmente
      // virar "cache miss" e gerar uma segunda linha pro mesmo EAN (violaria
      // a constraint). Em vez disso, reativa a entrada existente: o produto
      // físico continua existindo no mundo real, então reaproveitar
      // nome/foto/NCM já cadastrados é melhor que perder o dado -- só volta
      // pra precisar de revisão (needs_review), já que o cadastro tinha sido
      // desativado por algum motivo.
      let result = cached
      if (!cached.active) {
        const { data: reactivated, error: reactivateError } = await supabase
          .from('product_catalog')
          .update({ active: true, needs_review: true })
          .eq('id', cached.id)
          .select()
          .single()
        if (reactivateError) throw reactivateError
        result = reactivated
      }

      await supabase
        .from('catalog_lookup_log')
        .insert({ ean, origin, source: 'cache', outcome: 'hit' })
      return jsonResponse(result)
    }

    const cosmosApiKey = Deno.env.get('COSMOS_API_KEY')
    const { result, source, hadInfraError, lastErrorDetail, attempts } = await runCascade(ean, origin, {
      cosmosApiKey,
    })

    // Uma linha por fonte EFETIVAMENTE consultada (não só a que resolveu) --
    // ver comentário da tabela na migration 0006: importa pra cota da Cosmos
    // e pro relatório de consultas consumidas por API.
    if (attempts.length > 0) {
      await supabase.from('catalog_lookup_log').insert(
        attempts.map((a) => ({
          ean,
          origin,
          source: a.source,
          outcome: a.outcome,
          error_detail: a.errorDetail,
        })),
      )
    }

    if (result && source) {
      const ncmPending = origin === 'importado' && !result.ncm
      const { data: inserted, error: insertError } = await supabase
        .from('product_catalog')
        .insert({
          ean,
          name: result.name,
          brand: result.brand,
          photo_url: result.photo_url,
          ncm: result.ncm,
          cest: result.cest,
          source,
          origin,
          ncm_pending: ncmPending,
          needs_review: true,
          enrichment_status: 'resolved',
          // Plano B do preço de referência (CLAUDE.md decisão #23): só a
          // Cosmos preenche isso hoje, quando a API tiver o dado.
          ref_price_min: result.refPrice?.min ?? null,
          ref_price_avg: result.refPrice?.avg ?? null,
          ref_price_max: result.refPrice?.max ?? null,
          ref_price_updated_at: result.refPrice ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (insertError) throw insertError

      return jsonResponse(inserted)
    }

    if (hadInfraError) {
      // Pelo menos uma fonte falhou por infra -- não dá pra afirmar "não
      // existe". Cria um placeholder pendente e deixa o recebimento seguir
      // direto pra precificação (sem foto pra confirmar ainda); o job diário
      // tenta de novo depois (ver fila de enriquecimento).
      const { data: placeholder, error: insertError } = await supabase
        .from('product_catalog')
        .insert({
          ean,
          origin,
          needs_review: true,
          enrichment_status: 'pending',
          enrichment_attempts: 1,
          enrichment_last_attempt_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (insertError) throw insertError

      await reportInfraErrorToSentry(`Falha de infra na cascata de catálogo: ${lastErrorDetail}`, {
        ean,
        origin,
      })

      return jsonResponse(placeholder)
    }

    // Todas as fontes responderam limpo, nenhuma tinha o produto -- cai pro
    // cadastro manual no cliente (comportamento inalterado desde a Sprint 5).
    // As linhas 'miss' já foram gravadas acima (attempts); não há source
    // "not_found" -- a ausência de qualquer 'hit' entre elas já é o sinal.
    return jsonResponse(null)
  } catch (err) {
    console.error('catalog-lookup: erro inesperado', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro inesperado' }, 500)
  }
})
