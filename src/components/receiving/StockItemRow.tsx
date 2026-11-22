import { useEffect, useState } from 'react'
import { Scissors, Pencil, ScanLine } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { OriginBadge } from './OriginBadge'
import { ConditionBadge } from './ConditionBadge'
import { getBestReferencePrice, compareToReference, type ReferenceComparison } from '../../lib/catalog'
import { stockItemDisplayName } from '../../lib/stockItems'
import {
  daysUntilExpiry,
  displayCurrencyValue,
  expiryDateToMonth,
  formatCurrency,
  maskCurrencyInput,
  monthToExpiryDate,
} from '../../lib/format'
import type { StockItem, StockItemCondition } from '../../lib/types'

const EXPIRY_WARNING_DAYS = 30

function expiryClassName(expiryDate: string | null): string {
  if (!expiryDate) return 'text-ink'
  const daysLeft = daysUntilExpiry(expiryDate)
  if (daysLeft < 0) return 'font-medium text-danger'
  if (daysLeft <= EXPIRY_WARNING_DAYS) return 'font-medium text-warning'
  return 'text-ink'
}

/** Plano B do preço de referência (CLAUDE.md decisão #23): mesma
 * precedência Cosmos > anotado > sem referência usada no card do
 * recebimento, aqui na conferência do lote. */
const COMPARISON_CLASS: Record<ReferenceComparison, string> = {
  below: 'text-success',
  near: 'text-warning',
  above: 'text-danger',
}

function ReferenceCell({ item }: { item: StockItem }) {
  const catalog = item.product_catalog
  if (!catalog) return <span className="text-ink-soft">—</span>

  const reference = getBestReferencePrice(catalog)
  if (!reference) return <span className="text-ink-soft">—</span>

  const comparison = compareToReference(item.sale_price, reference.value)
  return (
    <span className={`font-medium ${COMPARISON_CLASS[comparison]}`}>
      {formatCurrency(reference.value)}
      <span className="ml-1 text-xs font-normal text-ink-soft">
        ({reference.source === 'cosmos' ? 'Cosmos' : 'anotado'})
      </span>
    </span>
  )
}

const CONDITIONS: { value: StockItemCondition; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'caixa_aberta', label: 'Caixa aberta' },
  { value: 'avaria', label: 'Avaria' },
  { value: 'usado', label: 'Usado' },
]

interface StockItemRowProps {
  item: StockItem
  disabled?: boolean
  onUpdate: (
    id: string,
    patch: Partial<Pick<StockItem, 'sale_price' | 'condition' | 'quantity' | 'expiry_date' | 'nickname'>>,
  ) => void
  onSplit: (item: StockItem) => void
  /** Custo rateado só pro dono (decisão #68): ele é derivado do valor pago no
   * lote, então mostrá-lo entregaria quanto o lote custou. */
  showCost?: boolean
}

export function StockItemRow({ item, disabled, onUpdate, onSplit, showCost = false }: StockItemRowProps) {
  const [salePrice, setSalePrice] = useState(String(item.sale_price))
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState(item.nickname ?? '')

  useEffect(() => setSalePrice(String(item.sale_price)), [item.sale_price])
  useEffect(() => setQuantity(String(item.quantity)), [item.quantity])

  function commitNickname() {
    const value = nicknameDraft.trim()
    onUpdate(item.id, { nickname: value || null })
    setEditingNickname(false)
  }

  function removeNickname() {
    onUpdate(item.id, { nickname: null })
  }

  function commitSalePrice() {
    const value = Number(salePrice)
    if (!Number.isNaN(value) && value >= 0 && value !== item.sale_price) {
      onUpdate(item.id, { sale_price: value })
    } else {
      setSalePrice(String(item.sale_price))
    }
  }

  function commitQuantity() {
    const value = Number(quantity)
    if (Number.isInteger(value) && value >= item.quantity_sold && value !== item.quantity) {
      onUpdate(item.id, { quantity: value })
    } else {
      setQuantity(String(item.quantity))
    }
  }

  return (
    <div className="rounded-panel glass p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold text-ink">{stockItemDisplayName(item)}</span>
        {item.nickname && (
          <Badge tone="primary">apelido</Badge>
        )}
        <OriginBadge origin={item.product_catalog?.origin ?? null} source={item.product_catalog?.source} />
        <ConditionBadge condition={item.condition} />
      </div>
      {item.nickname && (
        <div className="text-xs text-ink-soft">Catálogo: {item.product_catalog?.name ?? '-'}</div>
      )}
      <div className="font-mono text-xs tabular-nums text-ink-soft">
        {item.product_catalog?.ean ?? item.internal_code}
      </div>
      {item.product_catalog?.ncm_pending && (
        <div className="mt-1 text-xs font-bold text-warning">Sem NCM — falar com o contador</div>
      )}
      {!editingNickname && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setNicknameDraft(item.nickname ?? '')
            setEditingNickname(true)
          }}
          className="mt-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-border bg-field px-3 text-xs font-bold text-primary hover:bg-surface-raised disabled:opacity-40"
        >
          <Pencil size={13} />
          {item.nickname ? 'Editar apelido' : 'Definir apelido'}
        </button>
      )}
      {editingNickname && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            autoFocus
            placeholder="ex.: caixa amassada, unidade 4…"
            value={nicknameDraft}
            onChange={(e) => setNicknameDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitNickname()}
            className="w-40 field field-sm border-primary"
          />
          <Button size="sm" onClick={commitNickname}>
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingNickname(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {item.nickname && !editingNickname && (
        <button
          type="button"
          onClick={removeNickname}
          className="mt-1 block text-xs text-ink-soft underline decoration-border underline-offset-2 hover:text-danger"
        >
          Remover apelido
        </button>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Condição</div>
          <select
            value={item.condition ?? 'novo'}
            disabled={disabled}
            onChange={(e) => onUpdate(item.id, { condition: e.target.value as StockItemCondition })}
            className="w-full field field-sm"
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Qtd</div>
          <input
            type="number"
            min={item.quantity_sold}
            disabled={disabled}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={commitQuantity}
            className="w-full field field-sm"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Preço venda</div>
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={displayCurrencyValue(salePrice)}
            onChange={(e) => setSalePrice(maskCurrencyInput(e.target.value))}
            onBlur={commitSalePrice}
            className="w-full field field-sm"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Validade</div>
          <input
            type="month"
            disabled={disabled}
            value={expiryDateToMonth(item.expiry_date)}
            onChange={(e) =>
              onUpdate(item.id, { expiry_date: e.target.value ? monthToExpiryDate(e.target.value) : null })
            }
            className={`w-full field field-sm ${expiryClassName(item.expiry_date)}`}
          />
        </div>
        {showCost && (
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Custo rateado</div>
            <div data-testid="allocated-cost" className="py-2 text-sm font-bold tabular-nums text-ink">
              {formatCurrency(item.allocated_cost)}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Referência</div>
          <div className="py-2 text-sm tabular-nums">
            <ReferenceCell item={item} />
          </div>
        </div>
      </div>

      {item.quantity > 1 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSplit(item)}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-field px-3 text-xs font-bold text-ink-secondary hover:bg-surface-raised hover:text-ink disabled:opacity-40"
        >
          <Scissors size={14} />
          Separar unidade
        </button>
      )}
    </div>
  )
}

export function StockItemsTable({
  items,
  disabled,
  onUpdate,
  onSplit,
  showCost = false,
}: {
  items: StockItem[]
  disabled?: boolean
  onUpdate: StockItemRowProps['onUpdate']
  onSplit: StockItemRowProps['onSplit']
  showCost?: boolean
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ScanLine size={22} />}
        title="Nenhum item bipado ainda."
        description="Bipe um código acima ou use “Sem código” pra peça sem etiqueta."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <StockItemRow
          key={item.id}
          item={item}
          disabled={disabled}
          onUpdate={onUpdate}
          onSplit={onSplit}
          showCost={showCost}
        />
      ))}
    </div>
  )
}
