import { type ReactNode } from 'react'

/** Estado vazio padrão (decisão #71): ícone num círculo azul claro, título e
 * uma linha de orientação. */
export function EmptyState({
  icon,
  title,
  description,
  className = '',
}: {
  icon: ReactNode
  title: string
  description?: string
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-[14px] border border-dashed border-border px-6 py-8 text-center ${className}`}
    >
      <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
        {icon}
      </span>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {description && <p className="text-[13px] text-ink-soft">{description}</p>}
    </div>
  )
}
