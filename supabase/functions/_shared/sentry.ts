// Reporte mínimo de erro pro Sentry via HTTP direto (endpoint "store"),
// sem depender de um SDK Deno de terceiros -- é a chamada mais estável e
// documentada há mais tempo pra reportar um evento simples. Só erros de
// infra da cascata de catálogo (quota/auth/timeout) chegam aqui; "não
// encontrado" nunca é reportado (não é um erro do sistema).
//
// Secret: SENTRY_DSN (mesmo projeto do VITE_SENTRY_DSN do cliente, sem o
// prefixo VITE_ -- configurar com `supabase secrets set SENTRY_DSN=...`).
// Sem o secret, a função segue funcionando normalmente, só sem o reporte.
// Sem variável de ambiente dedicada pra distinguir local/produção -- o
// próprio SUPABASE_URL já diz isso (só o projeto hospedado usa
// *.supabase.co; local sempre bate em 127.0.0.1). Evita mais um secret pra
// manter sincronizado entre ambientes.
function currentEnvironment(): string {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  return url.includes('supabase.co') ? 'production' : 'local'
}

export async function reportInfraErrorToSentry(message: string, extra: Record<string, unknown>) {
  const dsn = Deno.env.get('SENTRY_DSN')
  if (!dsn) return

  try {
    const parsed = new URL(dsn)
    const publicKey = parsed.username
    const projectId = parsed.pathname.replace(/^\//, '')
    const ingestUrl = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`

    await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=catalog-lookup-edge-fn/1.0`,
      },
      body: JSON.stringify({
        message,
        level: 'error',
        platform: 'other',
        environment: currentEnvironment(),
        tags: { source: 'catalog-lookup-edge-fn' },
        extra,
        timestamp: Date.now() / 1000,
      }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Reporte ao Sentry nunca pode travar a resposta real da função.
  }
}
