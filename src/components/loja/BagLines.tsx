import { Flower2, Minus, Plus } from 'lucide-react'
import type { CartLine } from '../../lib/storefront'
import { formatCurrency } from '../../lib/storefrontFormat'

interface Props {
  lines: CartLine[]
  onChange: (productId: string, delta: number) => void
}

/** Linhas da sacola, iguais na lateral (desktop) e no talão de pedido. */
export function BagLines({ lines, onChange }: Props) {
  return (
    <ul className="divide-y divide-[var(--l-line)]">
      {lines.map(({ product, quantity, subtotal }) => (
        <li key={product.id} className="flex items-center gap-3 py-3">
          <div className="h-14 w-12 shrink-0 overflow-hidden rounded-[4px] bg-[var(--l-ground-2)]">
            {product.photo_url ? (
              <img src={product.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--l-kraft-dark)]">
                <Flower2 size={20} aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{product.name}</p>
            <p className="text-[13px] text-[var(--l-ink-2)]">{formatCurrency(subtotal)}</p>
          </div>
          <div className="flex shrink-0 items-center rounded-full border-[1.5px] border-[var(--l-line-strong)]">
            <button
              type="button"
              onClick={() => onChange(product.id, -1)}
              aria-label={`Tirar um ${product.name}`}
              className="flex h-11 w-10 items-center justify-center rounded-l-full text-[var(--l-ink)] hover:bg-[var(--l-ground)]"
            >
              <Minus size={16} strokeWidth={2.4} aria-hidden />
            </button>
            <span className="w-6 text-center text-[15px] font-semibold" aria-label={`${quantity} unidades`}>
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => onChange(product.id, 1)}
              disabled={quantity >= product.available}
              aria-label={`Mais um ${product.name}`}
              className="flex h-11 w-10 items-center justify-center rounded-r-full text-[var(--l-ink)] hover:bg-[var(--l-ground)] disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <Plus size={16} strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
