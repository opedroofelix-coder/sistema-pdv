import { Button } from './Button'
import { Card } from './Card'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  /** Rótulo enquanto a ação roda. Default no verbo da exclusão, o caso original. */
  busyLabel?: string
  /**
   * Ações reversíveis (fechar/reabrir lote) usam a cor de ação normal --
   * vermelho só onde não há volta.
   */
  variant?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal de confirmação genérico (exclusão de itens no catálogo/estoque e as
 * três ações do lote). Generaliza o padrão de modal já usado em
 * `CashSessionPanel` (`fixed inset-0 ... bg-black/50` + `Card`), que até
 * aqui vinha sendo reimplementado igual em cada lugar que precisava de um.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Excluir',
  busyLabel = 'Excluindo…',
  variant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4"
    >
      <Card raised className="w-full max-w-sm">
        <h2 className="mb-2 text-xl font-bold tracking-tight text-ink">{title}</h2>
        <p className="mb-6 text-sm text-ink-secondary">{message}</p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          <Button type="button" variant={variant} disabled={busy} onClick={onConfirm} className="flex-1">
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  )
}
