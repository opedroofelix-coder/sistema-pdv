/**
 * Formatadores da vitrine pública. Separados de `format.ts` só pra o bundle da
 * /loja não puxar nada do app interno.
 */
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatCurrency(value: number): string {
  return currency.format(value)
}

/** "R$ 89" quando é inteiro, "R$ 89,90" quando tem centavos (etiqueta de preço). */
export function formatTagPrice(value: number): { whole: string; cents: string } {
  const [whole, cents] = value.toFixed(2).split('.')
  return {
    whole: Number(whole).toLocaleString('pt-BR'),
    cents: cents === '00' ? '' : cents,
  }
}

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
