import { getErrorMessage } from '../lib/errors'
import { KeyRound } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { SkeletonRows } from '../components/ui/Skeleton'
import { useAuth } from '../contexts/AuthContext'
import {
  listAdminUsers,
  getUserActivity,
  setUserPassword,
  setUserAccess,
  activityPeriodRange,
  type ActivityPeriod,
  type AdminUser,
  type UserActivity,
} from '../lib/admin'
import { formatDate } from '../lib/format'
import { ProductHistorySection } from '../components/admin/ProductHistorySection'
import { PageHeader } from '../components/layout/PageHeader'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Badge } from '../components/ui/Badge'

export function Usuarios() {
  const { profile } = useAuth()

  // Só-dono, mesmo padrão do Dashboard/Relatórios (decisões #14/#38).
  if (profile?.role === 'caixa') return <Navigate to="/pdv" replace />
  if (profile?.role === 'estoquista') return <Navigate to="/lotes" replace />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Usuários" />
      <UsersSection currentUserId={profile?.id ?? ''} />
      <ProductHistorySection />
    </div>
  )
}

/** Filtro de período (decisão #69), mesmo visual dos atalhos da seção Vendas
 * do Dashboard. Abre em Mês (escolha do dono). */
const PERIODS: { value: ActivityPeriod; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'mes', label: 'Mês' },
  { value: 'ano', label: 'Ano' },
  { value: 'tudo', label: 'Tudo' },
]

function periodLabel(period: ActivityPeriod): string {
  const range = activityPeriodRange(period, new Date())
  if (!range) return 'Desde o início'
  if (range.from === range.to) return `Período: ${formatDate(range.from)}`
  return `Período: ${formatDate(range.from)} a ${formatDate(range.to)}`
}

function UsersSection({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [activity, setActivity] = useState<Record<string, UserActivity>>({})
  const [period, setPeriod] = useState<ActivityPeriod>('mes')
  const [activityLoading, setActivityLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [pwEditingId, setPwEditingId] = useState<string | null>(null)
  const [pwValue, setPwValue] = useState('')

  // A lista de usuários carrega uma vez; a contagem recarrega a cada troca de
  // período, sem piscar a tabela inteira.
  useEffect(() => {
    listAdminUsers()
      .then(setUsers)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar usuários.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    setActivityLoading(true)
    getUserActivity(period)
      .then((act) => {
        if (!cancelled) setActivity(act)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Erro ao carregar a atividade dos usuários.'))
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })
    // Troca rápida de período: só a última resposta vale.
    return () => {
      cancelled = true
    }
  }, [period])

  async function handleSavePassword(userId: string) {
    setBusyId(userId)
    setError(null)
    try {
      await setUserPassword(userId, pwValue)
      setPwEditingId(null)
      setPwValue('')
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao trocar a senha.'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleAccess(user: AdminUser) {
    setBusyId(user.id)
    setError(null)
    try {
      await setUserAccess(user.id, !user.active)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: !u.active } : u)))
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao alterar o acesso.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-[17px] font-bold tracking-tight text-ink">Usuários</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Trocar senha e ativar/desativar acesso. "Cadastrados" conta itens de estoque criados pelo
        usuário no período; "Vendidos" conta unidades vendidas por ele no período.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl aria-label="Período" options={PERIODS} value={period} onChange={setPeriod} />
        <span className="ml-1 text-xs font-semibold text-ink-soft">{periodLabel(period)}</span>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <SkeletonRows rows={4} label="Carregando usuários…" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                <th className="py-2 pr-3">Usuário</th>
                <th className="py-2 pr-3">Papel</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Cadastrados</th>
                <th className="py-2 pr-3 text-right">Vendidos</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const act = activity[user.id] ?? { registered: 0, sold: 0 }
                const isSelf = user.id === currentUserId
                const busy = busyId === user.id
                return (
                  <Fragment key={user.id}>
                    <tr className="border-b border-border">
                      <td className="py-3 pr-3">
                        <div className="font-bold text-ink">{user.full_name ?? '—'}</div>
                        <div className="text-xs text-ink-soft">{user.email ?? '—'}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={user.role === 'dono' ? 'primary' : 'neutral'}>{user.role ?? '—'}</Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={user.active ? 'success' : 'danger'} dot>
                          {user.active ? 'Ativo' : 'Desativado'}
                        </Badge>
                      </td>
                      <td
                        className={`py-3 pr-3 text-right font-bold tabular-nums text-ink ${activityLoading ? 'opacity-40' : ''}`}
                      >
                        {act.registered}
                      </td>
                      <td
                        className={`py-3 pr-3 text-right font-bold tabular-nums text-ink ${activityLoading ? 'opacity-40' : ''}`}
                      >
                        {act.sold}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              setPwEditingId(pwEditingId === user.id ? null : user.id)
                              setPwValue('')
                            }}
                          >
                            <KeyRound size={15} />
                            Trocar senha
                          </Button>
                          {isSelf ? (
                            <span className="text-xs font-semibold text-ink-soft">você</span>
                          ) : (
                            <Button
                              size="sm"
                              variant={user.active ? 'danger' : 'secondary'}
                              disabled={busy}
                              onClick={() => handleToggleAccess(user)}
                            >
                              {user.active ? 'Desativar' : 'Reativar'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {pwEditingId === user.id && (
                      <tr className="border-b border-border bg-surface-secondary/60">
                        <td colSpan={6} className="py-3">
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="w-64">
                              <Input
                                id={`pw-${user.id}`}
                                type="password"
                                label={`Nova senha para ${user.full_name ?? user.email ?? 'usuário'}`}
                                placeholder="Mínimo 6 caracteres"
                                autoFocus
                                value={pwValue}
                                onChange={(e) => setPwValue(e.target.value)}
                              />
                            </div>
                            <Button
                              type="button"
                              disabled={busy || pwValue.length < 6}
                              onClick={() => handleSavePassword(user.id)}
                            >
                              {busy ? 'Salvando…' : 'Salvar senha'}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setPwEditingId(null)
                                setPwValue('')
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
