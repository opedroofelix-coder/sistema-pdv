// Catálogo. Para trocar a ilustração por foto real, preencha `image`
// com o caminho (ex.: '/fotos/buque-aurora.jpg', arquivo em public/fotos).

export type FlowerKind = 'rose' | 'sunflower' | 'tulip' | 'daisy' | 'orchid' | 'lavender' | 'succulent' | 'peony'
export type Holder = 'wrap' | 'vase' | 'box' | 'pot' | 'basket'

export interface ArtSpec {
  flowers: { kind: FlowerKind; colors: string[]; count: number }[]
  holder: Holder
  /** Cor do embrulho, vaso, caixa ou cachepô. */
  holderColor: string
  /** Fundo do card. */
  bg: string
}

export type Category = 'buques' | 'arranjos' | 'plantas' | 'presentes'
export type Occasion = 'amor' | 'aniversario' | 'agradecimento' | 'maternidade' | 'condolencias' | 'semmotivo'

export interface Product {
  id: string
  name: string
  category: Category
  occasions: Occasion[]
  price: number
  description: string
  /** Selo opcional no card ("Mais pedido", "Novo"...). */
  tag?: string
  image?: string
  art: ArtSpec
}

export const CATEGORIES: { id: Category | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Tudo' },
  { id: 'buques', label: 'Buquês' },
  { id: 'arranjos', label: 'Arranjos' },
  { id: 'plantas', label: 'Plantas' },
  { id: 'presentes', label: 'Presentes' },
]

export const OCCASIONS: { id: Occasion; label: string; line: string; bg: string; ink: string }[] = [
  { id: 'amor', label: 'Amor', line: 'Rosas, peônias e tudo que não cabe numa mensagem.', bg: '#c8553d', ink: '#fbefe6' },
  { id: 'aniversario', label: 'Aniversário', line: 'Cores de festa para abrir o dia de alguém.', bg: '#f0b542', ink: '#2a2116' },
  { id: 'agradecimento', label: 'Obrigado', line: 'Um gesto simples que fica na mesa a semana toda.', bg: '#9db48f', ink: '#1f2b22' },
  { id: 'maternidade', label: 'Nascimento', line: 'Tons suaves para dar boas-vindas.', bg: '#efc6c0', ink: '#3a2422' },
  { id: 'condolencias', label: 'Condolências', line: 'Brancos e verdes, com delicadeza.', bg: '#e9e4d8', ink: '#1f2b22' },
  { id: 'semmotivo', label: 'Sem motivo', line: 'Os melhores presentes não precisam de data.', bg: '#1f2b22', ink: '#f3ede3' },
]

const RED = ['#b3242f', '#8f1a24', '#d23a43']
const BLUSH = ['#f2b5b0', '#e89a96', '#f7cdc6']
const WHITE = ['#fbf8f1', '#efe9dc', '#ffffff']
const YELLOW = ['#f4c430', '#e9a81e', '#f7d75c']
const LILAC = ['#b79ad6', '#9b7cc4', '#d3bfe8']
const CORAL = ['#ee7d5f', '#e0603f', '#f59c80']

export const PRODUCTS: Product[] = [
  {
    id: 'buque-aurora',
    name: 'Buquê Aurora',
    category: 'buques',
    occasions: ['amor'],
    price: 189.9,
    tag: 'Mais pedido',
    description: '12 rosas vermelhas colombianas com folhagem de eucalipto, em papel kraft e laço de cetim.',
    art: { flowers: [{ kind: 'rose', colors: RED, count: 12 }], holder: 'wrap', holderColor: '#d9b98c', bg: '#f6dcd3' },
  },
  {
    id: 'buque-campo',
    name: 'Buquê do Campo',
    category: 'buques',
    occasions: ['aniversario', 'agradecimento', 'semmotivo'],
    price: 139.9,
    description: 'Girassóis e margaridas com ramos verdes. Alegre, solto, com cara de jardim.',
    art: {
      flowers: [
        { kind: 'sunflower', colors: YELLOW, count: 4 },
        { kind: 'daisy', colors: WHITE, count: 6 },
      ],
      holder: 'wrap',
      holderColor: '#c7d3b8',
      bg: '#f7ecc9',
    },
  },
  {
    id: 'buque-tulipas-rose',
    name: 'Tulipas Rosé',
    category: 'buques',
    occasions: ['amor', 'maternidade', 'aniversario'],
    price: 159.9,
    tag: 'Estação',
    description: '10 tulipas holandesas em tons de rosa, embrulhadas em papel de seda.',
    art: { flowers: [{ kind: 'tulip', colors: BLUSH, count: 10 }], holder: 'wrap', holderColor: '#f4e6dc', bg: '#ecd7e0' },
  },
  {
    id: 'buque-sol',
    name: 'Girassol Sol',
    category: 'buques',
    occasions: ['aniversario', 'agradecimento'],
    price: 119.9,
    description: '5 girassóis grandes com folhagem. Impossível não sorrir.',
    art: { flowers: [{ kind: 'sunflower', colors: YELLOW, count: 5 }], holder: 'wrap', holderColor: '#2e4a3a', bg: '#f3e2b5' },
  },
  {
    id: 'buque-serena',
    name: 'Rosas Serena',
    category: 'buques',
    occasions: ['condolencias', 'maternidade', 'agradecimento'],
    price: 169.9,
    description: '12 rosas brancas e lisianthus, em papel verde-musgo. Calmo e elegante.',
    art: { flowers: [{ kind: 'rose', colors: WHITE, count: 12 }], holder: 'wrap', holderColor: '#7f957a', bg: '#e6eadf' },
  },
  {
    id: 'peonias-blush',
    name: 'Peônias Blush',
    category: 'buques',
    occasions: ['amor', 'maternidade'],
    price: 249.9,
    tag: 'Edição limitada',
    description: 'Peônias importadas, abertas e perfumadas. Disponível por encomenda (48h).',
    art: { flowers: [{ kind: 'peony', colors: BLUSH, count: 7 }], holder: 'wrap', holderColor: '#fbf3ec', bg: '#f3d9d3' },
  },
  {
    id: 'box-jardim',
    name: 'Box Jardim',
    category: 'arranjos',
    occasions: ['aniversario', 'amor', 'semmotivo'],
    price: 219.9,
    description: 'Caixa redonda com rosas, tulipas e margaridas, montada em espuma floral. Dura até 7 dias.',
    art: {
      flowers: [
        { kind: 'rose', colors: CORAL, count: 6 },
        { kind: 'tulip', colors: BLUSH, count: 4 },
        { kind: 'daisy', colors: WHITE, count: 5 },
      ],
      holder: 'box',
      holderColor: '#efe6d8',
      bg: '#f2ddcd',
    },
  },
  {
    id: 'arranjo-paz',
    name: 'Arranjo Paz',
    category: 'arranjos',
    occasions: ['condolencias'],
    price: 259.9,
    description: 'Arranjo em vaso de vidro com rosas brancas, lírios e folhagens. Acompanha cartão.',
    art: {
      flowers: [
        { kind: 'rose', colors: WHITE, count: 6 },
        { kind: 'daisy', colors: WHITE, count: 6 },
      ],
      holder: 'vase',
      holderColor: '#cfe0df',
      bg: '#e4e7df',
    },
  },
  {
    id: 'vaso-lavanda',
    name: 'Lavanda Provence',
    category: 'arranjos',
    occasions: ['agradecimento', 'semmotivo'],
    price: 99.9,
    description: 'Ramos de lavanda em vaso de vidro. Perfuma o ambiente por dias.',
    art: { flowers: [{ kind: 'lavender', colors: LILAC, count: 14 }], holder: 'vase', holderColor: '#dfe6ee', bg: '#e5def0' },
  },
  {
    id: 'orquidea-branca',
    name: 'Orquídea Branca',
    category: 'plantas',
    occasions: ['condolencias', 'agradecimento', 'maternidade'],
    price: 149.9,
    tag: 'Dura meses',
    description: 'Phalaenopsis com duas hastes em cachepô de cerâmica. Floresce de novo todo ano.',
    art: { flowers: [{ kind: 'orchid', colors: WHITE, count: 7 }], holder: 'pot', holderColor: '#efe9dc', bg: '#dfe5da' },
  },
  {
    id: 'orquidea-lilas',
    name: 'Orquídea Lilás',
    category: 'plantas',
    occasions: ['aniversario', 'maternidade', 'semmotivo'],
    price: 139.9,
    description: 'Phalaenopsis lilás em cachepô de barro. Fácil de cuidar: rega uma vez por semana.',
    art: { flowers: [{ kind: 'orchid', colors: LILAC, count: 7 }], holder: 'pot', holderColor: '#c9764f', bg: '#ece3ef' },
  },
  {
    id: 'trio-suculentas',
    name: 'Trio de Suculentas',
    category: 'plantas',
    occasions: ['agradecimento', 'semmotivo', 'aniversario'],
    price: 69.9,
    description: 'Três suculentas em vasinho de barro. Presente que dura e quase não dá trabalho.',
    art: { flowers: [{ kind: 'succulent', colors: ['#8fb08c', '#6f9a7d', '#a9c4a0'], count: 3 }], holder: 'pot', holderColor: '#c9764f', bg: '#e3ead9' },
  },
  {
    id: 'cesta-cafe',
    name: 'Cesta Café & Flores',
    category: 'presentes',
    occasions: ['aniversario', 'maternidade', 'amor'],
    price: 249.9,
    tag: 'Entrega até 10h',
    description: 'Cesta com mini buquê, pães, geleia, frutas, suco e chocolate. Ideal para começar o dia.',
    art: {
      flowers: [
        { kind: 'rose', colors: CORAL, count: 4 },
        { kind: 'daisy', colors: WHITE, count: 4 },
      ],
      holder: 'basket',
      holderColor: '#b98a55',
      bg: '#f4e4cf',
    },
  },
  {
    id: 'rosa-chocolate',
    name: 'Rosa & Chocolate',
    category: 'presentes',
    occasions: ['amor', 'agradecimento', 'semmotivo'],
    price: 49.9,
    description: 'Uma rosa vermelha embalada + caixa de bombons artesanais. Pequeno e certeiro.',
    art: { flowers: [{ kind: 'rose', colors: RED, count: 1 }], holder: 'wrap', holderColor: '#2b2b2b', bg: '#f1d6d0' },
  },
]

/** Bouquet do topo do site (só ilustração). */
export const HERO_ART: ArtSpec = {
  flowers: [
    { kind: 'peony', colors: BLUSH, count: 4 },
    { kind: 'rose', colors: CORAL, count: 5 },
    { kind: 'tulip', colors: ['#f6a38b', '#ee7d5f', '#fbc2ae'], count: 4 },
    { kind: 'daisy', colors: WHITE, count: 5 },
    { kind: 'sunflower', colors: YELLOW, count: 2 },
  ],
  holder: 'wrap',
  holderColor: '#d9b98c',
  bg: 'transparent',
}
