import { invokeFunction } from './functions'
import type { ProductCatalog, ReferencePrice } from './types'

const REF_PRICE_CACHE_DAYS = 30

/**
 * Preço de referência do Mercado Livre (CLAUDE.md seção 1, decisão #10). A
 * busca inteira (token OAuth + consulta autenticada) roda na Edge Function
 * `mercado-livre-price`. **Não é mais chamada automaticamente pela UI**
 * (decisão #22: busca de produtos do ML bloqueada por política deles mesmo
 * autenticado, confirmado com token real) -- fica pronta pro dia em que o
 * ML liberar/formalizar parceria com o app. A função sempre responde 200
 * com `ReferencePrice | null` (nunca lança pra "sem anúncio encontrado" nem
 * pra falha de infra -- essas são absorvidas e reportadas server-side, ver
 * `mercado-livre-price/index.ts`).
 */
export async function fetchReferencePriceFromApi(catalogId: string): Promise<ReferencePrice | null> {
  return invokeFunction<ReferencePrice | null>('mercado-livre-price', { catalogId })
}

/**
 * Link "Ver no Mercado Livre" do plano B (decisão #23): abre a busca do
 * site (não a API) em nova aba, pra o operador olhar o preço e anotar
 * manualmente -- prefere EAN (mais preciso), cai pro nome quando não há
 * código de barras.
 */
export function mercadoLivreSearchUrl(catalog: Pick<ProductCatalog, 'ean' | 'name'>): string | null {
  const query = catalog.ean ?? catalog.name
  if (!query) return null
  return `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`
}

/** Cache de 30 dias: true quando o preço de referência gravado ainda é válido. */
export function isReferencePriceFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  return ageMs < REF_PRICE_CACHE_DAYS * 24 * 60 * 60 * 1000
}
