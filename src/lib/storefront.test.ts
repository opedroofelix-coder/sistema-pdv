import { describe, it, expect } from 'vitest'
import {
  buildOrderMessage,
  cartLines,
  cartTotal,
  categorize,
  changeQuantity,
  EMPTY_ORDER,
  maskPhone,
  reconcileCart,
  validateOrder,
  whatsappLink,
  type CatalogProduct,
  type OrderDetails,
} from './storefront'
import { formatTagPrice } from './storefrontFormat'

const buque: CatalogProduct = { id: 'a', name: 'Buquê 12 rosas vermelhas', price: 149.9, photo_url: null, available: 3 }
const cesta: CatalogProduct = { id: 'b', name: 'Cesta café da manhã', price: 120, photo_url: null, available: 1 }

describe('categorize', () => {
  it('usa o nome, sem acento', () => {
    expect(categorize('Buquê 12 rosas')).toBe('buques')
    expect(categorize('ORQUÍDEA Phalaenopsis branca')).toBe('plantas')
    expect(categorize('Caixa de bombom')).toBe('chocolates')
    expect(categorize('Kalanchoe no vaso de cerâmica')).toBe('plantas')
  })
  it('cesta ganha de chocolate', () => {
    expect(categorize('Cesta com chocolates')).toBe('cestas')
  })
  it('não casa pedaço de palavra', () => {
    expect(categorize('Prosa de girassol')).toBe('outros')
  })
})

describe('sacola', () => {
  it('não passa do saldo do estoque', () => {
    let cart = changeQuantity({}, cesta, 1)
    cart = changeQuantity(cart, cesta, 1)
    expect(cart).toEqual({ b: 1 })
  })
  it('zero remove a linha', () => {
    expect(changeQuantity({ a: 1 }, buque, -1)).toEqual({})
  })
  it('linhas somem ou encolhem quando o catálogo muda', () => {
    const cart = { a: 3, b: 1, sumiu: 2 }
    const lines = cartLines(cart, [{ ...buque, available: 2 }, cesta])
    expect(lines.map((l) => [l.product.id, l.quantity])).toEqual([['a', 2], ['b', 1]])
    expect(cartTotal(lines)).toBe(419.8)
    expect(reconcileCart(cart, [{ ...buque, available: 2 }, cesta])).toEqual({ a: 2, b: 1 })
  })
})

describe('pedido', () => {
  const order: OrderDetails = {
    ...EMPTY_ORDER,
    name: ' Ana ',
    phone: '11987654321',
    recipient: 'Dona Marta',
    address: 'Rua das Flores, 10 - Centro',
    date: '2026-12-24',
    time: 'manhã',
    cardMessage: 'Feliz Natal, mãe!',
    payment: 'pix',
  }

  it('valida o que a loja precisa', () => {
    const errors = validateOrder(EMPTY_ORDER, '2026-11-22')
    expect(Object.keys(errors).sort()).toEqual(['address', 'date', 'name', 'payment', 'phone'])
    expect(validateOrder(order, '2026-11-22')).toEqual({})
  })
  it('retirada não pede endereço; data passada é erro', () => {
    const errors = validateOrder({ ...order, fulfillment: 'retirada', address: '', date: '2026-11-01' }, '2026-11-22')
    expect(errors).toEqual({ date: 'Essa data já passou.' })
  })

  it('monta a mensagem completa', () => {
    const msg = buildOrderMessage(cartLines({ a: 2 }, [buque]), order, 'Lú-Bia Flores').replace(/\u00a0/g, ' ')
    expect(msg).toContain('Olá, Lú-Bia Flores!')
    expect(msg).toContain('2x Buquê 12 rosas vermelhas — R$ 299,80')
    expect(msg).toContain('*Total dos itens: R$ 299,80*')
    expect(msg).toContain('Nome: Ana')
    expect(msg).toContain('Telefone: (11) 98765-4321')
    expect(msg).toContain('Para: Dona Marta')
    expect(msg).toContain('Quando: 24/12/2026 (quinta-feira), manhã')
    expect(msg).toContain('"Feliz Natal, mãe!"')
    expect(msg).toContain('*Pagamento:* Pix')
  })

  it('retirada não fala de endereço nem taxa', () => {
    const msg = buildOrderMessage(cartLines({ b: 1 }, [cesta]), { ...order, fulfillment: 'retirada' }, 'Loja')
    expect(msg).toContain('*Retirada na loja*')
    expect(msg).not.toContain('Endereço')
    expect(msg).not.toContain('taxa de entrega')
  })
})

describe('whatsappLink', () => {
  it('põe DDI 55 e codifica o texto', () => {
    expect(whatsappLink('(11) 4002-8922', 'oi & tchau')).toBe('https://wa.me/551140028922?text=oi%20%26%20tchau')
    expect(whatsappLink('5511987654321', 'x')).toBe('https://wa.me/5511987654321?text=x')
  })
  it('vazio sem número', () => {
    expect(whatsappLink('', 'x')).toBe('')
  })
})

describe('formatação', () => {
  it('telefone', () => {
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321')
    expect(maskPhone('1140028922')).toBe('(11) 4002-8922')
  })
  it('etiqueta de preço', () => {
    expect(formatTagPrice(1200)).toEqual({ whole: '1.200', cents: '' })
    expect(formatTagPrice(89.9)).toEqual({ whole: '89', cents: '90' })
  })
})
