import { describe, expect, it } from 'vitest'
import { buildOrderMessage, deliveryFeeOf, missingFields, subtotalOf, whatsappUrl, type Customer } from './order'
import { maskPhone } from './format'

const rules = { fee: 15, freeFrom: 200 }
const base: Customer = {
  name: 'Ana',
  phone: '(11) 98888-7777',
  mode: 'entrega',
  recipient: 'Maria',
  address: 'Rua A, 10',
  neighborhood: 'Centro',
  date: '2026-11-24',
  period: 'Manhã (8h–12h)',
  cardMessage: 'Feliz aniversário!',
  payment: 'Pix',
  notes: '',
}

describe('pedido', () => {
  it('soma subtotal sem erro de ponto flutuante', () => {
    expect(subtotalOf([{ name: 'a', price: 49.9, qty: 3 }])).toBe(149.7)
  })

  it('cobra entrega abaixo do mínimo, zera acima e na retirada', () => {
    expect(deliveryFeeOf(150, 'entrega', rules)).toBe(15)
    expect(deliveryFeeOf(200, 'entrega', rules)).toBe(0)
    expect(deliveryFeeOf(50, 'retirada', rules)).toBe(0)
    expect(deliveryFeeOf(500, 'entrega', { fee: 15, freeFrom: 0 })).toBe(15)
  })

  it('exige endereço só na entrega', () => {
    const c = { ...base, address: '', neighborhood: '' }
    expect(missingFields(c)).toEqual(['address', 'neighborhood'])
    expect(missingFields({ ...c, mode: 'retirada' })).toEqual([])
    expect(missingFields({ ...base, phone: '1199' })).toEqual(['phone'])
  })

  it('monta a mensagem com itens, total e dados', () => {
    const msg = buildOrderMessage([{ name: 'Buquê Aurora', price: 189.9, qty: 1 }], base, rules)
    expect(msg).toContain('• 1x Buquê Aurora — R$ 189,90')
    expect(msg).toContain('Entrega: R$ 15,00')
    expect(msg).toContain('*Total: R$ 204,90*')
    expect(msg).toContain('Data: 24/11/2026 · Manhã (8h–12h)')
    expect(msg).toContain('"Feliz aniversário!"')
    expect(msg).toContain('Para: Maria')
  })

  it('retirada não mostra endereço nem taxa', () => {
    const msg = buildOrderMessage([{ name: 'X', price: 10, qty: 2 }], { ...base, mode: 'retirada' }, rules)
    expect(msg).toContain('Retirada na loja')
    expect(msg).not.toContain('Endereço')
    expect(msg).toContain('*Total: R$ 20,00*')
  })

  it('gera link wa.me com texto codificado', () => {
    expect(whatsappUrl('+55 (11) 99999-9999', 'Oi & tchau')).toBe('https://wa.me/5511999999999?text=Oi%20%26%20tchau')
  })

  it('mascara telefone', () => {
    expect(maskPhone('11988887777')).toBe('(11) 98888-7777')
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
  })
})
