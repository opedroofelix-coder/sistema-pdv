import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, AtSign, Flower2, MessageCircle, Plus, ShoppingBag } from 'lucide-react'
import { categorize, type Cart, type CatalogProduct } from '../../lib/storefront'
import { PriceTag, ProductTile } from './ProductTile'
import type { CatalogStatus, Filter } from './Catalog'

interface Props {
  products: CatalogProduct[]
  status: CatalogStatus
  cart: Cart
  storeName: string
  city: string
  instagram: string
  askLink: string
  cardMessage: string
  onCardMessage: (text: string) => void
  onChange: (product: CatalogProduct, delta: number) => void
  onCatalog: (filter?: Filter) => void
  onOpenOrder: () => void
}

const CARD_LIMIT = 200
const RIBBON = ['Buquês', 'Cestas', 'Chocolates', 'Arranjos', 'Plantas', 'Entrega em Jandira', 'Retirada na loja']

/**
 * Página de entrada da vitrine. O herói é um produto do estoque de verdade,
 * embrulhado em kraft; o papel abre conforme a página rola.
 */
export function Landing(props: Props) {
  const { products, status, cart, onChange, onCatalog } = props

  const withPhoto = useMemo(() => products.filter((p) => p.photo_url), [products])
  const featured = useMemo(
    () => withPhoto.find((p) => categorize(p.name) === 'buques') ?? withPhoto[0] ?? null,
    [withPhoto],
  )
  const shelf = useMemo(() => {
    const rest = products.filter((p) => p.id !== featured?.id)
    return [...rest.filter((p) => p.photo_url), ...rest.filter((p) => !p.photo_url)].slice(0, 8)
  }, [products, featured])

  return (
    <>
      <Hero {...props} featured={featured} />
      <Ribbon />

      {/* Hoje no balde: o estoque de agora, na câmara fria. */}
      <section className="bg-[var(--l-night)] text-[var(--l-on-night)]" aria-labelledby="loja-hoje">
        <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-20 sm:px-8 sm:pb-24 sm:pt-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="relative">
              <h2 id="loja-hoje" className="loja-display text-[64px] sm:text-[128px]">
                Hoje no
                <br />
                balde
              </h2>
              <p className="loja-hand absolute -right-4 bottom-2 translate-x-full rotate-[-6deg] text-[22px] text-[var(--l-kraft)] max-sm:static max-sm:mt-3 max-sm:translate-x-0">
                o que tem no estoque agora
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCatalog()}
              className="group flex h-12 items-center gap-2 rounded-full border-[1.5px] border-[var(--l-on-night-2)] px-5 font-semibold text-[var(--l-on-night)] transition-colors hover:border-[var(--l-on-night)] hover:bg-[var(--l-night-2)]"
            >
              Ver catálogo completo
              <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {status === 'loading' && (
            <div className="mt-12 flex gap-5 overflow-hidden" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-[4/5] w-[62vw] max-w-[260px] shrink-0 animate-pulse rounded-[6px] bg-[var(--l-night-2)]" />
              ))}
            </div>
          )}

          {status !== 'loading' && shelf.length === 0 && (
            <p className="mt-10 max-w-[44ch] text-[17px] text-[var(--l-on-night-2)]">
              O balde está sendo reabastecido. Chame no WhatsApp que a loja conta o que tem hoje.
            </p>
          )}

          {shelf.length > 0 && (
            <div className="loja-hscroll -mx-4 mt-12 flex gap-5 overflow-x-auto px-4 pb-6 sm:-mx-8 sm:gap-7 sm:px-8">
              {shelf.map((p, i) => (
                <div key={p.id} className="w-[62vw] max-w-[260px] shrink-0">
                  <ProductTile product={p} quantity={cart[p.id] ?? 0} onChange={(d) => onChange(p, d)} night priority={i < 2} />
                </div>
              ))}
              <button
                type="button"
                onClick={() => onCatalog()}
                className="group flex aspect-[4/5] w-[62vw] max-w-[260px] shrink-0 flex-col justify-between rounded-[6px] border-[1.5px] border-dashed border-[var(--l-on-night-2)] p-6 text-left hover:border-[var(--l-on-night)]"
              >
                <Flower2 size={36} strokeWidth={1.4} aria-hidden className="text-[var(--l-kraft)]" />
                <span>
                  <span className="loja-display block text-[44px]">Ver tudo</span>
                  <span className="mt-2 flex items-center gap-1 text-[15px] text-[var(--l-on-night-2)]">
                    {products.length} opções no catálogo
                    <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1" />
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
      </section>

      <HowItWorks />
      <CardSection {...props} />
      <About {...props} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Herói
// ---------------------------------------------------------------------------

function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    function update() {
      frame = 0
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 com o buquê inteiro na tela; 1 quando ele já subiu ~70% da altura.
      const p = (vh - rect.bottom) / (rect.height * 0.7) + 0.15
      setProgress(Math.min(1, Math.max(0, p)))
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref])
  return progress
}

function Hero({
  featured,
  cart,
  storeName,
  city,
  askLink,
  onChange,
  onCatalog,
  onOpenOrder,
}: Props & { featured: CatalogProduct | null }) {
  return (
    <section className="relative overflow-hidden" aria-labelledby="loja-titulo">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14 lg:pb-28">
        <div className="relative min-w-0">
          <h1 id="loja-titulo" className="loja-display text-[clamp(52px,16.5vw,92px)] text-[var(--l-ink)] lg:text-[clamp(80px,8.4vw,128px)]">
            Flores pra
            <br />
            dizer o que
            <br />
            <span className="relative inline-block">
              falta dizer
              <span className="loja-hand absolute -bottom-9 right-0 rotate-[-5deg] whitespace-nowrap text-[clamp(20px,2.6vw,30px)] normal-case tracking-normal text-[var(--l-action)] sm:-bottom-11">
                + o seu recado no cartão
              </span>
            </span>
          </h1>
          <p className="mt-16 max-w-[44ch] text-[18px] leading-relaxed text-[var(--l-ink-2)] sm:text-[20px]">
            Buquês, cestas e chocolates da {storeName}, floricultura de família em {city}. Escolha no
            catálogo, mande o pedido no WhatsApp e a gente monta e entrega.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onCatalog()}
              className="group flex h-14 items-center gap-2 rounded-full bg-[var(--l-action)] px-7 text-[17px] font-semibold text-[var(--l-on-action)] shadow-[0_14px_28px_-14px_rgba(163,21,76,0.9)] transition-colors hover:bg-[var(--l-action-hover)]"
            >
              Ver o catálogo
              <ArrowRight size={20} aria-hidden className="transition-transform group-hover:translate-x-1" />
            </button>
            {askLink && (
              <a
                href={askLink}
                target="_blank"
                rel="noopener"
                className="flex h-14 items-center gap-2 rounded-full border-[1.5px] border-[var(--l-ink)] px-6 text-[17px] font-semibold text-[var(--l-ink)] hover:bg-[var(--l-ground-2)]"
              >
                <MessageCircle size={20} aria-hidden /> Falar no WhatsApp
              </a>
            )}
          </div>
          <ul className="loja-stamp mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[var(--l-ink-2)]">
            <li>Entrega ou retirada</li>
            <li>Pix, cartão ou dinheiro</li>
            <li>Pedido confirmado no WhatsApp</li>
          </ul>
        </div>

        {featured ? (
          <WrappedBouquet product={featured} quantity={cart[featured.id] ?? 0} onChange={onChange} onOpenOrder={onOpenOrder} />
        ) : (
          <div className="loja-kraft-paper hidden aspect-[5/7] items-center justify-center rounded-[4px] lg:flex" aria-hidden>
            <Flower2 size={96} strokeWidth={1} className="text-[var(--l-kraft-dark)]" />
          </div>
        )}
      </div>
    </section>
  )
}

/** Foto do produto embrulhada em kraft. O papel cai conforme a página rola. */
function WrappedBouquet({
  product,
  quantity,
  onChange,
  onOpenOrder,
}: {
  product: CatalogProduct
  quantity: number
  onChange: (product: CatalogProduct, delta: number) => void
  onOpenOrder: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const p = useScrollProgress(ref)
  const [swing, setSwing] = useState(0)
  const ease = 1 - Math.pow(1 - p, 3)

  return (
    <figure className="relative mx-auto w-full min-w-0 max-w-[460px] lg:max-w-[500px]">
      <div ref={ref} className="relative aspect-[5/7] w-full">
        <div className="absolute inset-0 overflow-hidden rounded-t-[999px]">
          <img
            src={product.photo_url!}
            alt={product.name}
            fetchPriority="high"
            className="h-full w-full object-cover"
            style={{ transform: `scale(${1.06 - ease * 0.06})` }}
          />
        </div>
        {/* Cantos fora do cone: da cor do chão, somem quando o papel cai. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[var(--l-ground)]"
          style={{
            clipPath: 'polygon(0 58%, 50% 100%, 0 100%)',
            opacity: 1 - ease,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[var(--l-ground)]"
          style={{
            clipPath: 'polygon(100% 58%, 100% 100%, 50% 100%)',
            opacity: 1 - ease,
          }}
        />
        {/* Abas de kraft. */}
        <div
          aria-hidden
          className="loja-kraft-paper absolute inset-0 origin-[50%_100%] drop-shadow-[0_12px_18px_rgba(60,40,15,0.35)]"
          style={{
            clipPath: 'polygon(0% 55%, 64% 66%, 50% 100%)',
            transform: `translate(${-ease * 38}%, ${ease * 22}%) rotate(${-ease * 22}deg)`,
            opacity: 1 - Math.max(0, ease - 0.7) / 0.3,
          }}
        />
        <div
          aria-hidden
          className="loja-kraft-paper absolute inset-0 origin-[50%_100%] brightness-[0.9]"
          style={{
            clipPath: 'polygon(100% 53%, 36% 68%, 50% 100%)',
            transform: `translate(${ease * 38}%, ${ease * 22}%) rotate(${ease * 22}deg)`,
            opacity: 1 - Math.max(0, ease - 0.7) / 0.3,
          }}
        />
        {/* Barbante. */}
        <svg
          aria-hidden
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ opacity: 1 - ease * 1.6 }}
        >
          <path d="M37 112 Q50 116 63 111" fill="none" stroke="#6b4a22" strokeWidth="0.9" />
          <path d="M50 115 q-7 6 -9 13 M50 115 q5 7 4 15" fill="none" stroke="#6b4a22" strokeWidth="0.7" />
        </svg>
        {/* Etiqueta pendurada no barbante. */}
        <div className="absolute left-[56%] top-[80%]" style={{ transform: `translateY(${ease * 40}px)` }}>
          <PriceTag price={product.price} swing={swing} size="lg" />
        </div>
      </div>
      <figcaption className="mt-6 flex items-center justify-between gap-4">
        <span className="min-w-0">
          <span className="loja-stamp block text-[13px] text-[var(--l-ink-2)]">Do estoque de hoje</span>
          <span className="block truncate text-[17px] font-semibold">{product.name}</span>
        </span>
        {quantity === 0 ? (
          <button
            type="button"
            onClick={() => {
              onChange(product, 1)
              setSwing((n) => n + 1)
            }}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-[var(--l-ink)] px-5 font-semibold text-[var(--l-paper)] hover:bg-black"
          >
            <Plus size={18} strokeWidth={2.4} aria-hidden /> Adicionar
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenOrder}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[var(--l-action)] bg-[var(--l-action-tint)] px-5 font-semibold text-[var(--l-action)]"
          >
            <ShoppingBag size={18} aria-hidden /> Na sacola · ver pedido
          </button>
        )}
      </figcaption>
    </figure>
  )
}

function Ribbon() {
  const words = [...RIBBON, ...RIBBON]
  return (
    <div className="relative z-10 -my-6 rotate-[-2deg] overflow-hidden py-0" aria-hidden>
      <div className="loja-ribbon -mx-8 py-4">
        <div className="loja-ribbon-track">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 items-center">
              {words.map((w, i) => (
                <span key={`${k}-${i}`} className="loja-stamp flex items-center gap-6 pr-6 text-[22px] sm:text-[26px]">
                  {w}
                  <Flower2 size={20} strokeWidth={1.8} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Como funciona: o próprio talão de pedido, com picote entre as etapas.
// ---------------------------------------------------------------------------

const STEPS = [
  {
    title: 'Escolha',
    text: 'Veja o que tem no estoque hoje e ponha na sacola. Preço e foto do nosso balcão, sem surpresa.',
  },
  {
    title: 'Mande no WhatsApp',
    text: 'Conte quem recebe, o dia, o recado do cartão e como vai pagar. O resumo chega pronto pra loja.',
  },
  {
    title: 'A gente monta',
    text: 'A loja confirma por mensagem, combina o pagamento e a taxa de entrega, monta e entrega ou separa pra retirada.',
  },
]

function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-20 sm:px-8 sm:py-28" aria-labelledby="loja-como">
      <h2 id="loja-como" className="loja-display text-[56px] sm:text-[96px]">
        Como pedir
      </h2>
      <ol className="loja-slip mt-10 grid rounded-[6px] shadow-[var(--l-shadow)] md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className={`relative p-7 sm:p-9 ${
              i > 0 ? 'border-t-2 border-dashed border-[var(--l-line-strong)] md:border-l-2 md:border-t-0' : ''
            }`}
          >
            <span className="loja-display block text-[88px] text-[var(--l-kraft-dark)]" aria-hidden>
              {i + 1}
            </span>
            <h3 className="loja-hand mt-3 text-[28px] leading-tight">{step.title}</h3>
            <p className="mt-2 max-w-[34ch] text-[16px] leading-relaxed text-[var(--l-ink-2)]">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Comece pelo recado: o cartão que vai preso no buquê.
// ---------------------------------------------------------------------------

function CardSection({ cardMessage, onCardMessage, onCatalog, storeName }: Props) {
  return (
    <section className="loja-kraft-paper relative overflow-hidden" aria-labelledby="loja-recado">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 id="loja-recado" className="loja-display text-[56px] text-[var(--l-ink)] sm:text-[96px]">
            Comece
            <br />
            pelo recado
          </h2>
          <p className="mt-6 max-w-[40ch] text-[18px] leading-relaxed text-[#3d3423]">
            Às vezes o difícil não é a flor, é o que escrever. Escreva aqui o cartão; ele segue com o seu
            pedido e a {storeName} prende no buquê.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[520px]">
          <div className="loja-giftcard relative rotate-[2.5deg] rounded-[4px] p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="loja-stamp text-[13px] text-[var(--l-ink-2)]">Cartão · {storeName}</span>
              <Flower2 size={22} strokeWidth={1.6} aria-hidden className="text-[var(--l-action)]" />
            </div>
            <label htmlFor="loja-recado-texto" className="sr-only">
              Mensagem do cartão
            </label>
            <textarea
              id="loja-recado-texto"
              value={cardMessage}
              maxLength={CARD_LIMIT}
              onChange={(e) => onCardMessage(e.target.value)}
              placeholder="Feliz aniversário, mãe! Obrigada por tudo."
              rows={5}
              className="loja-card-text mt-4 w-full resize-none border-0 bg-transparent p-0 text-[24px] text-[var(--l-ink)] outline-none placeholder:text-[#9a948a] focus-visible:outline-none"
            />
            <div className="mt-3 flex items-center justify-between text-[13px] text-[var(--l-ink-2)]">
              <span>Opcional</span>
              <span>
                {cardMessage.length}/{CARD_LIMIT}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onCatalog()}
            className="group relative mx-auto mt-8 flex h-14 items-center gap-2 rounded-full bg-[var(--l-action)] px-7 text-[17px] font-semibold text-[var(--l-on-action)] shadow-[0_14px_28px_-14px_rgba(110,12,50,0.9)] hover:bg-[var(--l-action-hover)]"
          >
            {cardMessage.trim() ? 'Agora, escolher as flores' : 'Escolher as flores'}
            <ArrowRight size={20} aria-hidden className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Sobre + rodapé
// ---------------------------------------------------------------------------

function About({ storeName, city, instagram, askLink, onCatalog, products }: Props) {
  const photos = products.filter((p) => p.photo_url).slice(1, 3)
  return (
    <section className="bg-[var(--l-night)] text-[var(--l-on-night)]" aria-labelledby="loja-sobre">
      <div className="mx-auto grid max-w-[1240px] gap-14 px-4 pb-10 pt-20 sm:px-8 sm:pt-28 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 id="loja-sobre" className="loja-display text-[56px] sm:text-[96px]">
            Floricultura
            <br />
            de família
          </h2>
          <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-[var(--l-on-night-2)]">
            A {storeName} nasceu de uma família de floristas e atende {city} há cerca de 30 anos, hoje
            com duas lojas. Do aniversário à despedida, o buquê sai da nossa bancada.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={instagram}
              target="_blank"
              rel="noopener"
              className="flex h-12 items-center gap-2 rounded-full border-[1.5px] border-[var(--l-on-night-2)] px-5 font-semibold hover:border-[var(--l-on-night)]"
            >
              <AtSign size={18} aria-hidden /> Instagram <ArrowUpRight size={16} aria-hidden />
            </a>
            {askLink && (
              <a
                href={askLink}
                target="_blank"
                rel="noopener"
                className="flex h-12 items-center gap-2 rounded-full border-[1.5px] border-[var(--l-on-night-2)] px-5 font-semibold hover:border-[var(--l-on-night)]"
              >
                <MessageCircle size={18} aria-hidden /> WhatsApp <ArrowUpRight size={16} aria-hidden />
              </a>
            )}
          </div>
        </div>
        {photos.length === 2 && (
          <div className="relative hidden h-[420px] lg:block" aria-hidden>
            <img src={photos[0].photo_url!} alt="" className="absolute right-[38%] top-0 h-[300px] w-[230px] rotate-[-4deg] rounded-[4px] object-cover shadow-[0_30px_50px_-25px_rgba(0,0,0,0.8)]" loading="lazy" />
            <img src={photos[1].photo_url!} alt="" className="absolute bottom-0 right-0 h-[300px] w-[230px] rotate-[3deg] rounded-[4px] object-cover shadow-[0_30px_50px_-25px_rgba(0,0,0,0.8)]" loading="lazy" />
          </div>
        )}
      </div>

      <div className="mx-auto max-w-[1240px] overflow-hidden px-4 pt-10 sm:px-8">
        <button
          type="button"
          onClick={() => onCatalog()}
          className="loja-hand block w-full whitespace-nowrap text-left text-[clamp(64px,15.5vw,210px)] leading-[0.9] text-[var(--l-on-night)] transition-colors hover:text-[var(--l-kraft)]"
          aria-label="Abrir o catálogo"
        >
          {storeName}
        </button>
      </div>
    </section>
  )
}
