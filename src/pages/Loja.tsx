import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import {
  cartCount,
  cartLines,
  cartTotal,
  changeQuantity,
  EMPTY_ORDER,
  reconcileCart,
  whatsappLink,
  type Cart,
  type CatalogProduct,
  type OrderDetails,
} from '../lib/storefront'
import { formatCurrency } from '../lib/storefrontFormat'
import { STORE } from '../lib/storefrontConfig'
import { Catalog, type CatalogStatus, type Filter } from '../components/loja/Catalog'
import { Landing } from '../components/loja/Landing'
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

type View = 'inicio' | 'catalogo'

/** Duas abas na mesma página: /loja (início) e /loja#catalogo. */
function viewFromHash(): View {
  return window.location.hash === '#catalogo' ? 'catalogo' : 'inicio'
}

interface LojaProps {
  /** Demonstração (artefato de apresentação): o pedido mostra a mensagem em vez de abrir o WhatsApp. */
  demo?: boolean
}

export function Loja({ demo = false }: LojaProps = {}) {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [status, setStatus] = useState<CatalogStatus>('loading')
  const [cart, setCart] = useState<Cart>(() => readJson<Cart>(CART_KEY, {}))
  const [order, setOrder] = useState<OrderDetails>(() => ({
    ...EMPTY_ORDER,
    ...readJson<Partial<OrderDetails>>(CUSTOMER_KEY, {}),
  }))
  const [view, setView] = useState<View>(viewFromHash)
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
    function onHash() {
      setView(viewFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const previousTitle = document.title
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute('content')
    meta?.setAttribute('content', '#e9ebe3')
    return () => {
      document.title = previousTitle
      if (previousColor) meta?.setAttribute('content', previousColor)
    }
  }, [])

  useEffect(() => {
    document.title = view === 'catalogo' ? `Catálogo · ${STORE.name}` : `${STORE.name} · Floricultura em ${STORE.city}`
  }, [view])

  useEffect(() => writeJson(CART_KEY, cart), [cart])
  useEffect(() => {
    const { name, phone, fulfillment, address } = order
    writeJson(CUSTOMER_KEY, { name, phone, fulfillment, address })
  }, [order])

  const lines = useMemo(() => cartLines(cart, products), [cart, products])
  const count = cartCount(lines)
  const total = cartTotal(lines)

  function go(next: View) {
    // Só hash (#inicio / #catalogo): funciona igual no site e dentro de iframes.
    const hash = `#${next}`
    if (window.location.hash !== hash) window.location.hash = hash
    setView(next)
    window.scrollTo({ top: 0 })
  }

  function openCatalog(f?: Filter) {
    if (f) setFilter(f)
    go('catalogo')
  }

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
  const onSent = useCallback(() => {
    setCart({})
    setOrder((o) => ({ ...o, cardMessage: '' }))
  }, [])

  const askLink = whatsappLink(STORE.whatsapp, `Olá, ${STORE.name}! Vim pelo site e tenho uma dúvida.`)

  return (
    <div className="loja">
      <a
        href="#loja-conteudo"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('loja-conteudo')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-[var(--l-ink)] focus:px-4 focus:py-2 focus:text-[var(--l-paper)]"
      >
        Pular para o conteúdo
      </a>

      <nav
        aria-label="Principal"
        className="sticky top-0 z-40 border-b border-[var(--l-line)] bg-[color-mix(in_srgb,var(--l-ground)_88%,transparent)] backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-8">
          <button
            type="button"
            onClick={() => go('inicio')}
            className="loja-hand mr-auto whitespace-nowrap text-[24px] leading-none sm:text-[28px]"
            aria-label={`${STORE.name}, início`}
          >
            <span className="sm:hidden">Lú-Bia</span>
            <span className="hidden sm:inline">{STORE.name}</span>
          </button>
          <div className="flex rounded-full bg-[var(--l-ground-2)] p-1">
            {(
              [
                ['inicio', 'Início'],
                ['catalogo', 'Catálogo'],
              ] as const
            ).map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault()
                  go(id)
                }}
                aria-current={view === id ? 'page' : undefined}
                className={`loja-stamp flex h-10 items-center rounded-full px-4 text-[15px] transition-colors sm:px-5 ${
                  view === id ? 'bg-[var(--l-ink)] text-[var(--l-paper)]' : 'text-[var(--l-ink)] hover:bg-[var(--l-ground)]'
                }`}
              >
                {label}
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="relative flex h-11 items-center gap-2 rounded-full px-3 hover:bg-[var(--l-ground-2)]"
            aria-label={`Sacola: ${count} ${count === 1 ? 'item' : 'itens'}`}
          >
            <ShoppingBag size={22} aria-hidden />
            <span className="hidden text-[15px] font-semibold md:inline">{count > 0 ? formatCurrency(total) : 'Sacola'}</span>
            {count > 0 && (
              <span
                key={bump}
                className="loja-bump absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--l-action)] px-1 text-[12px] font-bold text-[var(--l-on-action)] md:static md:ml-0.5"
              >
                {count}
              </span>
            )}
          </button>
        </div>
      </nav>

      <div id="loja-conteudo" tabIndex={-1} className="outline-none">
        {view === 'inicio' ? (
          <Landing
            products={products}
            status={status}
            cart={cart}
            storeName={STORE.name}
            city={STORE.city}
            instagram={STORE.instagram}
            askLink={askLink}
            cardMessage={order.cardMessage}
            onCardMessage={(text) => setOrder((o) => ({ ...o, cardMessage: text }))}
            onChange={change}
            onCatalog={openCatalog}
            onOpenOrder={() => setSheetOpen(true)}
          />
        ) : (
          <Catalog
            products={products}
            status={status}
            cart={cart}
            lines={lines}
            count={count}
            total={total}
            filter={filter}
            query={query}
            askLink={askLink}
            onFilter={setFilter}
            onQuery={setQuery}
            onChange={change}
            onChangeById={changeById}
            onRetry={() => void load()}
            onOpenOrder={() => setSheetOpen(true)}
          />
        )}
      </div>

      <footer
        className={
          view === 'inicio'
            ? 'bg-[var(--l-night)] text-[var(--l-on-night-2)]'
            : 'border-t border-[var(--l-line)] text-[var(--l-ink-2)]'
        }
      >
        <div className="mx-auto flex max-w-[1240px] flex-col gap-1 px-4 py-8 pb-32 text-[14px] sm:px-8 lg:pb-8">
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
        demo={demo}
      />
    </div>
  )
}
