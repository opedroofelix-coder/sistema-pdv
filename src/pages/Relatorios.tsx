import { getErrorMessage } from '../lib/errors'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { NuvemshopSection } from '../components/reports/NuvemshopSection'
import { SkeletonRows } from '../components/ui/Skeleton'
import { getCatalogHitRateReport, getIntegrationHealth } from '../lib/reports'
import { formatDateTime } from '../lib/format'
import type {
  CatalogHitRateReport,
  CatalogLookupSource,
  IntegrationHealth,
  IntegrationHealthStatus,
  ProductOrigin,
} from '../lib/types'
import { PageHeader } from '../components/layout/PageHeader'

/**
 * Tela de diagnóstico das APIs de catálogo, exibida como "Integrações"
 * (decisão #49). As três seções de negócio que moravam aqui -- Vendas, Margem
 * por lote e Estoque parado -- passaram pro Dashboard; sobraram as duas de
 * diagnóstico. A rota continua `/relatorios` de propósito, pra não quebrar
 * link salvo: mudaram só o rótulo do menu, o título e o ícone.
 */
export function Relatorios() {
  const { profile } = useAuth()

  // Restrito ao dono (Branch 2, item 6): caixa cai no PDV, estoquista nos
  // Lotes -- mesmo padrão de redirect por papel do Dashboard (decisão #14).
  // ProtectedRoute já espera o perfil carregar antes de montar esta tela,
  // então `profile` aqui nunca é null-ainda-carregando.
  if (profile?.role === 'caixa') {
    return <Navigate to="/pdv" replace />
  }
  if (profile?.role === 'estoquista') {
    return <Navigate to="/lotes" replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Integrações" />
      <IntegrationHealthSection />
      <NuvemshopSection />
      <CatalogHitRateSection />
    </div>
  )
}

const HEALTH_STATUS_LABEL: Record<IntegrationHealthStatus, string> = {
  operacional: 'Operacional',
  erro_recente: 'Erro de infra recente',
  sem_atividade: 'Sem atividade recente',
  acesso_restrito: 'Acesso restrito por política',
}

/** `acesso_restrito` (Mercado Livre) usa a cor de alerta, não a de erro --
 * é um bloqueio de política do ML, não uma falha de infra do nosso lado
 * (CLAUDE.md decisão #22). */
const HEALTH_STATUS_CLASS: Record<IntegrationHealthStatus, string> = {
  operacional: 'bg-success/10 text-success',
  erro_recente: 'bg-danger/10 text-danger',
  sem_atividade: 'bg-surface text-ink-soft',
  acesso_restrito: 'bg-warning/10 text-warning',
}

function IntegrationHealthSection() {
  const [rows, setRows] = useState<IntegrationHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getIntegrationHealth()
      .then(setRows)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar painel de saúde.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <h2 className="mb-1 text-[17px] font-bold tracking-tight text-ink">Saúde das integrações de catálogo</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Status por fonte externa nos últimos 7 dias, derivado de `catalog_lookup_log`.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                <th className="py-2 pr-3">Fonte</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Detalhe</th>
                <th className="py-2 pr-3">Último evento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="py-2 pr-3 text-ink">{row.label}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${HEALTH_STATUS_CLASS[row.status]}`}
                    >
                      {HEALTH_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-ink-secondary">{row.detail}</td>
                  <td className="py-2 pr-3 text-ink-secondary">
                    {row.lastEventAt ? formatDateTime(row.lastEventAt) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const SOURCE_LABEL: Record<CatalogLookupSource, string> = {
  cache: 'Cache',
  cosmos: 'Cosmos',
  upcitemdb: 'UPCitemdb',
  openbeautyfacts: 'Open Beauty Facts',
  off: 'Open Food Facts',
}

const ORIGIN_LABEL: Record<'nacional' | 'importado' | 'sem_origem', string> = {
  nacional: 'Nacional',
  importado: 'Importado',
  sem_origem: 'Sem origem',
}

function originLabel(origin: ProductOrigin | null): string {
  return ORIGIN_LABEL[origin ?? 'sem_origem']
}

function CatalogHitRateSection() {
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<CatalogHitRateReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getCatalogHitRateReport(days)
      .then(setReport)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar relatório.')))
      .finally(() => setLoading(false))
  }, [days])

  const totalCacheHits = report?.daily.reduce((sum, d) => sum + d.cacheHits, 0) ?? 0
  const totalNewEans = report?.daily.reduce((sum, d) => sum + d.newEans, 0) ?? 0
  const overallCacheHitPct =
    totalCacheHits + totalNewEans > 0 ? (totalCacheHits / (totalCacheHits + totalNewEans)) * 100 : 0

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[17px] font-bold tracking-tight text-ink">Taxa de acerto do catálogo</h2>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          Período (dias)
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 1)}
            className="w-16 field field-sm"
          />
        </label>
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Consultas consumidas por API (cada linha é uma chamada real, mesmo quando a fonte não achou o
        produto) e % de cache hit — use pra dimensionar os planos (CLAUDE.md).
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : !report || report.bySourceOrigin.length === 0 ? (
        <p className="text-sm text-ink-soft">Sem consultas de catálogo no período.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink">
            {totalNewEans + totalCacheHits} consulta(s) no período · {overallCacheHitPct.toFixed(1)}% em
            cache
          </p>

          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-3">Fonte</th>
                  <th className="py-2 pr-3">Origem</th>
                  <th className="py-2 pr-3">Acertos</th>
                  <th className="py-2 pr-3">Não achou</th>
                  <th className="py-2 pr-3">Erro de infra</th>
                  <th className="py-2 pr-3">Consultas</th>
                </tr>
              </thead>
              <tbody>
                {report.bySourceOrigin.map((stat) => {
                  const total = stat.hits + stat.misses + stat.errors
                  return (
                    <tr key={`${stat.source}|${stat.origin ?? ''}`} className="border-b border-border">
                      <td className="py-2 pr-3 text-ink">{SOURCE_LABEL[stat.source]}</td>
                      <td className="py-2 pr-3 text-ink-secondary">{originLabel(stat.origin)}</td>
                      <td className="py-2 pr-3 text-ink-secondary">{stat.hits}</td>
                      <td className="py-2 pr-3 text-ink-secondary">{stat.misses}</td>
                      <td className="py-2 pr-3 text-ink-secondary">
                        {stat.errors > 0 ? <span className="text-warning">{stat.errors}</span> : stat.errors}
                      </td>
                      <td className="py-2 pr-3 font-medium text-ink">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-3">Dia</th>
                  <th className="py-2 pr-3">EANs inéditos</th>
                  <th className="py-2 pr-3">Cache hits</th>
                  <th className="py-2 pr-3">% cache</th>
                </tr>
              </thead>
              <tbody>
                {report.daily.map((d) => (
                  <tr key={d.day} className="border-b border-border">
                    <td className="py-2 pr-3 text-ink">{d.day}</td>
                    <td className="py-2 pr-3 text-ink-secondary">{d.newEans}</td>
                    <td className="py-2 pr-3 text-ink-secondary">{d.cacheHits}</td>
                    <td className="py-2 pr-3 text-ink-secondary">{d.cacheHitPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
