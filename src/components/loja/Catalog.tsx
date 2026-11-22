import { useMemo, type ReactNode } from 'react'
import { ArrowRight, MessageCircle, RefreshCw, Search, X } from 'lucide-react'
import {
  CATEGORIES,
  categorize,
  type Cart,
  type CartLine,
  type CatalogProduct,
  type CategoryId,
} from '../../lib/storefront'
import { formatCurrency, normalizeText } from '../../lib/storefrontFormat'
import { BagLines } from './BagLines'
import { ProductTile, ProductTileSkeleton } from './ProductTile'

export type Filter = CategoryId | 'todos'
export type CatalogStatus = 'loading' | 'ready' | 'error'

interface Props {
  products: CatalogProduct[]
  status: CatalogStatus
  cart: Cart
  lines: CartLine[]
  count: number
  total: number
  filter: Filter
  query: string
  askLink: string
  onFilter: (f: Filter) => void
  onQuery: (q: string) => void
  onChange: (product: CatalogProduct, delta: number) => void
  onChangeById: (id: string, delta: number) => void
  onRetry: () => void
  onOpenOrder: () => void
}

export function Catalog({
  products,
  status,
  cart,
  lines,
  count,
  total,
  filter,
  query,
  askLink,
  onFilter,
  onQuery,
  onChange,
  onChangeById,
  onRetry,
  onOpenOrder,
}: Props) {
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

  return (
    <>
      <header className="mx-auto max-w-[1240px] px-4 pb-8 pt-10 sm:px-8 sm:pt-14">
        <h1 className="loja-display text-[72px] sm:text-[120px]">Catálogo</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-ink-2)]">
          {status === 'ready' && products.length > 0
            ? `${products.length} ${products.length === 1 ? 'opção' : 'opções'} no estoque agora. `
            : ''}
          Ponha na sacola o que quiser e mande o pedido no WhatsApp: a loja confirma, combina o
          pagamento e entrega.
        </p>
      </header>

      <div className="sticky top-[64px] z-30 border-y border-[var(--l-line)] bg-[color-mix(in_srgb,var(--l-ground)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-8">
          <label className="relative block sm:w-72 sm:shrink-0">
            <span className="sr-only">Buscar no catálogo</span>
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--l-ink-2)]"
            />
            <input
              id="loja-busca"
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
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
                      onClick={() => onFilter(f.id)}
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
        <section aria-label="Produtos">
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
                onClick={onRetry}
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
            <Notice title={`Nada com “${query}”`} text="Tente outro nome ou veja tudo o que está disponível.">
              <button
                type="button"
                onClick={() => {
                  onQuery('')
                  onFilter('todos')
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
                  onChange={(d) => onChange(p, d)}
                  priority={i < 4}
                />
              ))}
            </div>
          )}
        </section>

        {/* Balcão: a sacola fica à mão no desktop. */}
        <aside className="hidden lg:block" aria-label="Sacola">
          <div className="loja-slip sticky top-[150px] rounded-[10px] border border-[var(--l-line)] p-5 shadow-[var(--l-shadow)]">
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
                <BagLines lines={lines} onChange={onChangeById} />
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
              onClick={onOpenOrder}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--l-action)] font-semibold text-[var(--l-on-action)] transition-colors hover:bg-[var(--l-action-hover)] disabled:cursor-not-allowed disabled:bg-[var(--l-ground-2)] disabled:text-[var(--l-ink-2)]"
            >
              Fechar pedido <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </aside>
      </main>
    </>
  )
}

function Notice({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start py-10">
      <p className="loja-hand text-[30px] leading-tight">{title}</p>
      <p className="mt-2 max-w-[44ch] text-[var(--l-ink-2)]">{text}</p>
      <div className="mt-6 flex flex-wrap gap-3">{children}</div>
    </div>
  )
}

export function WhatsLink({ href, label = 'Chamar no WhatsApp' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="flex h-12 items-center gap-2 rounded-full bg-[var(--l-action)] px-5 font-semibold text-[var(--l-on-action)] hover:bg-[var(--l-action-hover)]"
    >
      <MessageCircle size={18} aria-hidden /> {label}
    </a>
  )
}
