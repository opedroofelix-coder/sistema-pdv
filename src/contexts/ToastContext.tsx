import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { ToastList } from '../components/ui/Toast'

export type ToastTone = 'success' | 'error'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastContextValue {
  showToast: (message: string, tone: ToastTone) => void
  dismissToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

/** Erro fica mais tempo: tem texto pra ler (a mensagem vem do banco). */
const DURATION: Record<ToastTone, number> = {
  success: 4000,
  error: 8000,
}

/**
 * Avisos de resultado de ação (decisão #58). Vive acima do roteador, então o
 * toast sobrevive à troca de tela -- excluir um lote leva de volta pra /lotes
 * e o "Lote excluído." aparece já na lista.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, tone: ToastTone) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, tone, message }])
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), DURATION[tone]),
      )
    },
    [dismissToast],
  )

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
