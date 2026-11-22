import { brl, dateBR, onlyDigits } from './format'

export interface OrderLine {
  name: string
  price: number
  qty: number
}

export interface Customer {
  name: string
  phone: string
  mode: 'entrega' | 'retirada'
  recipient: string
  address: string
  neighborhood: string
  date: string
  period: string
  cardMessage: string
  payment: string
  notes: string
}

export interface DeliveryRules {
  fee: number
  freeFrom: number
}

export function subtotalOf(lines: OrderLine[]): number {
  return round2(lines.reduce((s, l) => s + l.price * l.qty, 0))
}

export function deliveryFeeOf(subtotal: number, mode: Customer['mode'], rules: DeliveryRules): number {
  if (mode === 'retirada') return 0
  if (rules.freeFrom > 0 && subtotal >= rules.freeFrom) return 0
  return rules.fee
}

/** Campos obrigatórios que faltam, com o rótulo para mostrar ao cliente. */
export function missingFields(c: Customer): (keyof Customer)[] {
  const miss: (keyof Customer)[] = []
  if (!c.name.trim()) miss.push('name')
  if (onlyDigits(c.phone).length < 10) miss.push('phone')
  if (!c.date) miss.push('date')
  if (!c.period) miss.push('period')
  if (!c.payment) miss.push('payment')
  if (c.mode === 'entrega') {
    if (!c.address.trim()) miss.push('address')
    if (!c.neighborhood.trim()) miss.push('neighborhood')
  }
  return miss
}

/** Texto do pedido que vai pronto na conversa do WhatsApp. */
export function buildOrderMessage(lines: OrderLine[], c: Customer, rules: DeliveryRules): string {
  const subtotal = subtotalOf(lines)
  const fee = deliveryFeeOf(subtotal, c.mode, rules)
  const total = round2(subtotal + fee)

  const out: string[] = []
  out.push('Olá! Quero fazer este pedido pelo site:', '')
  out.push('*PEDIDO*')
  for (const l of lines) out.push(`• ${l.qty}x ${l.name} — ${brl(l.price * l.qty)}`)
  out.push('')
  out.push(`Subtotal: ${brl(subtotal)}`)
  if (c.mode === 'entrega') out.push(`Entrega: ${fee === 0 ? 'grátis' : brl(fee)}`)
  else out.push('Retirada na loja')
  out.push(`*Total: ${brl(total)}*`, '')

  out.push('*CLIENTE*')
  out.push(`Nome: ${c.name.trim()}`)
  out.push(`Telefone: ${c.phone.trim()}`, '')

  if (c.mode === 'entrega') {
    out.push('*ENTREGA*')
    if (c.recipient.trim()) out.push(`Para: ${c.recipient.trim()}`)
    out.push(`Endereço: ${c.address.trim()}`)
    out.push(`Bairro: ${c.neighborhood.trim()}`)
  } else {
    out.push('*RETIRADA NA LOJA*')
  }
  out.push(`Data: ${dateBR(c.date)} · ${c.period}`, '')

  if (c.cardMessage.trim()) out.push('*CARTÃO*', `"${c.cardMessage.trim()}"`, '')
  out.push(`Pagamento: ${c.payment}`)
  if (c.notes.trim()) out.push(`Observações: ${c.notes.trim()}`)

  return out.join('\n')
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${onlyDigits(number)}?text=${encodeURIComponent(text)}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
