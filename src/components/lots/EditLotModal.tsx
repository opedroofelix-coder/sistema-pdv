import { getErrorMessage } from '../../lib/errors'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { updateLot } from '../../lib/lots'
import { displayCurrencyValue, formatCurrency, formatDate, maskCurrencyInput } from '../../lib/format'
import type { Lot } from '../../lib/types'

interface EditLotModalProps {
  lot: Lot
  onSaved: () => void
  onCancel: () => void
}

/**
 * Editar lote (decisão #65): fornecedor, valor pago e data da compra.
 *
 * O valor pago é a entrada da regra de custeio central do projeto, então mudá-lo
 * recalcula o custo rateado de todos os itens não vendidos do lote -- sozinho,
 * pelo trigger `lots_recalc` (`0002_receiving.sql`). Por isso ele é o único
 * campo com passo de confirmação; fornecedor e data salvam direto, no mesmo tom
 * de risco da marca (decisão #37) e do preço/quantidade (#48/#55).
 *
 * As validações (fornecedor em branco, valor <= 0) e a checagem de "somente o
 * dono" vivem no servidor (`0020_editar_lote.sql`); aqui elas existem de novo só
 * pra o dono não descobrir o erro depois de clicar em Salvar.
 *
 * Lote fechado também pode ser editado, sem reabrir primeiro (decisão do dono,
 * mesmo padrão já usado em /estoque pra excluir item de lote fechado): o custo
 * das unidades já vendidas está congelado em `sale_items.cost_at_sale`, então
 * margem histórica não muda.
 */
export function EditLotModal({ lot, onSaved, onCancel }: EditLotModalProps) {
  const [supplier, setSupplier] = useState(lot.supplier ?? '')
  const [purchaseValue, setPurchaseValue] = useState(String(lot.purchase_value))
  const [purchaseDate, setPurchaseDate] = useState(lot.purchase_date)
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedSupplier = supplier.trim()
  const currentSupplier = lot.supplier ?? ''
  const supplierInvalid = trimmedSupplier === ''
  const supplierChanged = !supplierInvalid && trimmedSupplier !== currentSupplier

  // Valor pago: comparar NÚMERO, não string -- `String(1200.5)` nunca bate com
  // os '1200.50' que a máscara de moeda produz, e o dirty-check por string
  // acusaria mudança onde não houve.
  const parsedValue = purchaseValue === '' ? NaN : Number(purchaseValue)
  const valueValid = !Number.isNaN(parsedValue) && parsedValue > 0
  const valueInvalid = !valueValid
  const valueChanged = valueValid && parsedValue !== Number(lot.purchase_value)

  const dateInvalid = purchaseDate === ''
  const dateChanged = !dateInvalid && purchaseDate !== lot.purchase_date

  const nothingChanged = !supplierChanged && !valueChanged && !dateChanged

  async function persist() {
    // Os três campos vão sempre, inclusive os que não mudaram: a RPC faz um
    // `update` único e o trigger de rateio dispara uma vez só.
    await updateLot(lot.id, {
      supplier: trimmedSupplier,
      purchase_value: parsedValue,
      purchase_date: purchaseDate,
    })
    onSaved()
  }

  async function handleSave() {
    setError(null)
    // Valor pago mudou -> confirmação obrigatória (recalcula o rateio do lote).
    if (valueChanged) {
      setStep('confirm')
      return
    }
    // Só fornecedor e/ou data -> grava direto.
    setSaving(true)
    try {
      await persist()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao salvar o lote.'))
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
      setError(getErrorMessage(err, 'Erro ao salvar o lote.'))
      setStep('edit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
      <Card raised className="w-full max-w-sm" data-testid="edit-lot-modal">
        {step === 'edit' ? (
          <>
            <h2 className="mb-1 text-xl font-bold tracking-tight text-ink">Editar lote</h2>
            <p className="mb-4 text-xs text-ink-soft">Vale só para este lote.</p>

            {error && <p className="mb-3 text-sm text-danger">{error}</p>}

            <label
              htmlFor="edit-lot-supplier"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft"
            >
              Fornecedor / leiloeiro
            </label>
            <input
              id="edit-lot-supplier"
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="mb-1 w-full field"
            />
            {supplierInvalid ? (
              <p className="mb-4 text-xs text-danger">Fornecedor não pode ficar em branco.</p>
            ) : (
              <p className="mb-4 text-xs text-ink-soft">Aparece como o nome do lote nas telas.</p>
            )}

            <label
              htmlFor="edit-lot-value"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft"
            >
              Valor pago (R$)
            </label>
            <input
              id="edit-lot-value"
              type="text"
              inputMode="decimal"
              value={displayCurrencyValue(purchaseValue)}
              onChange={(e) => setPurchaseValue(maskCurrencyInput(e.target.value))}
              className="mb-1 w-full field tabular-nums"
            />
            {valueInvalid ? (
              <p className="mb-4 text-xs text-danger">Valor pago deve ser maior que zero.</p>
            ) : (
              <p className="mb-4 text-xs text-ink-soft">
                Recalcula o custo rateado dos itens não vendidos deste lote.
              </p>
            )}

            <label
              htmlFor="edit-lot-date"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft"
            >
              Data da compra
            </label>
            <input
              id="edit-lot-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="mb-4 w-full field tabular-nums"
            />

            {valueChanged && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 p-3 text-xs leading-relaxed text-warning">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Mudar o valor pago recalcula o custo rateado de todos os itens ainda não vendidos
                  deste lote. Unidades já vendidas mantêm o custo congelado.
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={saving || nothingChanged || supplierInvalid || valueInvalid || dateInvalid}
                onClick={handleSave}
                className="flex-1"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-xl font-bold tracking-tight text-ink">Alterar o valor pago do lote?</h2>
            <p className="mb-4 text-sm text-ink-secondary">
              O custo rateado dos itens ainda não vendidos será recalculado na hora. As unidades já
              vendidas mantêm o custo congelado, então a margem do histórico não muda.
            </p>
            <div className="mb-6 rounded-xl bg-surface-secondary p-3 text-sm tabular-nums">
              <div>
                <p className="text-ink-soft line-through">
                  {formatCurrency(Number(lot.purchase_value))}
                </p>
                <p className="font-medium text-ink">→ {formatCurrency(parsedValue)}</p>
              </div>
              {supplierChanged && (
                <div className="mt-2">
                  <p className="text-ink-soft line-through">
                    {currentSupplier || 'Sem fornecedor'}
                  </p>
                  <p className="font-medium text-ink">→ {trimmedSupplier}</p>
                </div>
              )}
              {dateChanged && (
                <div className="mt-2">
                  <p className="text-ink-soft line-through">{formatDate(lot.purchase_date)}</p>
                  <p className="font-medium text-ink">→ {formatDate(purchaseDate)}</p>
                </div>
              )}
            </div>
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('edit')}
                className="flex-1"
              >
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
