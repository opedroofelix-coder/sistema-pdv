import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { PRODUCTS, type Product } from '../data/products'

/** Buquê montado pelo cliente no "Monte seu buquê". */
export interface CustomItem {
  id: string
  name: string
  price: number
  details: string[]
}

interface State {
  lines: Record<string, number>
  customs: Record<string, { item: CustomItem; qty: number }>
}

type Action =
  | { type: 'add'; id: string; qty?: number }
  | { type: 'set'; id: string; qty: number }
  | { type: 'addCustom'; item: CustomItem }
  | { type: 'clear' }

const KEY = 'floricultura:sacola:v2'
const MAX = 20

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'add': {
      if (state.customs[a.id]) {
        const c = state.customs[a.id]
        return { ...state, customs: { ...state.customs, [a.id]: { ...c, qty: Math.min(MAX, c.qty + (a.qty ?? 1)) } } }
      }
      return { ...state, lines: { ...state.lines, [a.id]: Math.min(MAX, (state.lines[a.id] ?? 0) + (a.qty ?? 1)) } }
    }
    case 'set': {
      if (state.customs[a.id]) {
        const customs = { ...state.customs }
        if (a.qty <= 0) delete customs[a.id]
        else customs[a.id] = { ...customs[a.id], qty: Math.min(MAX, a.qty) }
        return { ...state, customs }
      }
      const lines = { ...state.lines }
      if (a.qty <= 0) delete lines[a.id]
      else lines[a.id] = Math.min(MAX, a.qty)
      return { ...state, lines }
    }
    case 'addCustom':
      return { ...state, customs: { ...state.customs, [a.item.id]: { item: a.item, qty: 1 } } }
    case 'clear':
      return { lines: {}, customs: {} }
  }
}

function load(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null
    if (!parsed) return { lines: {}, customs: {} }
    const lines = Object.fromEntries(Object.entries(parsed.lines ?? {}).filter(([id, q]) => PRODUCTS.some((p) => p.id === id) && q > 0))
    return { lines, customs: parsed.customs ?? {} }
  } catch {
    return { lines: {}, customs: {} }
  }
}

export interface CartItem {
  key: string
  name: string
  price: number
  qty: number
  product?: Product
  details?: string[]
}

interface CartCtx {
  items: CartItem[]
  count: number
  subtotal: number
  qtyOf: (id: string) => number
  add: (id: string) => void
  setQty: (id: string, qty: number) => void
  addCustom: (item: CustomItem) => void
  clear: () => void
  open: boolean
  setOpen: (v: boolean) => void
  /** Incrementa a cada adição — o ícone da sacola usa para pulsar. */
  pulse: number
}

const Ctx = createContext<CartCtx | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  const [open, setOpen] = useState(false)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* navegação privada: a sacola só vive na aba */
    }
  }, [state])

  const value = useMemo<CartCtx>(() => {
    const items: CartItem[] = [
      ...PRODUCTS.filter((p) => state.lines[p.id]).map((product) => ({
        key: product.id,
        name: product.name,
        price: product.price,
        qty: state.lines[product.id],
        product,
      })),
      ...Object.values(state.customs).map(({ item, qty }) => ({ key: item.id, name: item.name, price: item.price, qty, details: item.details })),
    ]
    return {
      items,
      count: items.reduce((s, i) => s + i.qty, 0),
      subtotal: Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100,
      qtyOf: (id) => state.lines[id] ?? state.customs[id]?.qty ?? 0,
      add: (id) => {
        dispatch({ type: 'add', id })
        setPulse((n) => n + 1)
      },
      setQty: (id, qty) => dispatch({ type: 'set', id, qty }),
      addCustom: (item) => {
        dispatch({ type: 'addCustom', item })
        setPulse((n) => n + 1)
      },
      clear: () => dispatch({ type: 'clear' }),
      open,
      setOpen,
      pulse,
    }
  }, [state, open, pulse])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCart fora do CartProvider')
  return c
}
