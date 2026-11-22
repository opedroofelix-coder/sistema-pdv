import { getErrorMessage } from '../../lib/errors'
import { useState } from 'react'
import * as Sentry from '@sentry/react'
import { ReceivingStepPhoto } from './ReceivingStepPhoto'
import { ReceivingStepPricing } from './ReceivingStepPricing'
import { ManualProductForm } from './ManualProductForm'
import { confirmCatalogMatch, invalidateCatalogCacheByEan, setManualReferencePrice } from '../../lib/catalog'
import { receiveStockItem, updateStockItem } from '../../lib/stockItems'
import { uploadPhoto } from '../../lib/storage'
import type { Lot, ProductCatalog, StockItem, StockItemCondition } from '../../lib/types'

type Step = 'photo' | 'correcting' | 'pricing'

interface ReceivingFlowProps {
  lot: Lot
  /** Itens já no lote (para estimar rateio e mostrar o rodapé do passo 2). */
  items: StockItem[]
  catalog: ProductCatalog
  /**
   * 'pricing' pula direto pra precificação — usado quando o catálogo acabou
   * de ser criado via cadastro manual (nenhuma foto de API pra confirmar).
   */
  startAt?: Step
  /** Chamado após o item ser efetivamente adicionado ao estoque. */
  onDone: () => void
  onCancel: () => void
  /** Margem estimada e rateio médio no passo 2 só pro dono (decisão #68). */
  showCost?: boolean
}

/**
 * Orquestra o recebimento em duas etapas (DESIGN.md seção 2): validação por
 * foto e depois precificação, num fluxo contínuo — ao confirmar, quem chama
 * decide reabrir a câmera/o campo de bipagem pro próximo item.
 */
export function ReceivingFlow({
  lot,
  items,
  catalog: initialCatalog,
  startAt = 'photo',
  onDone,
  onCancel,
  showCost = false,
}: ReceivingFlowProps) {
  const [step, setStep] = useState<Step>(startAt)
  const [catalog, setCatalog] = useState<ProductCatalog>(initialCatalog)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Plano B do preço de referência (CLAUDE.md decisão #23): operador olha
   * o preço no Mercado Livre (link no card) e anota manualmente -- a busca
   * automática do ML foi encerrada (decisão #22). */
  async function handleAnnotateReference(price: number) {
    try {
      const updated = await setManualReferencePrice(catalog.id, price)
      setCatalog(updated)
    } catch (err) {
      Sentry.captureException(err)
      setError(getErrorMessage(err, 'Erro ao salvar o preço anotado.'))
    }
  }

  async function handlePhotoConfirm(ownPhoto: File | null) {
    setBusy(true)
    setError(null)
    try {
      let photoUrl: string | null | undefined
      if (ownPhoto) {
        photoUrl = await uploadPhoto(ownPhoto, `catalog/${Date.now()}-${ownPhoto.name}`)
      }
      const updated = await confirmCatalogMatch(catalog.id, photoUrl)
      setCatalog(updated)
      setStep('pricing')
    } catch (err) {
      Sentry.captureException(err)
      setError(getErrorMessage(err, 'Erro ao confirmar o produto.'))
    } finally {
      setBusy(false)
    }
  }

  function handleCorrected(updated: ProductCatalog) {
    // A entrada cacheada pra este EAN ficou desatualizada (nome/foto/origem
    // mudaram); dropa pra o próximo bipe do mesmo código na sessão trazer o
    // corrigido, não o antigo.
    invalidateCatalogCacheByEan(updated.ean)
    setCatalog(updated)
    setStep('pricing')
  }

  async function handlePricingConfirm(fields: {
    condition: StockItemCondition
    quantity: number
    salePrice: number
    expiryDate: string | null
    ownPhoto: File | null
  }) {
    setBusy(true)
    setError(null)
    try {
      const item = await receiveStockItem(lot.id, catalog.id, {
        condition: fields.condition,
        quantity: fields.quantity,
        sale_price: fields.salePrice,
        expiry_date: fields.expiryDate,
      })
      if (fields.ownPhoto) {
        const photoUrl = await uploadPhoto(fields.ownPhoto, `stock/${Date.now()}-${fields.ownPhoto.name}`)
        // Acrescenta, não substitui: quando o item soma numa linha que já
        // existia (decisão #52), `[photoUrl]` apagaria a foto anterior.
        await updateStockItem(item.id, { photos: [...(item.photos ?? []), photoUrl] })
      }
      onDone()
    } catch (err) {
      Sentry.captureException(err)
      setError(getErrorMessage(err, 'Erro ao adicionar item ao estoque.'))
      setBusy(false)
    }
  }

  const existingTotalSaleValue = items.reduce((sum, i) => sum + i.sale_price * i.quantity, 0)
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0)
  const averageAllocatedCost =
    totalQuantity > 0
      ? items.reduce((sum, i) => sum + i.allocated_cost * i.quantity, 0) / totalQuantity
      : null
  const lastItem = items[items.length - 1]
  const lastItemLabel = lastItem
    ? (lastItem.product_catalog?.name ?? lastItem.internal_code ?? null)
    : null

  return (
    <>
      {error && (
        <div className="fixed inset-x-0 top-0 z-[60] border-b border-danger bg-surface-raised px-4 py-2 text-center text-sm text-danger">
          {error}
        </div>
      )}

      {step === 'photo' && (
        <ReceivingStepPhoto
          catalog={catalog}
          busy={busy}
          onConfirm={handlePhotoConfirm}
          onReject={() => setStep('correcting')}
        />
      )}

      {step === 'correcting' && (
        <ManualProductForm
          ean={catalog.ean}
          catalogId={catalog.id}
          initialName={catalog.name ?? ''}
          initialBrand={catalog.brand}
          initialOrigin={catalog.origin ?? 'nacional'}
          onCreated={handleCorrected}
          onCancel={() => setStep('photo')}
        />
      )}

      {step === 'pricing' && (
        <ReceivingStepPricing
          catalog={catalog}
          purchaseValue={lot.purchase_value}
          existingTotalSaleValue={existingTotalSaleValue}
          averageAllocatedCost={averageAllocatedCost}
          showCost={showCost}
          busy={busy}
          lastItemLabel={lastItemLabel}
          onAnnotateReference={handleAnnotateReference}
          onConfirm={handlePricingConfirm}
          onCancel={onCancel}
        />
      )}
    </>
  )
}
