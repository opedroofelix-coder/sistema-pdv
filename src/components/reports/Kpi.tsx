/**
 * Card de KPI compacto (rótulo maiúsculo + valor), mesmo padrão visual dos
 * StatCard do Dashboard. Usado pelas seções de Vendas e Estoque parado --
 * vive num arquivo próprio desde que as duas saíram de `/relatorios` pro
 * Dashboard (decisão #49), pra não duplicar a marcação entre elas.
 */
export function Kpi({
  label,
  value,
  sub,
  valueClass = 'text-ink',
  highlight = false,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${highlight ? 'border-success/30 bg-success/[0.07]' : 'border-border bg-surface-secondary'}`}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs font-semibold text-ink-soft">{sub}</div>}
    </div>
  )
}
