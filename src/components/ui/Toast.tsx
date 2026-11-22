import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import type { Toast } from '../../contexts/ToastContext'

/**
 * Pilha de avisos de resultado de ação (decisão #58). Renderizada uma vez pelo
 * `ToastProvider`, não por tela.
 *
 * Posição: canto inferior direito no desktop (longe dos botões de ação, que
 * ficam no cabeçalho); no mobile ocupa a largura da tela acima da barra de
 * navegação, que é `fixed bottom-0` no `AppShell`.
 */
export function ToastList({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      // `pointer-events-none` no container e `auto` em cada toast: a área
      // vazia entre eles não pode roubar clique do conteúdo por baixo.
      className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-stretch gap-2 md:inset-x-auto md:right-4 md:bottom-4 md:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isError = toast.tone === 'error'
        const Icon = isError ? AlertCircle : CheckCircle2
        return (
          <div
            key={toast.id}
            data-testid="toast"
            className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3.5 text-ink shadow-2xl glass-blur md:max-w-sm"
          >
            <span
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                isError ? 'bg-danger/[0.13] text-danger' : 'bg-success/[0.13] text-success'
              }`}
            >
              <Icon size={19} />
            </span>
            <p className="flex-1 text-sm font-semibold leading-snug">{toast.message}</p>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => onDismiss(toast.id)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-secondary hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
