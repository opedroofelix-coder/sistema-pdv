import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { PRODUCTS, type Product } from '../data/products'

type Lines = Record<string, number>
type Action =
  | { type: 'add'; id: string; qty?: number }
  | { type: 'set'; id: string; qty: number }
  | { type: 'clear' }

const KEY = 'floricultura:sacola'

function reducer(state: Lines, a: Action): Lines {
  switch (a.type) {
    case 'add':
      return { ...state, [a.id]: Math.min(20, (state[a.id] ?? 0) + (a.qty ?? 1)) }
    case 'set': {
      const next = { ...state }
      if (a.qty <= 0) delete next[a.id]
      else next[a.id] = Math.min(20, a.qty)
      return next
    }
    case 'clear':
      return {}
  }
}

function load(): Lines {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Lines
    // descarta produtos que saíram do catálogo
    return Object.fromEntries(Object.entries(parsed).filter(([id, q]) => PRODUCTS.some((p) => p.id === id) && q > 0))
  } catch {
    return {}
  }
}

interface CartCtx {
  items: { product: Product; qty: number }[]
  count: number
  subtotal: number
  qtyOf: (id: string) => number
  add: (id: string) => void
  setQty: (id: string, qty: number) => void
  clear: () => void
  open: boolean
  setOpen: (v: boolean) => void
}

const Ctx = createContext<CartCtx | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, undefined, load)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines))
    } catch {
      /* navegação privada: a sacola só vive na aba */
    }
  }, [lines])

  const value = useMemo<CartCtx>(() => {
    const items = PRODUCTS.filter((p) => lines[p.id]).map((product) => ({ product, qty: lines[product.id] }))
    return {
      items,
      count: items.reduce((s, i) => s + i.qty, 0),
      subtotal: Math.round(items.reduce((s, i) => s + i.product.price * i.qty, 0) * 100) / 100,
      qtyOf: (id) => lines[id] ?? 0,
      add: (id) => dispatch({ type: 'add', id }),
      setQty: (id, qty) => dispatch({ type: 'set', id, qty }),
      clear: () => dispatch({ type: 'clear' }),
      open,
      setOpen,
    }
  }, [lines, open])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCart fora do CartProvider')
  return c
}
