// Token OAuth do Mercado Livre (client_credentials) com cache/renovacao na
// tabela mercado_livre_oauth_token (migration 0008) -- a API publica de
// busca passou a exigir autenticacao (403 pra chamadas sem token,
// confirmado ao vivo antes desta mudanca). Renovacao e lazy: só busca um
// token novo quando o cache expirou, sem job/cron separado.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

const TOKEN_ENDPOINT = 'https://api.mercadolibre.com/oauth/token'
const FETCH_TIMEOUT_MS = 4000
/** Margem de seguranca: renova um pouco antes do token realmente expirar,
 * pra nao correr risco de usar um token que expira no meio da requisicao. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000

interface TokenRow {
  access_token: string
  expires_at: string
}

export class MercadoLivreAuthError extends Error {}

async function fetchNewToken(clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  let res: Response
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    const message = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : String(err)
    throw new MercadoLivreAuthError(`oauth/token: falha de rede (${message})`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new MercadoLivreAuthError(`oauth/token: HTTP ${res.status} ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  if (typeof data?.access_token !== 'string' || typeof data?.expires_in !== 'number') {
    throw new MercadoLivreAuthError(`oauth/token: resposta em formato inesperado ${JSON.stringify(data).slice(0, 300)}`)
  }

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in }
}

/**
 * Retorna um access token valido, reusando o cache em
 * `mercado_livre_oauth_token` quando ainda nao expirou. `supabase` precisa
 * ser um client com service role (a tabela nao tem policy nenhuma pra
 * outros papeis).
 */
export async function getMercadoLivreToken(
  supabase: SupabaseClient,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const { data: cached } = await supabase
    .from('mercado_livre_oauth_token')
    .select('access_token, expires_at')
    .eq('id', true)
    .maybeSingle()

  const row = cached as TokenRow | null
  if (row && new Date(row.expires_at).getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return row.access_token
  }

  const { accessToken, expiresInSeconds } = await fetchNewToken(clientId, clientSecret)
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

  await supabase
    .from('mercado_livre_oauth_token')
    .upsert({ id: true, access_token: accessToken, expires_at: expiresAt, updated_at: new Date().toISOString() })

  return accessToken
}
