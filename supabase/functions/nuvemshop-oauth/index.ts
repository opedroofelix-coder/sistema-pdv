// Integração com a Nuvemshop (decisão #66) -- URL de redirecionamento do app.
//
// O dono clica em "Conectar loja" (o app pede o link com `state` assinado à
// nuvemshop-sync), autoriza na Nuvemshop e volta pra cá com ?code&state.
// Aqui: confere o state, troca o code pelo token (não expira), grava a loja,
// registra os webhooks e faz a primeira importação (casa pelo código de
// barras). NADA é criado no site nesse momento -- o dono revisa a lista antes.
//
// verify_jwt = false: quem chega aqui é o navegador vindo da Nuvemshop, sem
// JWT do Supabase. A proteção é o `state` (HMAC com o client secret, 15 min).
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  exchangeCodeForToken,
  localizedText,
  createNuvemshopClient,
  verifyState,
  WEBHOOK_EVENTS,
} from '../_shared/nuvemshop.ts'
import { loadCredentials, runImport } from '../_shared/nuvemshopSync.ts'
import { reportInfraErrorToSentry } from '../_shared/sentry.ts'

// Endereço do app pra onde a instalação volta. Em produção, configure o
// secret NUVEMSHOP_RETURN_URL com a URL publicada (…/relatorios).
const DEFAULT_RETURN_URL = 'http://localhost:5173/relatorios'

function backToApp(status: 'conectado' | 'erro', message?: string) {
  const url = new URL(Deno.env.get('NUVEMSHOP_RETURN_URL') ?? DEFAULT_RETURN_URL)
  url.searchParams.set('nuvemshop', status)
  if (message) url.searchParams.set('mensagem', message.slice(0, 300))
  return new Response(null, { status: 302, headers: { Location: url.toString() } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const clientId = Deno.env.get('NUVEMSHOP_CLIENT_ID')
  const clientSecret = Deno.env.get('NUVEMSHOP_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return backToApp('erro', 'Credenciais do app da Nuvemshop não configuradas no servidor')
  }
  if (!code) return backToApp('erro', 'A Nuvemshop não enviou o código de autorização')
  if (!(await verifyState(state, clientSecret))) {
    return backToApp('erro', 'Link de conexão inválido ou expirado. Clique em "Conectar loja" de novo pelo sistema.')
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { accessToken, storeId } = await exchangeCodeForToken(clientId, clientSecret, code)
    const api = createNuvemshopClient({ storeId, accessToken })

    let storeName: string | null = null
    let storeUrl: string | null = null
    try {
      const store = await api.getStore()
      storeName = localizedText(store.name) || null
      storeUrl = store.url_with_protocol ?? (store.original_domain ? `https://${store.original_domain}` : null)
    } catch {
      // Nome/URL são só exibição -- não travam a conexão.
    }

    // Outra loja: os vínculos antigos não valem mais.
    const { data: previous } = await db.from('nuvemshop_credentials').select('store_id').maybeSingle()
    if (previous && Number(previous.store_id) !== storeId) {
      await db.from('nuvemshop_links').delete().neq('ns_variant_id', -1)
      await db.from('nuvemshop_unmatched').delete().neq('ns_variant_id', -1)
      await db.from('nuvemshop_catalog_choices').delete().neq('choice', '')
    }

    const { error: saveError } = await db.from('nuvemshop_credentials').upsert({
      id: true,
      store_id: storeId,
      access_token: accessToken,
      store_name: storeName,
      store_url: storeUrl,
      auto_create: previous && Number(previous.store_id) === storeId ? undefined : false,
      connected_at: new Date().toISOString(),
    })
    if (saveError) throw new Error(`Erro ao salvar a conexão: ${saveError.message}`)

    // Webhooks: só cria o que ainda não existe apontando pra cá.
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/nuvemshop-webhook`
    const existing = await api.listWebhooks().catch(() => [])
    for (const event of WEBHOOK_EVENTS) {
      if (!existing.some((w) => w.event === event && w.url === webhookUrl)) {
        await api.createWebhook(event, webhookUrl)
      }
    }

    const creds = await loadCredentials(db)
    if (!creds) throw new Error('A conexão não foi gravada')
    await runImport(db, creds)

    return backToApp('conectado')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('nuvemshop-oauth:', message)
    await reportInfraErrorToSentry(`nuvemshop-oauth: ${message}`, {})
    return backToApp('erro', message)
  }
})
