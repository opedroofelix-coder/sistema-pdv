import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { SkeletonKpis } from '../ui/Skeleton'
import { useToast } from '../../contexts/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { formatCurrency, formatDateTime } from '../../lib/format'
import {
  getConnection,
  getConnectUrl,
  getTodaySiteSales,
  listLinks,
  listOpenIssues,
  listPendingCatalog,
  resolveIssue,
  syncNow,
  type NuvemshopConnection,
  type OrderIssue,
} from '../../lib/nuvemshop'

interface Summary {
  linked: number
  created: number
  pending: number
  errors: number
  lastSyncedAt: string | null
  today: { count: number; total: number }
  issues: OrderIssue[]
}

const ISSUE_LABEL: Record<OrderIssue['kind'], string> = {
  sem_estoque: 'faltou estoque',
  nao_vinculado: 'produto sem vínculo',
}

/**
 * Card "Nuvemshop" em Integrações (decisão #66, tela 1 do mockup aprovado):
 * conexão, contadores do vínculo, último envio de saldo, pedidos do site hoje
 * e pedidos com problema. A revisão item a item fica em /relatorios/nuvemshop.
 */
export function NuvemshopSection() {
  const { showToast } = useToast()
  const [connection, setConnection] = useState<NuvemshopConnection | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const conn = await getConnection()
      setConnection(conn)
      if (!conn) {
        setSummary(null)
        return
      }
      const [links, pending, today, issues] = await Promise.all([
        listLinks(),
        listPendingCatalog(),
        getTodaySiteSales(),
        listOpenIssues(),
      ])
      const lastSyncedAt = links.reduce<string | null>(
        (max, l) => (l.last_synced_at && (!max || l.last_synced_at > max) ? l.last_synced_at : max),
        null,
      )
      setSummary({
        linked: links.filter((l) => l.origin === 'linked').length,
        created: links.filter((l) => l.origin === 'created').length,
        pending: pending.filter((p) => p.choice !== 'review').length,
        errors: links.filter((l) => l.last_error).length + pending.filter((p) => p.choice === 'review').length,
        lastSyncedAt,
        today,
        issues,
      })
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar a integração com a Nuvemshop.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Volta do OAuth: a function redireciona pra cá com ?nuvemshop=conectado|erro.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('nuvemshop')
    if (!status) return
    if (status === 'conectado') {
      showToast('Loja conectada. Revise os vínculos antes de criar produtos no site.', 'success')
    } else {
      showToast(params.get('mensagem') ?? 'Não foi possível conectar a loja.', 'error')
    }
    params.delete('nuvemshop')
    params.delete('mensagem')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [showToast])

  async function handleConnect() {
    setBusy('connect')
    try {
      window.location.href = await getConnectUrl()
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao gerar o link de conexão.'), 'error')
      setBusy(null)
    }
  }

  async function handleSync() {
    setBusy('sync')
    try {
      const result = await syncNow()
      showToast(
        `Sincronizado: ${result.products} produto(s) no site, ${result.linked} vínculo(s) novo(s).`,
        'success',
      )
      await refresh()
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao sincronizar.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleResolve(issue: OrderIssue) {
    try {
      await resolveIssue(issue.id)
      setSummary((prev) => prev && { ...prev, issues: prev.issues.filter((i) => i.id !== issue.id) })
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao marcar como resolvido.'), 'error')
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Nuvemshop</h2>
          {connection && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-bold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Conectada
            </span>
          )}
        </div>
        {connection && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleSync} disabled={busy !== null}>
              {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar agora'}
            </Button>
            <Link to="/relatorios/nuvemshop" className="text-sm font-bold text-primary hover:underline">
              Revisar vínculos →
            </Link>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="mt-3">
          <SkeletonKpis count={3} className="grid gap-3 sm:grid-cols-3" label="Carregando Nuvemshop…" />
        </div>
      ) : !connection ? (
        <div className="mt-2 flex flex-col items-start gap-3">
          <p className="max-w-prose text-sm text-ink-secondary">
            Conecte a loja pra o site usar o mesmo estoque daqui: cada venda, recebimento ou ajuste
            atualiza o saldo no site, e o pedido pago no site vira venda aqui.
          </p>
          <Button onClick={handleConnect} disabled={busy !== null}>
            {busy === 'connect' ? 'Abrindo…' : 'Conectar loja'}
          </Button>
        </div>
      ) : summary ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Counter label="Vinculados" value={summary.linked} sub="já existiam no site" />
            <Counter label="Criados pelo sistema" value={summary.created} sub="não existiam lá" />
            <Counter
              label="Aguardando vínculo"
              value={summary.pending}
              sub={connection.auto_create ? 'na fila pra criar' : 'sem código de barras igual'}
              tone={summary.pending > 0 ? 'warning' : undefined}
              to="/relatorios/nuvemshop"
            />
            <Counter
              label="Com erro"
              value={summary.errors}
              sub="ver motivo"
              tone={summary.errors > 0 ? 'danger' : undefined}
              to="/relatorios/nuvemshop"
            />
          </div>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-soft">Loja</dt>
            <dd className="min-w-0 truncate text-ink">
              {connection.store_url ? (
                <a href={connection.store_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {connection.store_name ?? connection.store_url}
                </a>
              ) : (
                (connection.store_name ?? `Loja ${connection.store_id}`)
              )}
            </dd>
            <dt className="text-ink-soft">Último envio de saldo</dt>
            <dd className="text-ink">{summary.lastSyncedAt ? formatDateTime(summary.lastSyncedAt) : '—'}</dd>
            <dt className="text-ink-soft">Pedidos do site hoje</dt>
            <dd className="text-ink">
              {summary.today.count} pedido{summary.today.count === 1 ? '' : 's'} · {formatCurrency(summary.today.total)}
            </dd>
          </dl>

          {summary.issues.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Pedidos com problema</h3>
              {summary.issues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm"
                >
                  <span className="text-warning">
                    Pedido {issue.external_order_number ? `#${issue.external_order_number}` : ''} ·{' '}
                    {ISSUE_LABEL[issue.kind]} em "{issue.item_name ?? 'item'}"
                    {issue.quantity ? ` (${issue.quantity} un.)` : ''}
                  </span>
                  <Button variant="ghost" onClick={() => handleResolve(issue)}>
                    Marcar resolvido
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </Card>
  )
}

function Counter({
  label,
  value,
  sub,
  tone,
  to,
}: {
  label: string
  value: number
  sub: string
  tone?: 'warning' | 'danger'
  to?: string
}) {
  const valueClass = tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-ink'
  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-xs text-ink-soft">{sub}</div>
    </>
  )
  return to && value > 0 ? (
    <Link to={to} className="rounded-xl bg-surface-secondary px-3 py-2.5 hover:bg-border">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl bg-surface-secondary px-3 py-2.5">{body}</div>
  )
}
