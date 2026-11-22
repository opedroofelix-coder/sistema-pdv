import type { CatalogSource, ProductOrigin } from '../../lib/types'
import { Badge } from '../ui/Badge'

const SOURCE_LABEL: Partial<Record<CatalogSource, string>> = {
  upcitemdb: 'UPCitemdb',
  off: 'Open Food Facts',
  cosmos: 'Cosmos',
}

/**
 * Selo de origem (DESIGN.md seção 2, passo 2): só o "importado" ganha selo
 * visível (azul claro), nacional é o caso comum e não precisa de destaque.
 */
export function OriginBadge({
  origin,
  source,
}: {
  origin: ProductOrigin | null
  source?: CatalogSource | null
}) {
  if (origin !== 'importado') return null

  const sourceLabel = source ? SOURCE_LABEL[source] : null

  return (
    <Badge tone="info">Importado{sourceLabel ? ` · via ${sourceLabel}` : ''}</Badge>
  )
}

/** Faixa âmbar "sem NCM" (DESIGN.md seção 2, passo 2). */
export function NcmPendingBanner() {
  return (
    <p className="rounded-xl border border-warning/30 bg-warning/[0.1] px-3 py-2 text-xs font-semibold text-warning">
      Sem NCM — classificar com o contador (importado)
    </p>
  )
}
