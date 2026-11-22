// Integração com a Nuvemshop (decisão #66) -- eventos do site pra cá.
//
//   order/paid       -> busca o pedido na API e chama create_web_sale (venda
//                       canal 'site', baixa FIFO por lote, idempotente).
//   order/cancelled  -> cancel_web_sale (devolve o estoque).
//   product/deleted  -> desvincula; o produto daqui vai pra revisão.
//   LGPD (store/redact, customers/redact, customers/data_request) -> 200: não
//                       guardamos dado de cliente.
//
// verify_jwt = false: quem chama é a Nuvemshop. A proteção é a assinatura
// X-Linkedstore-HMAC-SHA256 (HMAC do corpo cru com o client secret) + o
// store_id ter que ser o da loja conectada. Resposta != 2xx faz a Nuvemshop
// reenviar (até 17 vezes em 2 dias) -- por isso erro transitório devolve 500.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  createNuvemshopClient,
  LGPD_EVENTS,
  NuvemshopError,
  orderToWebSale,
  verifyWebhookSignature,
} from '../_shared/nuvemshop.ts'
import { loadCredentials } from '../_shared/nuvemshopSync.ts'
import { reportInfraErrorToSentry } from '../_shared/sentry.ts'

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('NUVEMSHOP_CLIENT_SECRET')
  if (!secret) return reply({ error: 'not configured' }, 500)

  const raw = await req.text()
  const signature = req.headers.get('x-linkedstore-hmac-sha256')
  if (!(await verifyWebhookSignature(raw, signature, secret))) {
    return reply({ error: 'invalid signature' }, 401)
  }

  let payload: { store_id?: number | string; event?: string; id?: number | string }
  try {
    payload = JSON.parse(raw)
  } catch {
    return reply({ error: 'invalid json' }, 400)
  }

  // Webhooks da LGPD vêm sem `event` (cada um num endereço configurado no
  // portal de parceiros) ou com o nome do tópico. Nada a apagar/exportar.
  if (!payload.event || LGPD_EVENTS.includes(payload.event)) return reply({ ok: true })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const creds = await loadCredentials(db)
    if (!creds || Number(payload.store_id) !== Number(creds.store_id)) {
      // Loja desconectada/outra loja: confirma pra Nuvemshop parar de reenviar.
      return reply({ ok: true, ignored: 'store' })
    }
    const api = createNuvemshopClient({ storeId: creds.store_id, accessToken: creds.access_token })

    if (payload.event === 'order/paid') {
      const order = await api.getOrder(payload.id!)
      if (order.payment_status && order.payment_status !== 'paid') {
        return reply({ ok: true, ignored: `payment_status=${order.payment_status}` })
      }
      const { data, error } = await db.rpc('create_web_sale', { p_order: orderToWebSale(order) })
      if (error) throw new Error(`create_web_sale: ${error.message}`)
      return reply({ ok: true, sale_id: data?.id })
    }

    if (payload.event === 'order/cancelled') {
      const { error } = await db.rpc('cancel_web_sale', { p_external_order_id: String(payload.id) })
      if (error) throw new Error(`cancel_web_sale: ${error.message}`)
      return reply({ ok: true })
    }

    if (payload.event === 'product/deleted') {
      const { data: links } = await db
        .from('nuvemshop_links').select('catalog_id').eq('ns_product_id', Number(payload.id))
      for (const link of links ?? []) {
        await db.from('nuvemshop_links').delete().eq('catalog_id', link.catalog_id)
        await db.from('nuvemshop_catalog_choices').upsert({
          catalog_id: link.catalog_id,
          choice: 'review',
          reason: 'Produto apagado na Nuvemshop',
          updated_at: new Date().toISOString(),
        })
      }
      await db.from('nuvemshop_unmatched').delete().eq('ns_product_id', Number(payload.id))
      return reply({ ok: true, unlinked: links?.length ?? 0 })
    }

    return reply({ ok: true, ignored: payload.event })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('nuvemshop-webhook:', payload.event, message)
    // Pedido inexistente na API não adianta reenviar.
    if (err instanceof NuvemshopError && err.kind === 'not_found') return reply({ ok: true, ignored: 'not_found' })
    await reportInfraErrorToSentry(`nuvemshop-webhook ${payload.event}: ${message}`, { id: payload.id })
    return reply({ error: message }, 500)
  }
})
