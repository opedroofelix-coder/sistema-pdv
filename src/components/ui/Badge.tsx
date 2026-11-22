import { type ReactNode } from 'react'

export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'neutral'

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-success/[0.13] text-success',
  danger: 'bg-danger/[0.13] text-danger',
  warning: 'bg-warning/[0.14] text-warning',
  info: 'bg-info/[0.13] text-info',
  primary: 'bg-primary/[0.13] text-primary',
  neutral: 'bg-ink-soft/[0.14] text-ink-secondary',
}
const dotClasses: Record<BadgeTone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  primary: 'bg-primary',
  neutral: 'bg-ink-soft',
}

/** Selo de status (decisão #71): um formato só pro app inteiro — fundo tinto
 * da cor, texto na cor, ponto opcional. */
export function Badge({
  tone = 'neutral',
  dot = false,
  className = '',
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${toneClasses[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  )
}
