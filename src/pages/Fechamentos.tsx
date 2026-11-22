import { getErrorMessage } from '../lib/errors'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { SkeletonCards } from '../components/ui/Skeleton'
import { useAuth } from '../contexts/AuthContext'
import { getRecentCashCloses, type CashCloseReport } from '../lib/cashSessions'
import { PAYMENT_LABEL } from '../lib/sales'
import { formatCurrency, formatDateTime } from '../lib/format'
import { PageHeader } from '../components/layout/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { Wallet } from 'lucide-react'

/** Só a hora (HH:MM) do horário de abertura, pra não repetir a data cheia. */
function openTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Selo da quebra: 0 = certo (verde), falta (vermelho), sobra (âmbar). Sobra
 * não é perda, por isso âmbar e não vermelho. */
function quebraTag(diff: number): { label: string; cls: string } {
  if (diff === 0) return { label: 'Caixa certo', cls: 'bg-success/10 text-success' }
  if (diff < 0)
    return { label: `Falta ${formatCurrency(Math.abs(diff))}`, cls: 'bg-danger/10 text-danger' }
  return { label: `Sobra ${formatCurrency(diff)}`, cls: 'bg-warning/10 text-warning' }
}

function diffClass(diff: number): string {
  if (diff === 0) return 'text-success'
  return diff < 0 ? 'text-danger' : 'text-warning'
}

export function Fechamentos() {
  const { profile } = useAuth()

  // Só-dono, mesmo padrão de /relatorios e /usuarios (decisões #14/#38).
  if (profile?.role === 'caixa') return <Navigate to="/pdv" replace />
  if (profile?.role === 'estoquista') return <Navigate to="/lotes" replace />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fechamentos de caixa"
        meta={<span className="text-sm font-semibold text-ink-soft">Últimos 7 dias</span>}
      />
      <ClosesList />
    </div>
  )
}

function ClosesList() {
  const [reports, setReports] = useState<CashCloseReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRecentCashCloses()
      .then(setReports)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar os fechamentos.')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonCards count={4} className="grid gap-3 lg:grid-cols-2" label="Carregando fechamentos…" />
  if (error) return <p className="text-sm text-danger">{error}</p>
  if (reports.length === 0)
    return <EmptyState icon={<Wallet size={22} />} title="Nenhum caixa fechado nos últimos 7 dias." />

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {reports.map((r) => (
        <CloseCard key={r.session_id} report={r} />
      ))}
    </div>
  )
}

function ReconRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink-soft">{label}</span>
      <span className={`font-bold tabular-nums ${valueClass ?? 'text-ink'}`}>{value}</span>
    </div>
  )
}

function CloseCard({ report: r }: { report: CashCloseReport }) {
  const tag = quebraTag(r.difference)
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-bold tracking-tight text-ink">{r.cashier_name ?? 'Operador'}</p>
          <p className="text-xs text-ink-soft">
            Fechado {formatDateTime(r.closed_at)} · aberto às {openTime(r.opened_at)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${tag.cls}`}>
          {tag.label}
        </span>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        <ReconRow label="Abertura" value={formatCurrency(r.opening_amount)} />
        <ReconRow label="Esperado" value={formatCurrency(r.expected_amount)} />
        <ReconRow label="Contado" value={formatCurrency(r.closing_amount)} />
        <ReconRow
          label="Diferença"
          value={formatCurrency(r.difference)}
          valueClass={`font-semibold ${diffClass(r.difference)}`}
        />
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-ink-soft">Vendas</span>
          <span className="tabular-nums text-ink">
            {r.sales_count} · {formatCurrency(r.sales_revenue)}
          </span>
        </div>
        {r.payments.length > 0 && (
          <p className="text-xs text-ink-secondary">
            {r.payments.map((p) => `${PAYMENT_LABEL[p.method]} ${formatCurrency(p.amount)}`).join(' · ')}
          </p>
        )}
        {(r.sangria_total > 0 || r.suprimento_total > 0) && (
          <p className="text-xs text-ink-secondary">
            Sangrias −{formatCurrency(r.sangria_total)} · Suprimentos +{formatCurrency(r.suprimento_total)}
          </p>
        )}
      </div>
    </Card>
  )
}
