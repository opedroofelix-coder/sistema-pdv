import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, AtSign, MessageCircle, RefreshCw, Search, ShoppingBag, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import {
  CATEGORIES,
  cartCount,
  cartLines,
  cartTotal,
  categorize,
  changeQuantity,
  EMPTY_ORDER,
  reconcileCart,
  whatsappLink,
  type Cart,
  type CatalogProduct,
  type CategoryId,
  type OrderDetails,
} from '../lib/storefront'
import { formatCurrency, normalizeText } from '../lib/storefrontFormat'
import { STORE } from '../lib/storefrontConfig'
import { ProductTile, ProductTileSkeleton } from '../components/loja/ProductTile'
import { BagLines } from '../components/loja/BagLines'
import { OrderSheet } from '../components/loja/OrderSheet'
import './loja.css'

const CART_KEY = 'loja-sacola'
const CUSTOMER_KEY = 'loja-cliente'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* modo privado / armazenamento cheio: a sacola só não sobrevive ao recarregar */
  }
}

type Status = 'loading' | 'ready' | 'error'
type Filter = CategoryId | 'todos'

export function Loja() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [cart, setCart] = useState<Cart>(() => readJson<Cart>(CART_KEY, {}))
  const [order, setOrder] = useState<OrderDetails>(() => ({
    ...EMPTY_ORDER,
    ...readJson<Partial<OrderDetails>>(CUSTOMER_KEY, {}),
  }))
  const [filter, setFilter] = useState<Filter>('todos')
  const [query, setQuery] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [bump, setBump] = useState(0)

  const load = useCallback(async () => {
    setStatus('loading')
    const { data, error } = await supabase.rpc('public_catalog')
    if (error) {
      setStatus('error')
      return
    }
    const list = ((data ?? []) as CatalogProduct[]).map((p) => ({ ...p, price: Number(p.price) }))
    setProducts(list)
    setCart((c) => reconcileCart(c, list))
    setStatus('ready')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const previousTitle = document.title
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute('content')
    document.title = `${STORE.name} · Catálogo de flores`
    meta?.setAttribute('content', '#f1eee7')
    return () => {
      document.title = previousTitle
      if (previousColor) meta?.setAttribute('content', previousColor)
    }
  }, [])

  useEffect(() => writeJson(CART_KEY, cart), [cart])
  useEffect(() => {
    const { name, phone, fulfillment, address } = order
    writeJson(CUSTOMER_KEY, { name, phone, fulfillment, address })
  }, [order])

  const lines = useMemo(() => cartLines(cart, products), [cart, products])
  const count = cartCount(lines)
  const total = cartTotal(lines)

  const withCategory = useMemo(
    () => products.map((p) => ({ product: p, category: categorize(p.name) })),
    [products],
  )
  const counts = useMemo(() => {
    const map = new Map<Filter, number>([['todos', products.length]])
    for (const { category } of withCategory) map.set(category, (map.get(category) ?? 0) + 1)
    return map
  }, [withCategory, products.length])

  const visible = useMemo(() => {
    const q = normalizeText(query)
    return withCategory
      .filter(({ category }) => filter === 'todos' || category === filter)
      .filter(({ product }) => !q || normalizeText(product.name).includes(q))
      .map(({ product }) => product)
  }, [withCategory, filter, query])

  const allFilters: { id: Filter; label: string }[] = [
    { id: 'todos', label: 'Tudo' },
    ...CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label })),
    { id: 'outros', label: 'Outros' },
  ]
  const filters = allFilters.filter((f) => (counts.get(f.id) ?? 0) > 0)

  function change(product: CatalogProduct, delta: number) {
    setCart((c) => changeQuantity(c, product, delta))
    if (delta > 0) setBump((n) => n + 1)
  }

  const changeById = useCallback(
    (id: string, delta: number) => {
      const product = products.find((p) => p.id === id)
      if (product) setCart((c) => changeQuantity(c, product, delta))
    },
    [products],
  )

  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const onSent = useCallback(() => setCart({}), [])

  const askLink = whatsappLink(STORE.whatsapp, `Olá, ${STORE.name}! Vim pelo catálogo do site e tenho uma dúvida.`)

  return (
    <div className="loja">
      <header className="mx-auto max-w-[1240px] px-4 pb-6 pt-8 sm:px-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="loja-hand text-[44px] leading-[0.95] tracking-[-0.01em] sm:text-[64px]">
              {STORE.name}
            </h1>
            <p className="loja-stamp mt-2 text-[14px] text-[var(--l-ink-2)] sm:text-[15px]">
              Floricultura · {STORE.city}
            </p>
          </div>
          <a
            href={STORE.instagram}
            target="_blank"
            rel="noopener"
            className="mt-2 flex h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[var(--l-line-strong)] px-4 text-[14px] font-semibold hover:border-[var(--l-ink)]"
          >
            <AtSign size={16} aria-hidden />
            <span className="hidden sm:inline">Instagram</span>
            <span className="sm:hidden">Insta</span>
          </a>
        </div>
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-ink-2)] sm:text-[19px]">
          Buquês, cestas e chocolates do nosso estoque de hoje. Escolha aqui e mande o pedido no
          WhatsApp: a gente confirma, combina o pagamento e entrega.
        </p>
      </header>

      <div className="sticky top-0 z-30 border-y border-[var(--l-line)] bg-[color-mix(in_srgb,var(--l-ground)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-8">
          <label className="relative block sm:w-72 sm:shrink-0">
            <span className="sr-only">Buscar no catálogo</span>
            <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--l-ink-2)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar rosas, orquídea, cesta…"
              className="loja-field min-h-11 rounded-full py-2 pl-10"
            />
          </label>
          <nav aria-label="Categorias" className="loja-scroll-x -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex gap-1.5">
              {filters.map((f) => {
                const active = filter === f.id
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(f.id)}
                      className={`loja-stamp flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] transition-colors ${
                        active
                          ? 'bg-[var(--l-ink)] text-[var(--l-paper)]'
                          : 'text-[var(--l-ink)] hover:bg-[var(--l-ground-2)]'
                      }`}
                    >
                      {f.label}
                      <span className={active ? 'text-[var(--l-kraft)]' : 'text-[var(--l-ink-2)]'}>
                        {counts.get(f.id)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-[1240px] px-4 pb-32 pt-8 sm:px-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-10 lg:pb-16">
        <section aria-label="Catálogo">
          {status === 'loading' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <ProductTileSkeleton key={i} />
              ))}
            </div>
          )}

          {status === 'error' && (
            <Notice
              title="Não deu para carregar o catálogo"
              text="Confira sua internet e tente de novo. Se preferir, chame a loja direto no WhatsApp."
            >
              <button
                type="button"
                onClick={() => void load()}
                className="flex h-12 items-center gap-2 rounded-full bg-[var(--l-ink)] px-5 font-semibold text-[var(--l-paper)]"
              >
                <RefreshCw size={18} aria-hidden /> Tentar de novo
              </button>
              {askLink && <WhatsLink href={askLink} />}
            </Notice>
          )}

          {status === 'ready' && products.length === 0 && (
            <Notice
              title="O catálogo está sendo reabastecido"
              text="Ainda não há flores cadastradas para hoje. Chame no WhatsApp que a loja conta o que tem."
            >
              {askLink && <WhatsLink href={askLink} />}
            </Notice>
          )}

          {status === 'ready' && products.length > 0 && visible.length === 0 && (
            <Notice
              title={`Nada com “${query}”`}
              text="Tente outro nome ou veja tudo o que está disponível."
            >
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setFilter('todos')
                }}
                className="flex h-12 items-center gap-2 rounded-full border-[1.5px] border-[var(--l-ink)] px-5 font-semibold"
              >
                <X size={18} aria-hidden /> Limpar busca
              </button>
            </Notice>
          )}

          {status === 'ready' && visible.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6">
              {visible.map((p, i) => (
                <ProductTile
                  key={p.id}
                  product={p}
                  quantity={cart[p.id] ?? 0}
                  onChange={(d) => change(p, d)}
                  priority={i < 4}
                />
              ))}
            </div>
          )}
        </section>

        {/* Balcão: a sacola fica à mão no desktop. */}
        <aside className="hidden lg:block" aria-label="Sacola">
          <div className="loja-slip sticky top-[88px] rounded-[10px] border border-[var(--l-line)] p-5 shadow-[var(--l-shadow)]">
            <div className="flex items-baseline justify-between">
              <h2 className="loja-hand text-[26px] leading-none">Sua sacola</h2>
              <span className="loja-stamp text-[13px] text-[var(--l-ink-2)]">
                {count} {count === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <hr className="loja-perf mt-5" />
            {lines.length === 0 ? (
              <p className="py-6 text-[15px] text-[var(--l-ink-2)]">
                Toque em Adicionar nas flores que quiser. O pedido só é enviado quando você confirmar.
              </p>
            ) : (
              <div className="max-h-[46vh] overflow-y-auto pr-1 pt-1">
                <BagLines lines={lines} onChange={changeById} />
              </div>
            )}
            <hr className="loja-perf" />
            <div className="flex items-baseline justify-between pt-4">
              <span className="loja-stamp text-[13px] text-[var(--l-ink-2)]">Total dos itens</span>
              <span className="loja-hand text-[26px] leading-none">{formatCurrency(total)}</span>
            </div>
            <button
              type="button"
              disabled={count === 0}
              onClick={() => setSheetOpen(true)}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--l-action)] font-semibold text-[var(--l-on-action)] transition-colors hover:bg-[var(--l-action-hover)] disabled:cursor-not-allowed disabled:bg-[var(--l-ground-2)] disabled:text-[var(--l-ink-2)]"
            >
              Fechar pedido <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </aside>
      </main>

      <footer className="border-t border-[var(--l-line)]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-1 px-4 py-8 pb-32 text-[14px] text-[var(--l-ink-2)] sm:px-8 lg:pb-8">
          <p>
            Preços e disponibilidade do estoque da loja agora. Fotos ilustrativas: cada arranjo é
            montado na hora e pode variar um pouco.
          </p>
          <p>
            {STORE.name} · {STORE.city}
          </p>
        </div>
      </footer>

      {/* Sacola no polegar (celular e tablet). */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mx-auto flex h-16 w-full max-w-[560px] items-center gap-3 rounded-full bg-[var(--l-action)] pl-3 pr-5 text-[var(--l-on-action)] shadow-[0_14px_30px_-12px_rgba(110,12,50,0.75)] active:translate-y-px"
          >
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
              <ShoppingBag size={22} aria-hidden />
              <span
                key={bump}
                className="loja-bump absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--l-kraft)] px-1.5 text-[13px] font-bold text-[var(--l-ink)]"
              >
                {count}
              </span>
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[16px] font-semibold">Ver pedido</span>
              <span className="text-[13px] opacity-85">{formatCurrency(total)}</span>
            </span>
            <ArrowRight size={20} aria-hidden className="ml-auto" />
          </button>
        </div>
      )}

      <OrderSheet
        open={sheetOpen}
        lines={lines}
        order={order}
        storeName={STORE.name}
        storeWhatsapp={STORE.whatsapp}
        onOrderChange={setOrder}
        onQuantityChange={changeById}
        onClose={closeSheet}
        onSent={onSent}
      />
    </div>
  )
}

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start py-10">
      <p className="loja-hand text-[30px] leading-tight">{title}</p>
      <p className="mt-2 max-w-[44ch] text-[var(--l-ink-2)]">{text}</p>
      <div className="mt-6 flex flex-wrap gap-3">{children}</div>
    </div>
  )
}

function WhatsLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="flex h-12 items-center gap-2 rounded-full bg-[var(--l-action)] px-5 font-semibold text-[var(--l-on-action)] hover:bg-[var(--l-action-hover)]"
    >
      <MessageCircle size={18} aria-hidden /> Chamar no WhatsApp
    </a>
  )
}

