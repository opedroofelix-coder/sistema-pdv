// CORS: as Edge Functions rodam num host separado do app Vite (mesmo em
// dev, :54331 vs :5173), então toda resposta -- inclusive o preflight
// OPTIONS -- precisa desses headers pra o navegador aceitar a chamada.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  return null
}
