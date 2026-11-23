import { getErrorMessage } from '../lib/errors'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { SkeletonKpis } from '../components/ui/Skeleton'
import { SalesSection } from '../components/reports/SalesSection'
import { LotMarginSection } from '../components/reports/LotMarginSection'
import { StockTotalsSection } from '../components/reports/StockTotalsSection'
import { ChannelSplit } from '../components/reports/ChannelSplit'
import { useAuth } from '../contexts/AuthContext'
import {
  getDashboardStats,
  getExpiringStockItems,
  type DashboardStats,
  type ExpiringStockItem,
} from '../lib/dashboard'
import { formatCurrency } from '../lib/format'
import { PAYMENT_LABEL } from '../lib/sales'
import type { RecordedPaymentMethod } from '../lib/types'
import { Badge } from '../components/ui/Badge'
import { PageHeader } from '../components/layout/PageHeader'
import { NumberTicker } from '../components/ui/NumberTicker'

export function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [expiring, setExpiring] = useState<ExpiringStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getDashboardStats(), getExpiringStockItems()])
      .then(([dashboardStats, expiringItems]) => {
        setStats(dashboardStats)
        setExpiring(expiringItems)
      })
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar dashboard.')))
      .finally(() => setLoading(false))
  }, [])

  // Dashboard é restrito ao papel "dono" (CLAUDE.md); cada papel tem sua
  // tela inicial: caixa cai direto no PDV, estoquista no recebimento
  // (Lotes). ProtectedRoute já espera o perfil carregar antes de montar
  // esta tela, então `profile` aqui nunca é null-ainda-carregando.
  if (profile?.role === 'caixa') {
    return <Navigate to="/pdv" replace />
  }
  if (profile?.role === 'estoquista') {
    return <Navigate to="/lotes" replace />
  }

  // Vendas, Margem por lote e Estoque vieram de `/relatorios` (decisão #49;
  // o bloco de estoque virou totais fixos na #50) e ficam FORA do
  // `loading`/`stats` desta tela de propósito:
  // cada uma tem consulta e estado de carregamento próprios, então o
  // dashboard aparece por partes em vez de esperar tudo -- e uma falha em
  // `getDashboardStats` não apaga as três seções junto.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <SkeletonKpis glass className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" label="Carregando vendas…" />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard i={0} label="Vendas hoje" value={stats.todayTotal} format={formatCurrency} sub={`${stats.todayCount} venda${stats.todayCount === 1 ? '' : 's'}`}>
            <ChannelSplit total={stats.todayTotal} site={stats.todaySiteTotal} />
          </StatCard>
          <StatCard i={1} label="Vendas no mês" value={stats.monthTotal} format={formatCurrency} sub={`${stats.monthCount} venda${stats.monthCount === 1 ? '' : 's'}`}>
            <ChannelSplit total={stats.monthTotal} site={stats.monthSiteTotal} />
          </StatCard>
          <StatCard i={2} label="Ticket médio" value={stats.avgTicket} format={formatCurrency} sub="no mês" />
          <StatCard
            i={3}
            label="Forma mais usada"
            value={
              Object.entries(stats.byPaymentMethod).sort((a, b) => b[1] - a[1])[0]
                ? PAYMENT_LABEL[Object.entries(stats.byPaymentMethod).sort((a, b) => b[1] - a[1])[0][0] as RecordedPaymentMethod]
                : '-'
            }
            sub="no mês"
          />
        </div>
      ) : null}

      <SalesSection />

      {!loading && expiring.length > 0 && (
        <div className="overflow-hidden rounded-panel glass glass-blur">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-[15px] font-bold text-ink">Itens vencendo</h2>
            <Link to="/estoque?vencendo=1" className="text-[13px] font-bold text-primary hover:underline">
              Ver estoque
            </Link>
          </div>
          {expiring.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm last:border-b-0"
            >
              <span className="font-semibold text-ink">
                {item.name} — {item.quantityAvailable} un
              </span>
              <Badge tone={item.daysLeft < 0 ? 'danger' : 'warning'}>
                {item.daysLeft < 0
                  ? `vencido há ${Math.abs(item.daysLeft)} dias`
                  : item.daysLeft === 0
                    ? 'vence hoje'
                    : `vence em ${item.daysLeft} dias`}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {!loading && stats && (
        <Card>
          <h2 className="mb-3 text-[17px] font-bold tracking-tight text-ink">Formas de pagamento (mês)</h2>
          {Object.keys(stats.byPaymentMethod).length === 0 ? (
            <p className="text-sm text-ink-soft">Nenhuma venda no mês ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(Object.entries(stats.byPaymentMethod) as [RecordedPaymentMethod, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([method, total]) => (
                  <div key={method} className="flex items-center justify-between text-sm">
                    <span className="text-ink-secondary">{PAYMENT_LABEL[method]}</span>
                    <span className="font-bold tabular-nums text-ink">{formatCurrency(total)}</span>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}

      <StockTotalsSection />
      <LotMarginSection />
    </div>
  )
}

function StatCard({
  label,
  value,
  format,
  sub,
  i = 0,
  children,
}: {
  label: string
  /** Número com `format` conta até o valor (Number Ticker); texto aparece direto. */
  value: number | string
  format?: (n: number) => string
  sub: string
  i?: number
  children?: ReactNode
}) {
  return (
    <Card className="blur-fade px-5 py-4" style={{ ['--i' as string]: i }}>
      <p className="text-[13px] font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.03em] tabular-nums text-ink">
        {typeof value === 'number' && format ? <NumberTicker value={value} format={format} /> : value}
      </p>
      <p className="mt-0.5 text-[13px] font-medium text-ink-soft">{sub}</p>
      {children}
    </Card>
  )
}
