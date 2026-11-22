// ─────────────────────────────────────────────────────────────
// Dados da loja. É SÓ AQUI que se troca nome, WhatsApp, endereço,
// horário e regras de entrega — o resto do site lê deste arquivo.
// ─────────────────────────────────────────────────────────────

export const STORE = {
  name: 'Ateliê das Flores',
  shortName: 'Ateliê',
  tagline: 'Floricultura & presentes',

  /** Número do WhatsApp que recebe os pedidos: DDI + DDD + número, só dígitos. */
  whatsapp: '5511999999999',
  /** Como o número aparece escrito no site. */
  whatsappDisplay: '(11) 99999-9999',

  instagram: 'ateliedasflores',
  address: 'Rua das Hortênsias, 120 · Centro',
  city: 'São Paulo · SP',
  hours: [
    { days: 'Seg a Sex', time: '8h às 19h' },
    { days: 'Sábado', time: '8h às 17h' },
    { days: 'Domingo', time: '8h às 12h' },
  ],

  delivery: {
    /** Taxa fixa de entrega em reais. */
    fee: 15,
    /** Pedidos a partir deste valor têm entrega grátis (0 desliga). */
    freeFrom: 200,
    /** Texto curto sobre a área atendida. */
    area: 'Entregamos na cidade toda. Pedidos até 14h saem no mesmo dia.',
  },

  periods: ['Manhã (8h–12h)', 'Tarde (12h–18h)'],
  payments: ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'],
} as const
