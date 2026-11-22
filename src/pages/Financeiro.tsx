import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { SkeletonKpis, SkeletonPanel } from '../components/ui/Skeleton'
import { IconButton } from '../components/ui/IconButton'
import { PageHeader } from '../components/layout/PageHeader'
import { FinanceResumo } from '../components/finance/FinanceResumo'
import { FinanceContas } from '../components/finance/FinanceContas'
import { FinanceFluxo } from '../components/finance/FinanceFluxo'
import { FinanceConfig } from '../components/finance/FinanceConfig'
import { getErrorMessage } from '../lib/errors'
import {
  generateRecurring,
  listCategories,
  monthLabel,
  monthRange,
  shiftMonth,
  todayKey,
  type FinanceCategory,
} from '../lib/finance'

type Tab = 'resumo' | 'contas' | 'fluxo' | 'config'

const TABS: { value: Tab; label: string }[] = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'contas', label: 'Contas a pagar' },
  { value: 'fluxo', label: 'Fluxo de caixa' },
  { value: 'config', label: 'Configurações' },
]

/**
 * Módulo financeiro (decisão #72): lucro líquido do mês, contas a pagar,
 * fluxo de caixa e configurações (taxas, despesas fixas, saldo inicial).
 * Só dono -- mesmo redirect por papel de /fechamentos e /usuarios; as tabelas
 * novas também têm RLS só-dono (migration 0022).
 */
export function Financeiro() {
  const { profile } = useAuth()

  if (profile?.role === 'caixa') return <Navigate to="/pdv" replace />
  if (profile?.role === 'estoquista') return <Navigate to="/lotes" replace />

  return <FinanceiroDono />
}

function FinanceiroDono() {
  const [tab, setTab] = useState<Tab>('resumo')
  const [month, setMonth] = useState(() => monthRange(todayKey()).from)
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Incrementa quando algo muda (conta paga, taxa salva...) pra as abas
  // recarregarem sem cada uma precisar saber das outras.
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const reloadCategories = useCallback(async () => {
    setCategories(await listCategories())
  }, [])

  // Antes de mostrar qualquer número: gera as contas das despesas fixas até o
  // mês seguinte (idempotente, decisão #72 -- sem cron).
  useEffect(() => {
    Promise.all([generateRecurring(), reloadCategories()])
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar o financeiro.')))
      .finally(() => setReady(true))
  }, [reloadCategories])

  const showMonth = tab !== 'config'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Financeiro"
        actions={
          showMonth && (
            <div className="flex items-center gap-2">
              <IconButton aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
                <ChevronLeft size={18} />
              </IconButton>
              <span className="min-w-36 text-center text-sm font-semibold text-ink" data-testid="finance-month">
                {monthLabel(month)}
              </span>
              <IconButton aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                <ChevronRight size={18} />
              </IconButton>
            </div>
          )
        }
      />

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors ${
              tab === t.value
                ? 'border-primary font-semibold text-ink'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!ready ? (
        <div className="flex flex-col gap-5">
          <SkeletonKpis label="Carregando financeiro…" />
          <SkeletonPanel title={false} rows={5} />
        </div>
      ) : (
        <>
          {tab === 'resumo' && (
            <FinanceResumo
              month={month}
              categories={categories}
              version={version}
              onOpenContas={() => setTab('contas')}
            />
          )}
          {tab === 'contas' && (
            <FinanceContas month={month} categories={categories} version={version} onChanged={bump} />
          )}
          {tab === 'fluxo' && <FinanceFluxo month={month} version={version} />}
          {tab === 'config' && (
            <FinanceConfig
              categories={categories}
              onCategoriesChanged={reloadCategories}
              onChanged={bump}
            />
          )}
        </>
      )}
    </div>
  )
}
