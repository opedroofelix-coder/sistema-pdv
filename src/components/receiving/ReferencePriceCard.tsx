import { useState } from 'react'
import { mercadoLivreSearchUrl } from '../../lib/mercadoLivre'
import { displayCurrencyValue, formatCurrency, formatDateTime, maskCurrencyInput } from '../../lib/format'
import type { ProductCatalog } from '../../lib/types'

/**
 * Card de referência de mercado (DESIGN.md seção 2, passo 2) -- plano B
 * (CLAUDE.md decisão #23) depois que a via automática do Mercado Livre foi
 * encerrada (busca de produtos bloqueada por política deles mesmo
 * autenticado, decisão #22). Duas origens, nessa ordem:
 * 1. Cosmos: automática, só quando a API tiver o dado (nem todo produto tem).
 * 2. Anotada: operador abre "Ver no Mercado Livre" (nova aba) e digita o
 *    preço que viu -- fica salvo com data.
 */
export function ReferencePriceCard({
  catalog,
  onAnnotate,
}: {
  catalog: ProductCatalog
  onAnnotate: (price: number) => Promise<void>
}) {
  const [manualInput, setManualInput] = useState('')
  const [saving, setSaving] = useState(false)

  const hasCosmos = catalog.ref_price_avg !== null
  const searchUrl = mercadoLivreSearchUrl(catalog)
  const manualValue = Number(manualInput)
  const canSave = manualInput !== '' && !Number.isNaN(manualValue) && manualValue > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      await onAnnotate(manualValue)
      setManualInput('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-surface-secondary p-3">
      <p className="mb-2 text-xs text-ink-soft">Preço no mercado</p>

      {hasCosmos ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-ink-soft">Menor</p>
            <p className="text-sm font-medium text-ink">{formatCurrency(catalog.ref_price_min!)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Médio (Cosmos)</p>
            <p className="text-base font-semibold text-info">{formatCurrency(catalog.ref_price_avg!)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Maior</p>
            <p className="text-sm font-medium text-ink">{formatCurrency(catalog.ref_price_max!)}</p>
          </div>
        </div>
      ) : catalog.manual_ref_price !== null ? (
        <p className="text-sm text-ink">
          <span className="font-semibold text-info">{formatCurrency(catalog.manual_ref_price)}</span>
          {' '}anotado
          {catalog.manual_ref_price_updated_at ? ` em ${formatDateTime(catalog.manual_ref_price_updated_at)}` : ''}
        </p>
      ) : (
        <p className="text-sm text-ink-soft">Sem referência automática da Cosmos</p>
      )}

      {searchUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-primary hover:underline"
          >
            Ver no Mercado Livre ↗
          </a>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Preço visto no ML"
            value={displayCurrencyValue(manualInput)}
            onChange={(e) => setManualInput(maskCurrencyInput(e.target.value))}
            className="w-32 field field-sm"
          />
          <button
            type="button"
            disabled={saving || !canSave}
            onClick={handleSave}
            className="text-xs font-bold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  )
}
