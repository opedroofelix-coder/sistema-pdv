/**
 * Extrai uma mensagem legível **em português** de QUALQUER erro, pra o usuário
 * sempre ver o que aconteceu (pedidos do dono: decisão #44 -- erro descrito --
 * e decisão #67 -- todo erro em português).
 *
 * Formas cobertas: Error, erro do Supabase/PostgREST (objeto `{ message,
 * details, hint, code }` que **não é `instanceof Error`**), corpo de Edge
 * Function (`{ error }`), string e desconhecido.
 *
 * As mensagens que nós mesmos escrevemos (os `raise exception` das RPCs, os
 * `throw new Error(...)` do cliente, as respostas das Edge Functions) já são
 * em português e passam direto. O que chega em inglês vem de fora: navegador
 * (rede), supabase-js, Supabase Auth (login/cadastro) e Postgres/PostgREST
 * (constraint, permissão, função inexistente...). Isso é traduzido aqui por
 * código e por texto conhecido; o que não for reconhecido vira uma frase
 * genérica em português com o texto original como detalhe técnico, pra não
 * perder a informação que ajuda a diagnosticar (o motivo da decisão #44).
 *
 * `fallback` é só último recurso, quando não dá pra extrair nada.
 */
export function getErrorMessage(err: unknown, fallback = 'Erro inesperado.'): string {
  const { message, code } = extract(err)
  if (!message) return fallback
  return translateError(message, code)
}

function extract(err: unknown): { message: string; code: string | null } {
  if (typeof err === 'string') return { message: err, code: null }
  if (err && typeof err === 'object') {
    const obj = err as { message?: unknown; error?: unknown; code?: unknown; name?: unknown }
    const message =
      (typeof obj.message === 'string' && obj.message) ||
      (typeof obj.error === 'string' && obj.error) ||
      ''
    // `name` ajuda a reconhecer o timeout do AbortSignal (TimeoutError /
    // AbortError), cuja mensagem varia por navegador.
    const name = typeof obj.name === 'string' ? obj.name : null
    const code =
      typeof obj.code === 'string'
        ? obj.code
        : name === 'TimeoutError' || name === 'AbortError'
          ? name
          : null
    return { message, code }
  }
  return { message: '', code: null }
}

const MSG_OFFLINE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
const MSG_TIMEOUT = 'O servidor demorou para responder. Verifique a internet e tente de novo.'
const MSG_SESSION = 'Sua sessão expirou. Saia e entre de novo no sistema.'
const MSG_PERMISSION = 'Você não tem permissão para fazer isso.'
const MSG_OUTDATED =
  'O banco de dados está desatualizado em relação ao app. Avise o responsável pelo sistema.'

/** Por código do Postgres/PostgREST (mais confiável que o texto). */
const BY_CODE: Record<string, string> = {
  TimeoutError: MSG_TIMEOUT,
  AbortError: MSG_TIMEOUT,
  '23505': 'Já existe um registro com esses dados.',
  '23503': 'Este registro está ligado a outros dados e não pode ser alterado ou excluído.',
  '23502': 'Um campo obrigatório ficou sem preenchimento.',
  '23514': 'Algum valor informado não é permitido.',
  '22P02': 'Algum valor foi informado em formato inválido.',
  '22003': 'Algum valor informado está fora do limite permitido.',
  '22001': 'Algum texto informado é longo demais.',
  '42501': MSG_PERMISSION,
  '42883': MSG_OUTDATED,
  '42703': MSG_OUTDATED,
  '42P01': MSG_OUTDATED,
  '57014': 'A operação demorou demais no servidor e foi cancelada. Tente de novo.',
  '40001': 'Conflito com outra operação ao mesmo tempo. Tente de novo.',
  '40P01': 'Conflito com outra operação ao mesmo tempo. Tente de novo.',
  '53300': 'O servidor está sobrecarregado no momento. Tente de novo em instantes.',
  PGRST116: 'Registro não encontrado.',
  PGRST202: MSG_OUTDATED,
  PGRST204: MSG_OUTDATED,
  PGRST205: MSG_OUTDATED,
  PGRST301: MSG_SESSION,
  PGRST302: MSG_SESSION,
  PGRST303: MSG_SESSION,
}

/** Por texto (navegador, supabase-js, Supabase Auth -- sem código útil). A
 * ordem importa: o primeiro que casar vence. */
const BY_TEXT: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  // Rede: Chrome, Firefox, Safari, Node e o supabase-js nas Edge Functions.
  [/failed to fetch|networkerror|load failed|network request failed|fetch failed|failed to send a request/i, MSG_OFFLINE],
  [/timed? ?out|timeout|signal is aborted|aborted|the operation was aborted/i, MSG_TIMEOUT],
  // Sessão / token.
  [/jwt expired|invalid jwt|jwt.*(malformed|invalid)|auth session missing|invalid refresh token|refresh token not found|session.*expired/i, MSG_SESSION],
  // Supabase Auth (login, cadastro, troca de senha).
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'E-mail ainda não confirmado. Abra o link enviado para o seu e-mail.'],
  [/user already registered|already been registered|email address.*already/i, 'Já existe uma conta com este e-mail.'],
  [/password should be at least (\d+)/i, (m) => `A senha precisa ter pelo menos ${m[1]} caracteres.`],
  [/password.*(weak|too short)/i, 'Senha fraca. Use uma senha maior, misturando letras e números.'],
  [/new password should be different/i, 'A nova senha precisa ser diferente da atual.'],
  [/unable to validate email|invalid email|email.*invalid format/i, 'E-mail inválido.'],
  [/rate limit|too many requests|for security purposes, you can only request this after (\d+)/i, 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.'],
  [/signups? not allowed|signup.*disabled/i, 'O cadastro de novas contas está desativado.'],
  [/user is banned|user banned/i, 'Seu acesso está desativado. Fale com o dono da loja.'],
  [/user not found/i, 'Usuário não encontrado.'],
  // Postgres/PostgREST quando o código não veio junto.
  [/row-level security|permission denied/i, MSG_PERMISSION],
  [/duplicate key value/i, BY_CODE['23505']],
  [/violates foreign key/i, BY_CODE['23503']],
  [/violates not-null/i, BY_CODE['23502']],
  [/violates check constraint/i, BY_CODE['23514']],
  [/invalid input syntax/i, BY_CODE['22P02']],
  [/could not find the function|function .* does not exist|column .* does not exist|relation .* does not exist/i, MSG_OUTDATED],
  [/cannot coerce the result to a single json object|json object requested, multiple \(or no\) rows/i, BY_CODE.PGRST116],
  // Edge Function sem corpo `{ error }` legível, gateway e afins.
  [/edge function returned a non-2xx|relay error/i, 'O servidor retornou um erro ao processar o pedido.'],
  [/internal server error|bad gateway|service unavailable|gateway timeout/i, 'O servidor está indisponível no momento. Tente de novo em instantes.'],
  [/unauthorized|not authenticated/i, MSG_SESSION],
  [/forbidden/i, MSG_PERMISSION],
]

/**
 * Heurística pra saber se uma mensagem não reconhecida já está em português:
 * acento/cedilha ou palavra comum do português. Mensagens nossas sem acento
 * ("Nenhum caixa aberto", "Venda sem itens") caem nas palavras.
 */
const PT_HINT =
  /[ãõçáéíóúâêôà]|\b(nao|não|sem|com|para|pra|caixa|venda|vendas|item|itens|lote|lotes|produto|valor|preço|estoque|nenhum|nenhuma|somente|apenas|deve|erro|inválid[oa]|obrigatóri[oa]|já|pedido|forma|quantidade|sessão|usuário|senha)\b/i

export function translateError(message: string, code: string | null = null): string {
  // `raise exception` das nossas RPCs (código P0001) é sempre texto nosso.
  if (code === 'P0001') return message
  if (code && BY_CODE[code]) return BY_CODE[code]
  for (const [pattern, replacement] of BY_TEXT) {
    const match = message.match(pattern)
    if (match) return typeof replacement === 'string' ? replacement : replacement(match)
  }
  if (PT_HINT.test(message)) return message
  return `Erro inesperado. Detalhe técnico: ${message}`
}
