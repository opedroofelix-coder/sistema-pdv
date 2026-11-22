import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card } from '../ui/Card'
import { SkeletonKpis, SkeletonPanel } from '../ui/Skeleton'
import { Kpi } from '../reports/Kpi'
import { getErrorMessage } from '../../lib/errors'
import { formatCurrency } from '../../lib/format'
import {
  addDays,
  DUE_SOON_DAYS,
  expenseStatus,
  getDre,
  listExpensesForMonth,
  listOpenExpensesDueBy,
  todayKey,
  type Dre,
  type FinanceCategory,
} from '../../lib/finance'

interface Alerts {
  overdue: number
  dueSoon: number
  total: number
}

interface OpenTotal {
  count: number
  amount: number
}

export function FinanceResumo({
  month,
  categories,
  version,
  onOpenContas,
}: {
  month: string
  categories: FinanceCategory[]
  version: number
  onOpenContas: () => void
}) {
  const [dre, setDre] = useState<Dre | null>(null)
  const [open, setOpen] = useState<OpenTotal | null>(null)
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    setLoading(true)
    setError(null)
    const today = todayKey()
    Promise.all([
      getDre(month, categories),
      listExpensesForMonth(month),
      listOpenExpensesDueBy(addDays(today, DUE_SOON_DAYS)),
    ])
      .then(([d, monthExpenses, dueSoon]) => {
        if (stale) return
        setDre(d)
        const unpaid = monthExpenses.filter((e) => !e.paid_at)
        setOpen({ count: unpaid.length, amount: unpaid.reduce((s, e) => s + Number(e.amount), 0) })
        let overdue = 0
        let soon = 0
        for (const e of dueSoon) {
          if (expenseStatus(e, today) === 'vencida') overdue++
          else soon++
        }
        setAlerts({ overdue, dueSoon: soon, total: dueSoon.reduce((s, e) => s + Number(e.amount), 0) })
      })
      .catch((err) => !stale && setError(getErrorMessage(err, 'Erro ao carregar o resumo.')))
      .finally(() => !stale && setLoading(false))
    return () => {
      stale = true
    }
  }, [month, categories, version])

  if (loading)
    return (
      <div className="flex flex-col gap-5">
        <SkeletonKpis label="Carregando resumo…" />
        <SkeletonPanel rows={6} />
      </div>
    )
  if (error) return <p className="text-sm text-danger">{error}</p>
  if (!dre) return null

  const profitClass = dre.netProfit < 0 ? 'text-danger' : 'text-success'

  return (
    <div className="flex flex-col gap-5">
      {alerts && alerts.overdue + alerts.dueSoon > 0 && (
        <div
          data-testid="finance-due-alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink"
        >
          <AlertTriangle size={18} className="shrink-0 text-warning" aria-hidden="true" />
          <span className="flex-1">
            {alerts.overdue > 0 && (
              <strong>
                {alerts.overdue} {alerts.overdue === 1 ? 'conta vencida' : 'contas vencidas'}
              </strong>
            )}
            {alerts.overdue > 0 && alerts.dueSoon > 0 && ' e '}
            {alerts.dueSoon > 0 && (
              <strong>
                {alerts.dueSoon} {alerts.dueSoon === 1 ? 'vence' : 'vencem'} nos próximos {DUE_SOON_DAYS} dias
              </strong>
            )}{' '}
            ({formatCurrency(alerts.total)})
          </span>
          <button type="button" onClick={onOpenContas} className="font-semibold text-accent hover:underline">
            Ver contas
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Kpi
            label="Faturamento"
            value={formatCurrency(dre.revenue)}
            sub={`${dre.salesCount} ${dre.salesCount === 1 ? 'venda' : 'vendas'} · loja + site`}
          />
        </div>
        <div>
          <Kpi
            label="Lucro líquido"
            value={formatCurrency(dre.netProfit)}
            sub="depois de taxas, CMV e despesas"
            valueClass={profitClass}
          />
        </div>
        <div>
          <Kpi
            label="Margem líquida"
            value={dre.netMargin === null ? '—' : `${(dre.netMargin * 100).toFixed(1).replace('.', ',')}%`}
            sub="lucro líquido ÷ faturamento"
          />
        </div>
        <div>
          <Kpi
            label="Contas em aberto"
            value={formatCurrency(open?.amount ?? 0)}
            sub={`${open?.count ?? 0} ${open?.count === 1 ? 'conta' : 'contas'}`}
          />
        </div>
      </div>

      <Card>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Resultado do mês (DRE)
        </h2>
        <p className="mb-3 mt-1 text-xs text-ink-soft">
          Compra de lote não aparece aqui: ela vira estoque e entra como custo (CMV) conforme as peças são
          vendidas. No Fluxo de caixa ela aparece como saída.
        </p>
        <div className="flex flex-col text-sm tabular-nums" data-testid="finance-dre">
          <DreRow label="Faturamento bruto" value={dre.revenue} />
          <DreRow
            label="− Taxas de cartão e site"
            hint="(estimadas pela configuração)"
            value={-dre.fees}
            indent
          />
          <DreRow label="= Receita líquida" value={dre.netRevenue} strong />
          <DreRow label="− Custo da mercadoria vendida (CMV)" value={-dre.cmv} indent />
          <DreRow label="= Lucro bruto" value={dre.grossProfit} strong />
          <div className="py-2 pl-4 text-ink-secondary">− Despesas</div>
          {dre.expensesByCategory.length === 0 ? (
            <div className="py-1 pl-8 text-ink-soft">Nenhuma despesa lançada neste mês.</div>
          ) : (
            dre.expensesByCategory.map((c) => (
              <div key={c.name} className="flex justify-between py-1 pl-8 text-ink-secondary">
                <span>{c.name}</span>
                <span className="whitespace-nowrap">{formatCurrency(-c.amount)}</span>
              </div>
            ))
          )}
          <DreRow label="Total de despesas" value={-dre.expensesTotal} indent strongBorder />
          <div className="flex justify-between pt-3 text-lg font-bold">
            <span>= Lucro líquido</span>
            <span className={profitClass} data-testid="finance-net-profit">
              {formatCurrency(dre.netProfit)}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

function DreRow({
  label,
  hint,
  value,
  indent = false,
  strong = false,
  strongBorder = false,
}: {
  label: string
  hint?: string
  value: number
  indent?: boolean
  strong?: boolean
  strongBorder?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-3 border-b py-2 ${strong || strongBorder ? 'border-border' : 'border-border/50'} ${
        indent ? 'pl-4 text-ink-secondary' : 'text-ink'
      } ${strong ? 'font-semibold' : ''}`}
    >
      <span>
        {label} {hint && <span className="text-ink-soft">{hint}</span>}
      </span>
      {/* `|| 0`: sem taxa, −0 sairia como "-R$ 0,00". */}
      <span className="whitespace-nowrap">{formatCurrency(value || 0)}</span>
    </div>
  )
}
