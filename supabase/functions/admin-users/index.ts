// Branch 6 (item 5): ações administrativas sobre usuários que EXIGEM a Admin
// API do Supabase (service_role) e por isso não podem rodar no cliente:
// listar usuários (com e-mail/status), trocar a senha de outro usuário e
// ativar/desativar o acesso (ban/unban no Auth).
//
// Blindagem: a função roda com service_role (pode tudo), então ela mesma
// precisa confirmar, no servidor, que QUEM CHAMA é `dono` -- lendo o JWT do
// chamador (o supabase.functions.invoke do cliente manda o token do usuário
// logado no header Authorization) e checando profiles.role. Sem isso,
// qualquer usuário logado poderia chamar a função direto e virar admin.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

interface Body {
  action?: 'list' | 'set_password' | 'set_access'
  user_id?: string
  password?: string
  active?: boolean
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Identifica o chamador pelo JWT e confirma que é dono.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'Não autenticado' }, 401)

  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return jsonResponse({ error: 'Não autenticado' }, 401)

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle()
  // Erro real da consulta (ex.: falta de grant) sobe como 500 com a mensagem,
  // em vez de ser mascarado como "não é dono".
  if (profileError) {
    return jsonResponse({ error: `Erro ao verificar permissão: ${profileError.message}` }, 500)
  }
  if (callerProfile?.role !== 'dono') {
    return jsonResponse({ error: 'Apenas o dono pode gerenciar usuários' }, 403)
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400)
  }

  // 2. Executa a ação pedida.
  try {
    if (body.action === 'list') {
      const { data: list, error } = await admin.auth.admin.listUsers()
      if (error) throw error
      const { data: profiles } = await admin.from('profiles').select('id, full_name, role')
      const roleById = new Map((profiles ?? []).map((p) => [p.id, p]))
      const now = Date.now()

      const users = list.users.map((u) => {
        const bannedUntil = (u as { banned_until?: string | null }).banned_until ?? null
        const banned = bannedUntil != null && new Date(bannedUntil).getTime() > now
        const profile = roleById.get(u.id)
        return {
          id: u.id,
          email: u.email ?? null,
          full_name: profile?.full_name ?? null,
          role: profile?.role ?? null,
          active: !banned,
          created_at: u.created_at,
        }
      })
      return jsonResponse({ users })
    }

    if (body.action === 'set_password') {
      if (!body.user_id) return jsonResponse({ error: 'user_id obrigatório' }, 400)
      if (!body.password || body.password.length < 6) {
        return jsonResponse({ error: 'A senha precisa ter ao menos 6 caracteres' }, 400)
      }
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        password: body.password,
      })
      if (error) throw error
      return jsonResponse({ ok: true })
    }

    if (body.action === 'set_access') {
      if (!body.user_id) return jsonResponse({ error: 'user_id obrigatório' }, 400)
      // O dono não pode se auto-desativar (risco de travar o próprio acesso).
      if (body.user_id === caller.user.id && body.active === false) {
        return jsonResponse({ error: 'Você não pode desativar o próprio acesso' }, 400)
      }
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        // ban_duration 'none' reativa; um prazo longo desativa (bloqueia o
        // login no próprio Auth, não só na UI).
        ban_duration: body.active ? 'none' : '876000h',
      })
      if (error) throw error
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Ação desconhecida' }, 400)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro interno' }, 500)
  }
})
