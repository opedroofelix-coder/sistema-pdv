import { describe, it, expect } from 'vitest'
import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  it('Error com texto nosso (português) -> a própria mensagem', () => {
    expect(getErrorMessage(new Error('Escolha uma forma de pagamento.'))).toBe(
      'Escolha uma forma de pagamento.',
    )
  })

  it('raise exception das RPCs (P0001) passa direto, mesmo sem acento', () => {
    expect(getErrorMessage({ message: 'Nenhum caixa aberto', code: 'P0001' })).toBe(
      'Nenhum caixa aberto',
    )
    expect(getErrorMessage({ message: 'Sessão já estava fechada', code: 'P0001' })).toBe(
      'Sessão já estava fechada',
    )
  })

  it('erro do Postgrest (objeto, não Error) é traduzido pelo código', () => {
    // Antes: não era instanceof Error e caía no texto genérico (decisão #44);
    // depois: aparecia em inglês. Agora: português.
    const pgErr = { message: 'permission denied for table profiles', code: '42501' }
    expect(getErrorMessage(pgErr)).toBe('Você não tem permissão para fazer isso.')
    expect(
      getErrorMessage({ message: 'duplicate key value violates unique constraint "x"', code: '23505' }),
    ).toBe('Já existe um registro com esses dados.')
  })

  it('não anexa o hint (vem em inglês do Postgres)', () => {
    const pgErr = {
      message: 'Could not find the function public.close_cash_session',
      code: 'PGRST202',
      hint: 'Perhaps you meant to call the function public.foo',
    }
    expect(getErrorMessage(pgErr)).toMatch(/^O banco de dados está desatualizado/)
  })

  it('falha de rede do navegador -> português', () => {
    expect(getErrorMessage(new TypeError('Failed to fetch'))).toMatch(/^Sem conexão/)
    expect(getErrorMessage(new TypeError('Load failed'))).toMatch(/^Sem conexão/)
    expect(
      getErrorMessage({ message: 'FetchError: NetworkError when attempting to fetch resource.' }),
    ).toMatch(/^Sem conexão/)
  })

  it('timeout do AbortSignal -> português', () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError')
    expect(getErrorMessage(timeout)).toMatch(/^O servidor demorou/)
    expect(getErrorMessage({ message: 'AbortError: The operation was aborted.', code: '' })).toMatch(
      /^O servidor demorou/,
    )
  })

  it('sessão expirada -> português', () => {
    expect(getErrorMessage({ message: 'JWT expired', code: 'PGRST303' })).toBe(
      'Sua sessão expirou. Saia e entre de novo no sistema.',
    )
    expect(getErrorMessage(new Error('Auth session missing!'))).toMatch(/sessão expirou/)
  })

  it('erros do Supabase Auth (login/cadastro) -> português', () => {
    expect(getErrorMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toBe(
      'E-mail ou senha incorretos.',
    )
    expect(getErrorMessage({ message: 'User already registered' })).toBe(
      'Já existe uma conta com este e-mail.',
    )
    expect(getErrorMessage({ message: 'Password should be at least 6 characters.' })).toBe(
      'A senha precisa ter pelo menos 6 caracteres.',
    )
    expect(getErrorMessage({ message: 'Email not confirmed' })).toMatch(/^E-mail ainda não confirmado/)
  })

  it('Edge Function sem corpo legível -> português', () => {
    expect(getErrorMessage(new Error('Edge Function returned a non-2xx status code'))).toBe(
      'O servidor retornou um erro ao processar o pedido.',
    )
  })

  it('objeto com { error } (corpo de Edge Function) -> error', () => {
    expect(getErrorMessage({ error: 'Apenas o dono pode gerenciar usuários' })).toBe(
      'Apenas o dono pode gerenciar usuários',
    )
  })

  it('inglês desconhecido -> frase em português com o detalhe técnico', () => {
    expect(getErrorMessage(new Error('Something weird happened'))).toBe(
      'Erro inesperado. Detalhe técnico: Something weird happened',
    )
  })

  it('string -> a própria string (se já em português)', () => {
    expect(getErrorMessage('Valor deve ser maior que zero.')).toBe('Valor deve ser maior que zero.')
  })

  it('desconhecido -> fallback', () => {
    expect(getErrorMessage(null)).toBe('Erro inesperado.')
    expect(getErrorMessage(undefined, 'Erro ao carregar.')).toBe('Erro ao carregar.')
    expect(getErrorMessage({}, 'Erro ao carregar.')).toBe('Erro ao carregar.')
  })
})
