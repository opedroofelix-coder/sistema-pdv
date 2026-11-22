/**
 * Busca todas as páginas de uma consulta do PostgREST. Sem isso cada resposta
 * é cortada em `max_rows` = 1000 (`supabase/config.toml`), em silêncio -- a
 * causa das decisões #50, #63, #64 e #69.
 *
 * `fetchPage(from, to)` deve trazer uma **ordem estável** (terminando numa
 * coluna única, normalmente `id`), senão a paginação repete ou pula linhas.
 */
export const PAGE_SIZE = 500

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    all.push(...page)
    if (page.length < pageSize) break
  }
  return all
}
