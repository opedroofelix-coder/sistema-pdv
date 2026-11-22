/**
 * Vitrine pública (/loja): catálogo lido do estoque real e pedido enviado pelo
 * WhatsApp da loja. Tudo aqui que não toca o Supabase é puro e testado em
 * storefront.test.ts.
 */
import { formatCurrency, normalizeText } from './storefrontFormat'

export interface CatalogProduct {
  id: string
  name: string
  price: number
  photo_url: string | null
  available: number
}

export type CategoryId = 'buques' | 'arranjos' | 'cestas' | 'chocolates' | 'plantas' | 'outros'

export interface Category {
  id: CategoryId
  label: string
  /** Palavras (sem acento, minúsculas) que, no nome, colocam o produto aqui. */
  words: string[]
}

/** Ordem = prioridade: "Cesta com chocolate" é cesta, não chocolate. */
export const CATEGORIES: Category[] = [
  { id: 'cestas', label: 'Cestas', words: ['cesta', 'kit', 'box'] },
  { id: 'buques', label: 'Buquês', words: ['buque', 'bouquet', 'ramalhete', 'maco', 'rosa', 'rosas'] },
  { id: 'arranjos', label: 'Arranjos', words: ['arranjo', 'coroa', 'centro de mesa'] },
  { id: 'plantas', label: 'Plantas', words: ['orquidea', 'planta', 'vaso', 'suculenta', 'cacto', 'kalanchoe', 'anturio', 'bromelia', 'lirio da paz'] },
  { id: 'chocolates', label: 'Chocolates', words: ['chocolate', 'bombom', 'trufa', 'ferrero', 'cacau', 'pelucia', 'urso', 'balao'] },
]

export function categorize(name: string): CategoryId {
  const text = ` ${normalizeText(name)} `
  for (const category of CATEGORIES) {
    if (category.words.some((word) => text.includes(` ${word}`))) return category.id
  }
  return 'outros'
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? 'Outros'
}

// ---------------------------------------------------------------------------
// Sacola
// ---------------------------------------------------------------------------

/** productId -> quantidade */
export type Cart = Record<string, number>

export interface CartLine {
  product: CatalogProduct
  quantity: number
  subtotal: number
}

/** Soma `delta` respeitando o saldo do estoque; zero remove a linha. */
export function changeQuantity(cart: Cart, product: CatalogProduct, delta: number): Cart {
  const current = cart[product.id] ?? 0
  const next = Math.max(0, Math.min(product.available, current + delta))
  const copy = { ...cart }
  if (next === 0) delete copy[product.id]
  else copy[product.id] = next
  return copy
}

/**
 * Linhas da sacola cruzadas com o catálogo atual. Produto que saiu do
 * catálogo some; quantidade acima do saldo novo é reduzida.
 */
export function cartLines(cart: Cart, products: CatalogProduct[]): CartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const lines: CartLine[] = []
  for (const [id, qty] of Object.entries(cart)) {
    const product = byId.get(id)
    if (!product || qty <= 0) continue
    const quantity = Math.min(qty, product.available)
    if (quantity <= 0) continue
    lines.push({ product, quantity, subtotal: round2(product.price * quantity) })
  }
  return lines
}

/** Sacola limpa contra o catálogo atual (pra salvar sem lixo). */
export function reconcileCart(cart: Cart, products: CatalogProduct[]): Cart {
  const clean: Cart = {}
  for (const line of cartLines(cart, products)) clean[line.product.id] = line.quantity
  return clean
}

export function cartTotal(lines: CartLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.subtotal, 0))
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

export type Fulfillment = 'entrega' | 'retirada'
export type OrderPayment = 'pix' | 'cartao' | 'dinheiro'

export const PAYMENT_LABELS: Record<OrderPayment, string> = {
  pix: 'Pix',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
}

export interface OrderDetails {
  name: string
  phone: string
  fulfillment: Fulfillment
  /** Quem recebe as flores (só entrega; vazio = o próprio cliente). */
  recipient: string
  address: string
  /** YYYY-MM-DD */
  date: string
  time: string
  cardMessage: string
  payment: OrderPayment | ''
}

export const EMPTY_ORDER: OrderDetails = {
  name: '',
  phone: '',
  fulfillment: 'entrega',
  recipient: '',
  address: '',
  date: '',
  time: '',
  cardMessage: '',
  payment: '',
}

export type OrderErrors = Partial<Record<keyof OrderDetails, string>>

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** (11) 98765-4321 enquanto digita. */
export function maskPhone(raw: string): string {
  const d = phoneDigits(raw).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Hoje no fuso do navegador, YYYY-MM-DD (min do campo de data). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function validateOrder(order: OrderDetails, today: string = todayIso()): OrderErrors {
  const errors: OrderErrors = {}
  if (!order.name.trim()) errors.name = 'Diga seu nome para a loja saber quem pediu.'
  const digits = phoneDigits(order.phone)
  if (digits.length < 10 || digits.length > 11) {
    errors.phone = 'Telefone com DDD, ex.: (11) 98765-4321.'
  }
  if (order.fulfillment === 'entrega' && order.address.trim().length < 8) {
    errors.address = 'Rua, número e bairro para a entrega.'
  }
  if (!order.date) errors.date = 'Escolha o dia.'
  else if (order.date < today) errors.date = 'Essa data já passou.'
  if (!order.payment) errors.payment = 'Escolha como vai pagar.'
  return errors
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' })
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y} (${weekday})`
}

/**
 * Texto que chega no WhatsApp da loja. Asteriscos = negrito no WhatsApp.
 * Sem emoji: alguns aparelhos antigos do balcão mostram quadradinhos.
 */
export function buildOrderMessage(
  lines: CartLine[],
  order: OrderDetails,
  storeName: string,
): string {
  const out: string[] = []
  out.push(`Olá, ${storeName}! Quero fazer um pedido pelo site:`)
  out.push('')
  out.push('*Itens*')
  for (const line of lines) {
    out.push(`${line.quantity}x ${line.product.name} — ${formatCurrency(line.subtotal)}`)
  }
  out.push(`*Total dos itens: ${formatCurrency(cartTotal(lines))}*`)
  if (order.fulfillment === 'entrega') out.push('(taxa de entrega a combinar)')
  out.push('')
  out.push('*Cliente*')
  out.push(`Nome: ${order.name.trim()}`)
  out.push(`Telefone: ${maskPhone(order.phone)}`)
  out.push('')
  if (order.fulfillment === 'entrega') {
    out.push('*Entrega*')
    if (order.recipient.trim()) out.push(`Para: ${order.recipient.trim()}`)
    out.push(`Endereço: ${order.address.trim()}`)
  } else {
    out.push('*Retirada na loja*')
  }
  const when = order.date ? formatDateBr(order.date) : 'a combinar'
  out.push(`Quando: ${when}${order.time ? `, ${order.time}` : ''}`)
  if (order.cardMessage.trim()) {
    out.push('')
    out.push('*Mensagem do cartão*')
    out.push(`"${order.cardMessage.trim()}"`)
  }
  out.push('')
  out.push(`*Pagamento:* ${order.payment ? PAYMENT_LABELS[order.payment] : 'a combinar'}`)
  return out.join('\n')
}

/**
 * Link wa.me. Número brasileiro sem DDI ganha 55 na frente; vazio quando o
 * número não está configurado (a tela mostra o aviso em vez de um link quebrado).
 */
export function whatsappLink(storeNumber: string, message: string): string {
  let digits = phoneDigits(storeNumber)
  if (!digits) return ''
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
