import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { CurrencyInput } from '../ui/CurrencyInput'
import { ConditionPicker } from './ConditionPicker'
import { ReferencePriceCard } from './ReferencePriceCard'
import { OriginBadge, NcmPendingBanner } from './OriginBadge'
import { getBestReferencePrice, compareToReference } from '../../lib/catalog'
import { formatCurrency, monthToExpiryDate } from '../../lib/format'
import type { ProductCatalog, StockItemCondition } from '../../lib/types'

const COMPARISON_LABEL: Record<ReturnType<typeof compareToReference>, string> = {
  below: 'na referência ou abaixo',
  near: 'até 15% acima da referência',
  above: 'bem acima da referência',
}
const COMPARISON_CLASS: Record<ReturnType<typeof compareToReference>, string> = {
  below: 'text-success',
  near: 'text-warning',
  above: 'text-danger',
}

interface ReceivingStepPricingProps {
  catalog: ProductCatalog
  /** Valor pago no lote (CLAUDE.md: base da regra de rateio). */
  purchaseValue: number
  /** Soma(preço venda × quantidade) de todos os itens já no lote, para
   * estimar o rateio deste item novo com a mesma fórmula do trigger no banco. */
  existingTotalSaleValue: number
  /** Média do custo rateado dos itens já no lote, só para contexto no rodapé. */
  averageAllocatedCost: number | null
  /** Margem estimada e rateio médio só pro dono (decisão #68): os dois são
   * derivados do valor pago no lote. */
  showCost?: boolean
  busy: boolean
  lastItemLabel: string | null
  onAnnotateReference: (price: number) => Promise<void>
  onConfirm: (fields: {
    condition: StockItemCondition
    quantity: number
    salePrice: number
    expiryDate: string | null
    ownPhoto: File | null
  }) => void
  onCancel: () => void
}

/** Passo 2 do recebimento (DESIGN.md seção 2): precificação. */
export function ReceivingStepPricing({
  catalog,
  purchaseValue,
  existingTotalSaleValue,
  averageAllocatedCost,
  showCost = false,
  busy,
  lastItemLabel,
  onAnnotateReference,
  onConfirm,
  onCancel,
}: ReceivingStepPricingProps) {
  const [condition, setCondition] = useState<StockItemCondition>('novo')
  const [quantity, setQuantity] = useState(1)
  const [salePrice, setSalePrice] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('')
  const [ownPhoto, setOwnPhoto] = useState<File | null>(null)

  const priceValue = Number(salePrice)
  const bestReference = getBestReferencePrice(catalog)
  const comparison =
    bestReference && !Number.isNaN(priceValue) && salePrice !== ''
      ? compareToReference(priceValue, bestReference.value)
      : null
  // Mesma fórmula do rateio (CLAUDE.md seção 1) aplicada ao lote como ficaria
  // se este item fosse confirmado agora, pra "margem estimada" refletir o
  // rateio real em vez de um valor congelado.
  const marginEstimate = (() => {
    if (Number.isNaN(priceValue) || salePrice === '') return null
    const newTotalValue = existingTotalSaleValue + priceValue * quantity
    if (newTotalValue <= 0) return null
    const estimatedAllocatedCost = (purchaseValue * priceValue) / newTotalValue
    return priceValue - estimatedAllocatedCost
  })()

  // Avaria precisa de registro fotográfico próprio (CLAUDE.md/DESIGN.md).
  const needsOwnPhoto = condition === 'avaria'
  const canConfirm =
    !busy &&
    salePrice !== '' &&
    !Number.isNaN(priceValue) &&
    priceValue >= 0 &&
    quantity >= 1 &&
    (!needsOwnPhoto || ownPhoto !== null)

  return (
    <div className="fixed inset-0 z-50 flex flex-col app-bg">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          {catalog.photo_url && (
            <img
              src={catalog.photo_url}
              alt=""
              className="h-[42px] w-[42px] rounded-xl bg-surface-secondary object-contain"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-ink">
              {catalog.name ??
                (catalog.enrichment_status === 'pending' ? 'Aguardando dados do catálogo…' : 'Sem descrição')}
            </p>
            {catalog.ean && <p className="text-xs text-ink-soft">{catalog.ean}</p>}
          </div>
          <OriginBadge origin={catalog.origin} source={catalog.source} />
        </div>

        <div className="mt-4">
          <ReferencePriceCard catalog={catalog} onAnnotate={onAnnotateReference} />
        </div>

        <div className={`mt-4 grid gap-3 ${showCost ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="flex flex-col gap-1">
            <CurrencyInput
              id="sale-price"
              label="Seu preço de venda"
              autoFocus
              className="border-2"
              value={salePrice}
              onValueChange={setSalePrice}
            />
            {comparison && (
              <p className={`text-xs font-bold ${COMPARISON_CLASS[comparison]}`}>
                {COMPARISON_LABEL[comparison]}
              </p>
            )}
          </div>
          {showCost && (
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-ink-secondary">
              Margem estimada
            </label>
            <div
              className={`flex h-12 items-center rounded-[14px] border border-border bg-surface-secondary px-3.5 text-[15px] font-bold tabular-nums ${
                marginEstimate === null
                  ? 'text-ink-soft'
                  : marginEstimate >= 0
                    ? 'text-success'
                    : 'text-danger'
              }`}
            >
              {marginEstimate === null ? '—' : formatCurrency(marginEstimate)}
            </div>
          </div>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-secondary">Condição</p>
          <ConditionPicker value={condition} onChange={setCondition} />
        </div>

        {needsOwnPhoto && (
          <label className="mt-4 flex items-center gap-2 rounded-[14px] border border-dashed border-border bg-field px-3.5 py-3 text-sm font-semibold text-ink-secondary">
            {ownPhoto ? ownPhoto.name : 'Foto obrigatória da avaria'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setOwnPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <div className="mt-4 flex items-center gap-4">
          <p className="text-[13px] font-semibold text-ink-secondary">Quantidade</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-field text-ink-secondary hover:text-ink"
            >
              <Minus size={16} />
            </button>
            <span className="w-8 text-center text-lg font-bold tabular-nums text-ink">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-field text-ink-secondary hover:text-ink"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="expiry-month" className="mb-2 block text-[13px] font-semibold text-ink-secondary">
            Validade (mês/ano)
          </label>
          <input
            id="expiry-month"
            type="month"
            value={expiryMonth}
            onChange={(e) => setExpiryMonth(e.target.value)}
            className="w-40 field"
          />
        </div>

        {catalog.ncm_pending && (
          <div className="mt-4">
            <NcmPendingBanner />
          </div>
        )}
      </div>

      <div className="glass glass-blur border-x-0 border-b-0 p-4">
        <Button
          size="lg"
          className="w-full"
          disabled={!canConfirm}
          onClick={() =>
            onConfirm({
              condition,
              quantity,
              salePrice: priceValue,
              expiryDate: expiryMonth ? monthToExpiryDate(expiryMonth) : null,
              ownPhoto: needsOwnPhoto ? ownPhoto : null,
            })
          }
        >
          Confirmar e próximo
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 w-full text-center text-sm text-ink-soft hover:underline"
        >
          Cancelar
        </button>
        <p className="mt-3 flex justify-between text-xs text-ink-soft">
          <span>{lastItemLabel ? `Último: ${lastItemLabel}` : ''}</span>
          <span>
            {showCost && averageAllocatedCost !== null
              ? `Rateio médio: ${formatCurrency(averageAllocatedCost)}`
              : ''}
          </span>
        </p>
      </div>
    </div>
  )
}
