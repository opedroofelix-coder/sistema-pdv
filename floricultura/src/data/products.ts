// Catálogo. Cada produto aponta para uma foto em src/assets/fotos/<photo>.jpg.
// Para trocar por foto da loja, substitua o arquivo mantendo o nome
// (ou mude a chave aqui).

export type Category = 'buques' | 'arranjos' | 'plantas' | 'presentes'
export type Occasion = 'aniversario' | 'amor' | 'casamento' | 'agradecimento' | 'nascimento' | 'condolencias' | 'semmotivo'

export interface Product {
  id: string
  name: string
  category: Category
  occasions: Occasion[]
  price: number
  description: string
  photo: string
  tag?: string
}

export const CATEGORIES: { id: Category | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'buques', label: 'Buquês' },
  { id: 'arranjos', label: 'Arranjos' },
  { id: 'plantas', label: 'Plantas' },
  { id: 'presentes', label: 'Presentes' },
]

export const OCCASIONS: { id: Occasion; label: string; photo: string }[] = [
  { id: 'aniversario', label: 'Aniversário', photo: 'occ-aniversario' },
  { id: 'amor', label: 'Amor', photo: 'occ-amor' },
  { id: 'casamento', label: 'Casamento', photo: 'occ-casamento' },
  { id: 'agradecimento', label: 'Agradecer', photo: 'occ-agradecimento' },
  { id: 'nascimento', label: 'Nascimento', photo: 'occ-nascimento' },
  { id: 'condolencias', label: 'Condolências', photo: 'occ-condolencias' },
  { id: 'semmotivo', label: 'Sem motivo', photo: 'occ-semmotivo' },
]

export const PRODUCTS: Product[] = [
  {
    id: 'jardim-de-peonias',
    name: 'Jardim de Peônias',
    category: 'buques',
    occasions: ['amor', 'aniversario', 'casamento'],
    price: 389.9,
    tag: 'Mais pedido',
    description: 'Peônias rosadas abertas, com folhagem delicada. Perfumadas e volumosas.',
    photo: 'p-peonias',
  },
  {
    id: 'nuvem-rose',
    name: 'Nuvem Rosê',
    category: 'arranjos',
    occasions: ['amor', 'aniversario', 'nascimento'],
    price: 229.9,
    description: 'Rosas rosê e flores miúdas em vaso de vidro. Leve e romântico.',
    photo: 'p-rosas-rose',
  },
  {
    id: 'manha-de-tulipas',
    name: 'Manhã de Tulipas',
    category: 'arranjos',
    occasions: ['aniversario', 'agradecimento', 'semmotivo'],
    price: 179.9,
    description: 'Tulipas brancas em vaso de vidro. Simples, claro, elegante.',
    photo: 'p-tulipas-brancas',
  },
  {
    id: 'campo-de-lavanda',
    name: 'Campo de Lavanda',
    category: 'arranjos',
    occasions: ['agradecimento', 'semmotivo'],
    price: 149.9,
    description: 'Lavanda e flores do campo em jarra de porcelana. Perfuma a casa.',
    photo: 'p-lavanda',
  },
  {
    id: 'branco-sereno',
    name: 'Branco Sereno',
    category: 'buques',
    occasions: ['casamento', 'condolencias', 'agradecimento'],
    price: 259.9,
    description: 'Rosas brancas e creme, com acabamento em papel de seda.',
    photo: 'p-rosas-brancas',
  },
  {
    id: 'hortensia-blush',
    name: 'Hortênsia Blush',
    category: 'arranjos',
    occasions: ['nascimento', 'amor', 'semmotivo'],
    price: 199.9,
    description: 'Hortênsia rosada em vaso de vidro. Cheia, macia, cor de algodão-doce.',
    photo: 'p-hortensia',
  },
  {
    id: 'doce-ranunculo',
    name: 'Doce Ranúnculo',
    category: 'arranjos',
    occasions: ['aniversario', 'nascimento', 'amor'],
    price: 209.9,
    tag: 'Estação',
    description: 'Ranúnculos e cravos rosa em vaso alto. Camadas de pétalas.',
    photo: 'p-ranunculo',
  },
  {
    id: 'sol-de-girassol',
    name: 'Sol de Girassol',
    category: 'buques',
    occasions: ['aniversario', 'agradecimento'],
    price: 159.9,
    description: 'Girassóis e flores vermelhas em jarra. Alegria instantânea.',
    photo: 'p-girassol',
  },
  {
    id: 'tulipa-rosa',
    name: 'Tulipas Rosadas',
    category: 'buques',
    occasions: ['amor', 'semmotivo'],
    price: 169.9,
    description: 'Tulipas rosa-pink com hastes longas. Ficam lindas na janela.',
    photo: 'p-tulipas-rosa',
  },
  {
    id: 'rosa-unica',
    name: 'Rosa Única',
    category: 'presentes',
    occasions: ['amor', 'agradecimento', 'semmotivo'],
    price: 69.9,
    description: 'Uma rosa rosê em vasinho de cerâmica. Pequeno gesto, grande efeito.',
    photo: 'p-rosa-unica',
  },
  {
    id: 'duo-verde',
    name: 'Duo Verde',
    category: 'plantas',
    occasions: ['agradecimento', 'semmotivo'],
    price: 119.9,
    description: 'Duas plantinhas em vasos de cimento claro. Pedem pouca água.',
    photo: 'p-suculentas',
  },
  {
    id: 'flor-de-cerejeira',
    name: 'Galhos de Cerejeira',
    category: 'arranjos',
    occasions: ['casamento', 'nascimento', 'semmotivo'],
    price: 189.9,
    tag: 'Edição limitada',
    description: 'Galhos floridos em dois vasos de cerâmica branca. Decoração pronta.',
    photo: 'p-cerejeira',
  },
]

/* ───────── Monte seu buquê ───────── */

export interface BuilderOption {
  id: string
  name: string
  price: number
  color: string
}

export const BUILDER = {
  base: { name: 'Montagem e acabamento', price: 25 },
  flowers: [
    { id: 'peonia', name: 'Peônia rosa', price: 32, color: '#e8a3b5' },
    { id: 'rosa-rose', name: 'Rosa rosê', price: 14, color: '#f0bfc3' },
    { id: 'rosa-branca', name: 'Rosa branca', price: 14, color: '#f3ece4' },
    { id: 'tulipa', name: 'Tulipa', price: 12, color: '#f3a6b8' },
    { id: 'lisianthus', name: 'Lisianthus', price: 10, color: '#d9c3e6' },
    { id: 'mosquitinho', name: 'Mosquitinho', price: 8, color: '#ffffff' },
    { id: 'eucalipto', name: 'Eucalipto', price: 6, color: '#9fb5a0' },
  ] as BuilderOption[],
  wraps: [
    { id: 'kraft', name: 'Papel kraft', price: 0, color: '#d6b48c' },
    { id: 'seda', name: 'Papel de seda rosê', price: 12, color: '#f2d4d0' },
    { id: 'caixa', name: 'Caixa redonda', price: 45, color: '#2a211f' },
    { id: 'vaso', name: 'Vaso de vidro', price: 38, color: '#dfe8e8' },
  ] as BuilderOption[],
  ribbons: [
    { id: 'cetim-rose', name: 'Cetim rosê', price: 0, color: '#e9b9b5' },
    { id: 'cetim-off', name: 'Cetim off-white', price: 0, color: '#f4efe6' },
    { id: 'juta', name: 'Juta natural', price: 0, color: '#c4a57a' },
  ] as BuilderOption[],
  extras: [
    { id: 'chocolate', name: 'Bombons artesanais', price: 34, color: '#6b4636' },
    { id: 'vela', name: 'Vela aromática', price: 49, color: '#efe2cf' },
    { id: 'pelucia', name: 'Ursinho de pelúcia', price: 45, color: '#c9a27e' },
  ] as BuilderOption[],
}
