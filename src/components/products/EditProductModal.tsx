import { getErrorMessage } from '../../lib/errors'
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { updateCatalogName, updateCatalogBrand } from '../../lib/catalog'
import { countItemsByCatalog, updateStockItem } from '../../lib/stockItems'
import { displayCurrencyValue, formatCurrency, maskCurrencyInput } from '../../lib/format'

interface EditProductModalProps {
  catalogId: string
  ean: string | null
  currentName: string
  currentBrand: string | null
  stockItemId: string
  currentSalePrice: number
  currentQuantity: number
  quantitySold: number
  /** Ausente pra quem não é dono (decisão #68): o custo rateado é derivado do
   * valor pago no lote. */
  allocatedCost?: number
  onSaved: (patch: { name: string; brand: string | null; sale_price?: number; quantity?: number }) => void
  onCancel: () => void
}

/**
 * Editar produto do catálogo (Branch 1, item 1) -- unifica nome e marca num
 * modal só, substituindo o antigo EditCatalogNameModal.
 *
 * Nome vale pro EAN inteiro e é o nome usado na NFC-e (Fase 2). A trava de
 * "somente o dono" foi removida (Branch 2, item 4 -- reverte a parte de papel
 * da decisão #30), mas o passo de confirmação separado continua, porque
 * renomear afeta todos os lotes com este produto, inclusive vendas já
 * registradas -- é proteção contra engano, não contra papel.
 *
 * Marca é campo de menor risco (decisão #37): livre pra qualquer papel, sem
 * confirmação. Se só a marca mudar, o Salvar grava direto; o passo de
 * confirmação só existe quando o nome muda.
 */
export function EditProductModal({
  catalogId,
  ean,
  currentName,
  currentBrand,
  stockItemId,
  currentSalePrice,
  currentQuantity,
  quantitySold,
  allocatedCost,
  onSaved,
  onCancel,
}: EditProductModalProps) {
  const [name, setName] = useState(currentName)
  const [brand, setBrand] = useState(currentBrand ?? '')
  const [salePrice, setSalePrice] = useState(String(currentSalePrice))
  const [quantity, setQuantity] = useState(String(currentQuantity))
  const [scope, setScope] = useState<{ items: number; lots: number } | null>(null)
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    countItemsByCatalog(catalogId).then(setScope).catch(() => setScope(null))
  }, [catalogId])

  const trimmedName = name.trim()
  const trimmedBrand = brand.trim()
  const currentBrandValue = currentBrand ?? ''
  const nameChanged = trimmedName.length > 0 && trimmedName !== currentName
  const brandChanged = trimmedBrand !== currentBrandValue
  const parsedSalePrice = salePrice === '' ? NaN : Number(salePrice)
  const salePriceValid = !Number.isNaN(parsedSalePrice) && parsedSalePrice > 0
  const salePriceDirty = salePrice !== String(currentSalePrice)
  const salePriceInvalid = salePriceDirty && !salePriceValid
  const salePriceChanged = salePriceValid && parsedSalePrice !== currentSalePrice
  // Quantidade: inteiro, nunca abaixo do que já foi vendido (o banco recusaria
  // via `stock_items_sold_within_quantity`) e nunca abaixo de 1 -- pra zerar
  // existe a exclusão. Mesmo tom de risco do preço (por item/lote, sem
  // confirmação).
  const minQuantity = Math.max(1, quantitySold)
  const parsedQuantity = quantity === '' ? NaN : Number(quantity)
  const quantityValid =
    Number.isInteger(parsedQuantity) && parsedQuantity >= minQuantity
  const quantityDirty = quantity !== String(currentQuantity)
  const quantityInvalid = quantityDirty && !quantityValid
  const quantityChanged = quantityValid && parsedQuantity !== currentQuantity
  const nothingChanged = !nameChanged && !brandChanged && !salePriceChanged && !quantityChanged

  async function persist() {
    // Marca e preço/quantidade primeiro (livres): se o nome também mudou, a
    // confirmação já passou. Preço e quantidade vão no MESMO update -- ambos
    // disparam o trigger de rateio, num update só ele recalcula uma vez.
    if (brandChanged) await updateCatalogBrand(catalogId, trimmedBrand || null)
    if (salePriceChanged || quantityChanged) {
      await updateStockItem(stockItemId, {
        ...(salePriceChanged ? { sale_price: parsedSalePrice } : {}),
        ...(quantityChanged ? { quantity: parsedQuantity } : {}),
      })
    }
    if (nameChanged) await updateCatalogName(catalogId, trimmedName)
    onSaved({
      name: nameChanged ? trimmedName : currentName,
      brand: trimmedBrand || null,
      sale_price: salePriceChanged ? parsedSalePrice : undefined,
      quantity: quantityChanged ? parsedQuantity : undefined,
    })
  }

  async function handleSave() {
    setError(null)
    // Nome mudou -> confirmação obrigatória (afeta todos os lotes/NFC-e).
    if (nameChanged) {
      setStep('confirm')
      return
    }
    // Só a marca mudou -> grava direto.
    setSaving(true)
    try {
      await persist()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao salvar.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    try {
      await persist()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao salvar.'))
      setStep('edit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
      <Card raised className="w-full max-w-sm">
        {step === 'edit' ? (
          <>
            <h2 className="mb-1 text-xl font-bold tracking-tight text-ink">Editar produto</h2>
            <p className="mb-4 text-xs text-ink-soft">
              {ean ? `EAN ${ean} — ` : ''}vale para todos os lotes deste produto.
            </p>

            {error && <p className="mb-3 text-sm text-danger">{error}</p>}

            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
              Marca
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="mb-1 w-full field"
            />
            <p className="mb-4 text-xs text-ink-soft">Editável por qualquer usuário.</p>

            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
              Nome no catálogo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-4 w-full field"
            />

            <div className="mb-4 border-t border-border pt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
                Preço de venda deste item
              </label>
              {allocatedCost !== undefined && (
                <p className="mb-2 text-xs text-ink-soft">
                  Custo rateado: <span className="tabular-nums text-ink-secondary">{formatCurrency(allocatedCost)}</span>
                </p>
              )}
              <input
                type="text"
                inputMode="decimal"
                value={displayCurrencyValue(salePrice)}
                onChange={(e) => setSalePrice(maskCurrencyInput(e.target.value))}
                className="mb-1 w-full field"
              />
              {salePriceInvalid ? (
                <p className="text-xs text-danger">Preço deve ser maior que zero.</p>
              ) : (
                <p className="text-xs text-ink-soft">
                  Vale só para esta unidade (lote atual) — recalcula o rateio dos demais itens do mesmo lote.
                </p>
              )}
            </div>

            <div className="mb-4 border-t border-border pt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
                Quantidade deste item
              </label>
              {quantitySold > 0 && (
                <p className="mb-2 text-xs text-ink-soft">
                  Já vendidas: <span className="tabular-nums text-ink-secondary">{quantitySold}</span>
                </p>
              )}
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
                className="mb-1 w-full field"
              />
              {quantityInvalid ? (
                <p className="text-xs text-danger">
                  {quantitySold > 0
                    ? `Não pode ser menor que as ${quantitySold} unidades já vendidas.`
                    : 'Quantidade deve ser pelo menos 1.'}
                </p>
              ) : (
                <p className="text-xs text-ink-soft">
                  Vale só para este item (lote atual) — recalcula o rateio dos demais itens do mesmo lote.
                </p>
              )}
            </div>

            {nameChanged && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 p-3 text-xs leading-relaxed text-warning">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Alterar o nome afeta{' '}
                  {scope
                    ? `${scope.items} ${scope.items === 1 ? 'item' : 'itens'} em ${scope.lots} ${scope.lots === 1 ? 'lote' : 'lotes'}`
                    : 'os itens deste produto'}{' '}
                  e é o nome usado na NFC-e (Fase 2). Apelidos de item não mudam.
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={saving || nothingChanged || salePriceInvalid || quantityInvalid}
                onClick={handleSave}
                className="flex-1"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-xl font-bold tracking-tight text-ink">Alterar nome no catálogo?</h2>
            <p className="mb-4 text-sm text-ink-secondary">
              Isso muda a exibição
              {scope ? ` em ${scope.items} ${scope.items === 1 ? 'item' : 'itens'} de ${scope.lots} ${scope.lots === 1 ? 'lote' : 'lotes'}` : ''}
              , incluindo vendas já registradas no histórico.
            </p>
            <div className="mb-6 rounded-xl bg-surface-secondary p-3 text-sm">
              <p className="text-ink-soft line-through">{currentName}</p>
              <p className="font-medium text-ink">→ {trimmedName}</p>
            </div>
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep('edit')} className="flex-1">
                Voltar
              </Button>
              <Button type="button" disabled={saving} onClick={handleConfirm} className="flex-1">
                {saving ? 'Salvando…' : 'Confirmar alteração'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
