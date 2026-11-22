import { useEffect, useState } from 'react'
import { Flower2, Minus, Plus } from 'lucide-react'
import { categoryLabel, categorize, type CatalogProduct } from '../../lib/storefront'
import { formatTagPrice } from '../../lib/storefrontFormat'

interface Props {
  product: CatalogProduct
  quantity: number
  onChange: (delta: number) => void
  priority?: boolean
}

export function PriceTag({ price, swing, size = 'md' }: { price: number; swing?: number; size?: 'md' | 'lg' }) {
  const { whole, cents } = formatTagPrice(price)
  const [swinging, setSwinging] = useState(false)
  useEffect(() => {
    if (!swing) return
    setSwinging(true)
    const t = window.setTimeout(() => setSwinging(false), 950)
    return () => window.clearTimeout(t)
  }, [swing])
  return (
    <span className="loja-tag" data-swing={swinging} aria-label={`Preço: R$ ${whole}${cents ? `,${cents}` : ''}`}>
      <span aria-hidden className={size === 'lg' ? 'text-[15px]' : 'text-[13px]'}>R$</span>
      <span aria-hidden className={size === 'lg' ? 'text-[30px]' : 'text-[24px]'}>{whole}</span>
      {cents && (
        <span aria-hidden className={`self-start ${size === 'lg' ? 'text-[15px]' : 'text-[13px]'} mt-0.5`}>
          ,{cents}
        </span>
      )}
    </span>
  )
}

export function ProductTile({ product, quantity, onChange, priority }: Props) {
  const [swing, setSwing] = useState(0)
  const [imgFailed, setImgFailed] = useState(false)
  const full = quantity >= product.available
  const showPhoto = product.photo_url && !imgFailed

  function add() {
    onChange(1)
    setSwing((n) => n + 1)
  }

  return (
    <article className="group flex flex-col" aria-label={product.name}>
      <div className="relative">
        <div className="aspect-[4/5] overflow-hidden rounded-[6px] bg-[var(--l-ground-2)]">
          {showPhoto ? (
            <img
              src={product.photo_url!}
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--l-kraft-dark)]">
              <Flower2 size={44} strokeWidth={1.4} aria-hidden />
            </div>
          )}
        </div>
        <div className="absolute -bottom-3 left-2">
          <PriceTag price={product.price} swing={swing} />
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-6">
        <span className="loja-stamp text-[12px] text-[var(--l-ink-2)]">
          {categoryLabel(categorize(product.name))}
        </span>
        <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--l-ink)] sm:text-base">
          {product.name}
        </h3>
        {product.available <= 2 && (
          <p className="mt-1 text-[13px] font-medium text-[var(--l-leaf)]">
            {product.available === 1 ? 'Só 1 disponível' : 'Só 2 disponíveis'}
          </p>
        )}

        <div className="mt-auto pt-3">
          {quantity === 0 ? (
            <button
              type="button"
              onClick={add}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--l-action)] px-4 text-[15px] font-semibold text-[var(--l-on-action)] transition-colors hover:bg-[var(--l-action-hover)] active:translate-y-px"
            >
              <Plus size={18} strokeWidth={2.4} aria-hidden />
              Adicionar
            </button>
          ) : (
            <div className="flex h-11 items-center justify-between rounded-full border-[1.5px] border-[var(--l-action)] bg-[var(--l-action-tint)] px-1">
              <button
                type="button"
                onClick={() => onChange(-1)}
                aria-label={`Tirar um ${product.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--l-action)] hover:bg-white"
              >
                <Minus size={18} strokeWidth={2.4} aria-hidden />
              </button>
              <span className="text-[15px] font-semibold text-[var(--l-ink)]" aria-live="polite">
                {quantity} na sacola
              </span>
              <button
                type="button"
                onClick={add}
                disabled={full}
                aria-label={`Mais um ${product.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--l-action)] hover:bg-white disabled:cursor-not-allowed disabled:text-[var(--l-ink-2)] disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Plus size={18} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export function ProductTileSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col">
      <div className="aspect-[4/5] rounded-[6px] bg-[var(--l-ground-2)]" />
      <div className="mt-6 h-3 w-16 rounded bg-[var(--l-ground-2)]" />
      <div className="mt-2 h-4 w-4/5 rounded bg-[var(--l-ground-2)]" />
      <div className="mt-4 h-11 rounded-full bg-[var(--l-ground-2)]" />
    </div>
  )
}
