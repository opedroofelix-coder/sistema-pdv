// Integração com a Nuvemshop (decisão #66) -- sincronização daqui pro site.
//
// Ações:
//   drain        -- processa a fila (saldo dos vinculados, criação dos
//                   liberados). Chamada pelo gatilho da fila e pelo cron de
//                   1 min (Bearer = service role), e pelo botão do dono.
//   import       -- relê os produtos do site, casa pelo código de barras e
//                   refaz a lista de revisão ("Sincronizar agora").
//   connect_url  -- devolve o link de instalação do app com um `state`
//                   assinado (só o dono). Ver verifyState em _shared.
//
// verify_jwt = false no config.toml: a função aceita a service role (cron) OU
// o JWT de um usuário, e nesse caso confirma no servidor que ele é `dono`.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts'
import { buildAuthorizeUrl, signState } from '../_shared/nuvemshop.ts'
import { drainQueue, loadCredentials, runImport } from '../_shared/nuvemshopSync.ts'
import { reportInfraErrorToSentry } from '../_shared/sentry.ts'
import { isServiceRoleToken } from '../_shared/serviceAuth.ts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'Não autenticado' }, 401)

  const isService = await isServiceRoleToken(token, serviceRoleKey)
  if (!isService) {
    const { data: caller, error: callerError } = await db.auth.getUser(token)
    if (callerError || !caller.user) return jsonResponse({ error: 'Não autenticado' }, 401)
    const { data: profile, error: profileError } = await db
      .from('profiles').select('role').eq('id', caller.user.id).maybeSingle()
    if (profileError) {
      return jsonResponse({ error: `Erro ao verificar permissão: ${profileError.message}` }, 500)
    }
    if (profile?.role !== 'dono') {
      return jsonResponse({ error: 'Apenas o dono pode gerenciar a integração com a Nuvemshop' }, 403)
    }
  }

  let body: { action?: string } = {}
  try {
    body = await req.json()
  } catch {
    // corpo vazio = drain
  }
  const action = body.action ?? 'drain'

  try {
    if (action === 'connect_url') {
      if (isService) return jsonResponse({ error: 'Ação só para o dono' }, 400)
      const appId = Deno.env.get('NUVEMSHOP_CLIENT_ID')
      const secret = Deno.env.get('NUVEMSHOP_CLIENT_SECRET')
      if (!appId || !secret) {
        return jsonResponse({ error: 'Credenciais do app da Nuvemshop não configuradas no servidor' }, 500)
      }
      return jsonResponse({ url: buildAuthorizeUrl(appId, await signState(secret)) })
    }

    const creds = await loadCredentials(db)
    if (!creds) {
      // Sem loja conectada não há nada pra fazer (e o cron não deve virar erro).
      return jsonResponse(action === 'drain' ? { ok: true, idle: true } : { error: 'Loja da Nuvemshop não conectada' },
        action === 'drain' ? 200 : 400)
    }

    if (action === 'import') {
      const result = await runImport(db, creds)
      const drained = await drainQueue(db, creds, { maxBatches: 2 })
      return jsonResponse({ ok: true, ...result, drained })
    }

    if (action === 'drain') {
      return jsonResponse({ ok: true, ...(await drainQueue(db, creds)) })
    }

    return jsonResponse({ error: 'Ação desconhecida' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('nuvemshop-sync:', action, message)
    await reportInfraErrorToSentry(`nuvemshop-sync ${action}: ${message}`, { action })
    return jsonResponse({ error: message }, 500)
  }
})
