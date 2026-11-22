import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { SkeletonKpis } from '../ui/Skeleton'
import { Kpi } from './Kpi'
import { ChannelSplit } from './ChannelSplit'
import { getErrorMessage } from '../../lib/errors'
import { getBestSalesDay, getSalesSummary } from '../../lib/reports'
import { formatCurrency, formatDate } from '../../lib/format'
import type { SalesDayTotal, SalesSummary } from '../../lib/types'
import { SegmentedControl } from '../ui/SegmentedControl'

type SalesPreset = 'dia' | 'semana' | 'mes' | 'ano' | 'custom'

const SALES_PRESETS: { value: Exclude<SalesPreset, 'custom'>; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'ano', label: 'Ano' },
]

function localInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Intervalo (from/to como YYYY-MM-DD) de cada atalho, relativo a hoje: Dia =
 * hoje; Semana = a partir de segunda desta semana; Mês/Ano = do dia 1 /
 * 1º de janeiro até hoje. */
function presetRange(preset: Exclude<SalesPreset, 'custom'>): { from: string; to: string } {
  const now = new Date()
  const to = localInputDate(now)
  if (preset === 'dia') return { from: to, to }
  if (preset === 'semana') {
    const diffToMonday = (now.getDay() + 6) % 7
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday)
    return { from: localInputDate(monday), to }
  }
  if (preset === 'mes') {
    return { from: localInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  }
  return { from: localInputDate(new Date(now.getFullYear(), 0, 1)), to }
}

function weekdayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' })
}

export function SalesSection() {
  const [preset, setPreset] = useState<SalesPreset>('mes')
  const [from, setFrom] = useState(() => presetRange('mes').from)
  const [to, setTo] = useState(() => presetRange('mes').to)
  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [bestDay, setBestDay] = useState<SalesDayTotal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Recorde de faturamento num dia sobre TODA a operação (decisão #51): busca
  // uma vez, na montagem, e NÃO entra no efeito do período -- trocar o
  // intervalo do seletor não muda a meta a bater.
  useEffect(() => {
    getBestSalesDay()
      .then(setBestDay)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar o melhor dia de vendas.')))
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    // Limites de dia local: do começo do dia `from` ao fim do dia `to`. Sem
    // "Z", `new Date` interpreta a string no fuso local (não UTC).
    const fromISO = new Date(`${from}T00:00:00`).toISOString()
    const toISO = new Date(`${to}T23:59:59.999`).toISOString()
    getSalesSummary(fromISO, toISO)
      .then(setSummary)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar vendas.')))
      .finally(() => setLoading(false))
  }, [from, to])

  function applyPreset(p: Exclude<SalesPreset, 'custom'>) {
    const range = presetRange(p)
    setPreset(p)
    setFrom(range.from)
    setTo(range.to)
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold tracking-tight text-ink">Vendas</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Período"
            options={SALES_PRESETS}
            value={preset === 'custom' ? null : preset}
            onChange={applyPreset}
          />
          <span className="mx-0.5 hidden h-6 w-px bg-border sm:block" />
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value)
              setPreset('custom')
            }}
            className="field field-sm"
          />
          <span className="text-sm text-ink-soft">até</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value)
              setPreset('custom')
            }}
            className="field field-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading ? (
        <SkeletonKpis label="Carregando vendas do período…" />
      ) : summary ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Faturamento" value={formatCurrency(summary.revenue)} sub="vendas concluídas" />
            <Kpi
              label="Lucro"
              value={formatCurrency(summary.profit)}
              sub="com custo congelado"
              valueClass="text-success"
            />
            <Kpi label="Nº de vendas" value={String(summary.count)} sub="no período" />
            <Kpi label="Ticket médio" value={formatCurrency(summary.avgTicket)} sub="faturamento ÷ vendas" />
          </div>

          <ChannelSplit total={summary.revenue} site={summary.siteRevenue} />

          {bestDay ? (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-4">
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Melhor dia de vendas (recorde)
                </div>
                <div className="mt-0.5 text-sm capitalize text-ink-secondary">
                  {formatDate(bestDay.date)} — {weekdayLabel(bestDay.date)}
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  desde o início — não muda com o período escolhido acima
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight tabular-nums text-primary">
                {formatCurrency(bestDay.total)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Nenhuma venda registrada ainda.</p>
          )}
        </div>
      ) : null}
    </Card>
  )
}
