import type { ReactNode } from 'react'

/**
 * Esqueletos de carregamento (decisão #73): no lugar do conteúdo que ainda
 * não chegou, a forma dele em cinza pulsando -- escolha do dono no lugar do
 * loader da marca, que sozinho num espaço vazio não lia como carregamento.
 *
 * Faixas em `ink` a 10%: acompanha o tema sozinho e aparece sobre o vidro
 * da Safira no claro (o `surface-secondary` quase some ali).
 */
export function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink/10 ${className}`} />
}

/** Envelope acessível: leitor de tela ouve "Carregando…" uma vez, as faixas
 * em si ficam escondidas dele. */
export function SkeletonStatus({
  label = 'Carregando…',
  className = '',
  children,
}: {
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role="status" aria-label={label} className={className}>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  )
}

const ROW_WIDTHS = [
  ['w-2/5', 'w-1/6', 'w-1/5', 'w-1/6'],
  ['w-1/3', 'w-1/5', 'w-1/6', 'w-1/5'],
  ['w-1/2', 'w-1/6', 'w-1/5', 'w-1/6'],
]

/** Linhas de tabela/lista: uma faixa larga (o nome) e algumas menores. */
export function SkeletonRows({ rows = 5, label }: { rows?: number; label?: string }) {
  return (
    <SkeletonStatus label={label} className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0"
        >
          {ROW_WIDTHS[i % ROW_WIDTHS.length].map((w, j) => (
            <SkeletonBar key={j} className={`h-3.5 ${w}`} />
          ))}
        </div>
      ))}
    </SkeletonStatus>
  )
}

/** Cards de número (KPI): mesma moldura do `Kpi` (`glass` = moldura do
 * `StatCard` do Dashboard). */
export function SkeletonKpis({
  count = 4,
  className = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4',
  glass = false,
  label,
}: {
  count?: number
  className?: string
  glass?: boolean
  label?: string
}) {
  const frame = glass ? 'rounded-panel glass glass-blur px-5 py-4' : 'rounded-2xl border border-border bg-surface-secondary p-4'
  return (
    <SkeletonStatus label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`flex flex-col gap-2.5 ${frame}`}>
          <SkeletonBar className="h-3 w-1/2" />
          <SkeletonBar className="h-7 w-3/4" />
          <SkeletonBar className="h-3 w-1/3" />
        </div>
      ))}
    </SkeletonStatus>
  )
}

/** Cards de conteúdo (lotes, fechamentos...): título, selo e três linhas. */
export function SkeletonCards({
  count = 6,
  className = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
  label,
}: {
  count?: number
  className?: string
  label?: string
}) {
  return (
    <SkeletonStatus label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-panel glass p-6">
          <div className="flex items-start justify-between gap-3">
            <SkeletonBar className="h-5 w-1/2" />
            <SkeletonBar className="h-6 w-16" />
          </div>
          <SkeletonBar className="h-3.5 w-2/3" />
          <SkeletonBar className="h-3.5 w-1/3" />
          <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
            <SkeletonBar className="h-3.5 w-1/4" />
            <SkeletonBar className="h-5 w-1/4" />
          </div>
        </div>
      ))}
    </SkeletonStatus>
  )
}

/** Painel de vidro com linhas dentro (tabelas que vivem num `Card`). */
export function SkeletonPanel({ rows = 6, label, title = true }: { rows?: number; label?: string; title?: boolean }) {
  return (
    <div className="rounded-panel glass glass-blur p-6">
      {title && <SkeletonBar className="mb-4 h-5 w-1/4" />}
      <SkeletonRows rows={rows} label={label} />
    </div>
  )
}
