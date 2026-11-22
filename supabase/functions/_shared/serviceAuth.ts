/**
 * Confere se o bearer recebido é a service role. A comparação direta com
 * `SUPABASE_SERVICE_ROLE_KEY` não basta: a chave guardada no Vault (usada
 * pelos crons via pg_net) é o JWT legado, e a variável injetada nas functions
 * vem em outro formato -- as duas valem, mas não são iguais como string.
 * Então, se não bater, prova a chave lendo uma tabela que só `service_role`
 * tem GRANT (`nuvemshop_sync_queue`): anon/authenticated recebem erro.
 */
export async function isServiceRoleToken(token: string, serviceRoleKey: string): Promise<boolean> {
  if (!token) return false
  if (token === serviceRoleKey) return true
  const isJwt = token.split('.').length === 3
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/nuvemshop_sync_queue?select=catalog_id&limit=1`, {
      headers: isJwt ? { apikey: token, Authorization: `Bearer ${token}` } : { apikey: token },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}
