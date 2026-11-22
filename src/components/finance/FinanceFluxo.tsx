import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { SkeletonBar, SkeletonKpis, SkeletonPanel } from '../ui/Skeleton'
import { Kpi } from '../reports/Kpi'
import { getErrorMessage } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import { getCashFlow, monthRange, type CashFlow, type CashFlowWeek } from '../../lib/finance'

export function FinanceFluxo({ month, version }: { month: string; version: number }) {
  const [flow, setFlow] = useState<CashFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    setLoading(true)
    setError(null)
    getCashFlow(month)
      .then((f) => !stale && setFlow(f))
      .catch((err) => !stale && setError(getErrorMessage(err, 'Erro ao carregar o fluxo de caixa.')))
      .finally(() => !stale && setLoading(false))
    return () => {
      stale = true
    }
  }, [month, version])

  if (loading)
    return (
      <div className="flex flex-col gap-5">
        <SkeletonKpis label="Carregando fluxo de caixa…" />
        <SkeletonBar className="h-56 w-full rounded-panel" />
        <SkeletonPanel title={false} rows={4} />
      </div>
    )
  if (error) return <p className="text-sm text-danger">{error}</p>
  if (!flow) return null

  const endLabel = formatDate(monthRange(month).to).slice(0, 5)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Kpi
            label="Saldo no início do mês"
            value={flow.startBalance === null ? '—' : formatCurrency(flow.startBalance)}
            sub={flow.startBalance === null ? 'defina o saldo inicial em Configurações' : undefined}
          />
        </div>
        <div>
          <Kpi label="Entrou" value={formatCurrency(flow.realizedIn)} sub="já líquido das taxas" />
        </div>
        <div>
          <Kpi label="Saiu" value={formatCurrency(flow.realizedOut)} sub="despesas pagas + lotes" />
        </div>
        <div>
          <Kpi
            label={`Previsto p/ ${endLabel}`}
            value={formatCurrency(flow.endBalance)}
            sub={`+${formatCurrency(flow.forecastIn)} a cair · −${formatCurrency(flow.forecastOut)} a pagar`}
            valueClass={flow.endBalance < 0 ? 'text-danger' : 'text-ink'}
          />
        </div>
      </div>

      <Card>
        <WeeklyChart weeks={flow.weeks} />
      </Card>

      {flow.days.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">Nenhuma entrada ou saída neste mês.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-panel glass glass-blur">
          <table className="w-full min-w-[720px] text-sm tabular-nums" data-testid="finance-cashflow">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-secondary">
                <th className="px-4 py-3 font-semibold">Dia</th>
                <th className="px-4 py-3 font-semibold">O que entrou / saiu</th>
                <th className="px-4 py-3 text-right font-semibold">Entradas</th>
                <th className="px-4 py-3 text-right font-semibold">Saídas</th>
                <th className="px-4 py-3 text-right font-semibold">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {flow.days.map((d) => (
                <tr
                  key={d.date}
                  className={`border-t border-border ${d.forecast ? 'bg-ink/[0.03] text-ink-secondary' : 'text-ink'}`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {formatDate(d.date).slice(0, 5)}
                    {d.forecast && (
                      <span className="ml-2 rounded-full border border-dashed border-ink-soft px-2 py-0.5 text-[11px] text-ink-secondary">
                        previsto
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{d.labels.join(' · ')}</td>
                  <td className="px-4 py-2.5 text-right">{d.inflow > 0 ? formatCurrency(d.inflow) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">{d.outflow > 0 ? formatCurrency(d.outflow) : '—'}</td>
                  <td className={`px-4 py-2.5 text-right ${d.balance < 0 ? 'text-danger' : ''}`}>
                    {formatCurrency(d.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        Venda entra no dia em que o dinheiro cai na conta (dia da venda + prazo da forma de pagamento) e já sem
        a taxa. Sangria e suprimento não aparecem: é dinheiro mudando de lugar, não entrando nem saindo.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gráfico: entradas × saídas por semana. Barra cheia = realizado; parte com
// contorno tracejado = previsto. Valores exatos na dica ao passar o mouse e na
// tabela abaixo (o gráfico não é a única forma de ler o número).
// ---------------------------------------------------------------------------

function WeeklyChart({ weeks }: { weeks: CashFlowWeek[] }) {
  const max = Math.max(
    1,
    ...weeks.map((w) => Math.max(w.inRealized + w.inForecast, w.outRealized + w.outForecast)),
  )
  const pct = (v: number) => `${(v / max) * 100}%`

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Entradas × saídas por semana
        </h2>
        <div className="flex flex-wrap gap-4 text-xs text-ink-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-chart-in" />
            Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-chart-out" />
            Saídas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-ink-soft" />
            Previsto
          </span>
        </div>
      </div>
      <div
        role="img"
        aria-label="Gráfico de entradas e saídas por semana do mês. Os valores estão na tabela abaixo."
        className="grid h-44 items-end gap-3 border-b border-border px-1"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((w) => (
          <div key={w.label} className="group relative flex h-full items-end justify-center gap-0.5">
            <Bar realized={w.inRealized} forecast={w.inForecast} pct={pct} tone="in" />
            <Bar realized={w.outRealized} forecast={w.outForecast} pct={pct} tone="out" />
            <div className="pointer-events-none absolute top-0 left-1/2 z-10 hidden w-48 -translate-x-1/2 rounded-xl border border-border bg-surface-raised p-2.5 text-xs shadow-lg group-hover:block">
              <div className="mb-1 font-semibold text-ink">Dias {w.label}</div>
              <TipRow label="Entradas" value={w.inRealized} />
              {w.inForecast > 0 && <TipRow label="Entradas previstas" value={w.inForecast} />}
              <TipRow label="Saídas" value={w.outRealized} />
              {w.outForecast > 0 && <TipRow label="Saídas previstas" value={w.outForecast} />}
            </div>
          </div>
        ))}
      </div>
      <div
        className="grid gap-3 px-1 pt-2 text-center text-xs text-ink-secondary"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((w) => (
          <span key={w.label}>{w.label}</span>
        ))}
      </div>
    </div>
  )
}

function Bar({
  realized,
  forecast,
  pct,
  tone,
}: {
  realized: number
  forecast: number
  pct: (v: number) => string
  tone: 'in' | 'out'
}) {
  const solid = tone === 'in' ? 'bg-chart-in' : 'bg-chart-out'
  const dashed =
    tone === 'in' ? 'border-chart-in bg-chart-in/15' : 'border-chart-out bg-chart-out/15'
  return (
    <div className="flex h-full w-7 max-w-[40%] flex-col justify-end">
      {forecast > 0 && (
        <div
          className={`box-border rounded-t border border-b-0 border-dashed ${dashed} ${realized > 0 ? 'mb-0.5' : ''}`}
          style={{ height: pct(forecast) }}
        />
      )}
      {realized > 0 && (
        <div className={`${solid} ${forecast > 0 ? '' : 'rounded-t'}`} style={{ height: pct(realized) }} />
      )}
    </div>
  )
}

function TipRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2 text-ink-secondary">
      <span>{label}</span>
      <span className="tabular-nums text-ink">{formatCurrency(value)}</span>
    </div>
  )
}
