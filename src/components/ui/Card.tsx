import { type HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Painel que flutua sobre a tela (modal): quase opaco em vez de vidro --
   * vidro translúcido sobre o véu escuro do modal ficaria cinza e ilegível
   * (decisão #70). */
  raised?: boolean
}

/** Painel padrão do app: vidro da Safira (decisão #70). */
export function Card({ className = '', raised = false, ...props }: CardProps) {
  const look = raised
    ? 'border border-border bg-surface-raised shadow-2xl glass-blur'
    : 'glass glass-blur'
  return <div className={`rounded-panel ${look} p-6 ${className}`} {...props} />
}
