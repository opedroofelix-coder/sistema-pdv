import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Receipt, Repeat, Trash2 } from 'lucide-react'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { CurrencyInput } from '../ui/CurrencyInput'
import { Input } from '../ui/Input'
import { SkeletonPanel } from '../ui/Skeleton'
import { useToast } from '../../contexts/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import {
  createExpense,
  daysBetween,
  deleteExpense,
  EXPENSE_PAID_METHOD_LABEL,
  expenseStatus,
  listExpensesForMonth,
  markExpensePaid,
  monthRange,
  todayKey,
  updateExpense,
  type ExpenseInput,
  type ExpensePaidMethod,
  type ExpenseStatus,
  type FinanceCategory,
  type FinanceExpense,
} from '../../lib/finance'

type Filter = 'abertas' | 'pagas' | 'todas'

const SELECT_CLASS = 'field w-full'

function shortDate(key: string): string {
  return formatDate(key).slice(0, 5)
}

function StatusPill({ expense, today }: { expense: FinanceExpense; today: string }) {
  const status: ExpenseStatus = expenseStatus(expense, today)
  let label: string
  let tone: BadgeTone
  if (status === 'paga') {
    const method = expense.paid_method ? ` · ${EXPENSE_PAID_METHOD_LABEL[expense.paid_method]}` : ''
    label = `Paga em ${shortDate(expense.paid_at!)}${method}`
    tone = 'success'
  } else if (status === 'vencida') {
    const d = daysBetween(expense.due_date, today)
    label = `Vencida há ${d} ${d === 1 ? 'dia' : 'dias'}`
    tone = 'danger'
  } else if (status === 'vence_em_breve') {
    const d = daysBetween(today, expense.due_date)
    label = d === 0 ? 'Vence hoje' : `Vence em ${d} ${d === 1 ? 'dia' : 'dias'}`
    tone = 'warning'
  } else {
    label = 'Em aberto'
    tone = 'neutral'
  }
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}

export function FinanceContas({
  month,
  categories,
  version,
  onChanged,
}: {
  month: string
  categories: FinanceCategory[]
  version: number
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('abertas')
  const [editing, setEditing] = useState<FinanceExpense | 'new' | null>(null)
  const [paying, setPaying] = useState<FinanceExpense | null>(null)
  const [deleting, setDeleting] = useState<FinanceExpense | null>(null)
  const [busy, setBusy] = useState(false)
  const today = todayKey()

  useEffect(() => {
    let stale = false
    setLoading(true)
    setError(null)
    listExpensesForMonth(month)
      .then((rows) => !stale && setExpenses(rows))
      .catch((err) => !stale && setError(getErrorMessage(err, 'Erro ao carregar as contas.')))
      .finally(() => !stale && setLoading(false))
    return () => {
      stale = true
    }
  }, [month, version])

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const openCount = expenses.filter((e) => !e.paid_at).length
  const paidCount = expenses.length - openCount
  const visible = expenses.filter((e) =>
    filter === 'todas' ? true : filter === 'pagas' ? !!e.paid_at : !e.paid_at,
  )

  async function handleUndoPaid(e: FinanceExpense) {
    try {
      await markExpensePaid(e.id, null, null)
      showToast('Pagamento desfeito.', 'success')
      onChanged()
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao desfazer o pagamento.'), 'error')
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteExpense(deleting.id)
      showToast('Conta excluída.', 'success')
      setDeleting(null)
      onChanged()
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao excluir a conta.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'abertas', label: `Em aberto · ${openCount}` },
    { value: 'pagas', label: `Pagas · ${paidCount}` },
    { value: 'todas', label: 'Todas' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Filtrar contas"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus size={16} /> Nova despesa
        </Button>
      </div>

      {loading ? (
        <SkeletonPanel title={false} rows={5} label="Carregando contas…" />
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Receipt size={22} />}
          title={filter === 'pagas' ? 'Nenhuma conta paga neste mês' : 'Nenhuma conta em aberto neste mês'}
          description="Use “Nova despesa” para lançar aluguel, luz, salários e outras contas."
        />
      ) : (
        <div className="overflow-x-auto rounded-panel glass glass-blur">
          <table className="w-full min-w-[720px] text-sm" data-testid="finance-expenses">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-secondary">
                <th className="px-4 py-3 font-semibold">Vencimento</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Situação</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className={`border-t border-border ${e.paid_at ? 'text-ink-soft' : 'text-ink'}`}>
                  <td className="px-4 py-3 tabular-nums">{shortDate(e.due_date)}</td>
                  <td className="px-4 py-3">
                    {e.description}
                    {e.recurring_id && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-ink-soft" title="Despesa fixa">
                        <Repeat size={12} aria-hidden="true" /> mensal
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {e.category_id ? (catName.get(e.category_id) ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(Number(e.amount))}</td>
                  <td className="px-4 py-3">
                    <StatusPill expense={e} today={today} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {e.paid_at ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleUndoPaid(e)}>
                          Desfazer
                        </Button>
                      ) : (
                        <Button type="button" variant="secondary" size="sm" onClick={() => setPaying(e)}>
                          Marcar como paga
                        </Button>
                      )}
                      <IconButton
                        look="plain"
                        size="sm"
                        aria-label={`Editar ${e.description}`}
                        onClick={() => setEditing(e)}
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton
                        look="plain"
                        size="sm"
                        tone="danger"
                        aria-label={`Excluir ${e.description}`}
                        onClick={() => setDeleting(e)}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        Despesas fixas (mensal) aparecem sozinhas todo mês, sempre com um mês de antecedência. Contas de meses
        anteriores que ainda não foram pagas continuam aparecendo em “Em aberto”.
      </p>

      {editing && (
        <ExpenseModal
          month={month}
          categories={categories}
          expense={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            showToast(msg, 'success')
            onChanged()
          }}
        />
      )}
      {paying && (
        <PayModal
          expense={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null)
            showToast('Conta marcada como paga.', 'success')
            onChanged()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Excluir conta?"
          message={
            deleting.recurring_id
              ? `“${deleting.description}” sai só deste mês. A despesa fixa continua gerando os próximos meses — para parar, desative em Configurações.`
              : `“${deleting.description}” será excluída.`
          }
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: nova despesa / editar
// ---------------------------------------------------------------------------

function ExpenseModal({
  month,
  categories,
  expense,
  onClose,
  onSaved,
}: {
  month: string
  categories: FinanceCategory[]
  expense: FinanceExpense | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isNew = expense === null
  const today = todayKey()
  const defaultDue = monthRange(month).from <= today && today <= monthRange(month).to ? today : monthRange(month).from
  const [description, setDescription] = useState(expense?.description ?? '')
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? '')
  const [amount, setAmount] = useState(expense ? Number(expense.amount).toFixed(2) : '')
  const [competence, setCompetence] = useState((expense?.competence_month ?? month).slice(0, 7))
  const [dueDate, setDueDate] = useState(expense?.due_date ?? defaultDue)
  const [repeat, setRepeat] = useState(false)
  const [alreadyPaid, setAlreadyPaid] = useState(false)
  const [paidMethod, setPaidMethod] = useState<ExpensePaidMethod>('pix')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeCategories = categories.filter((c) => c.active || c.id === expense?.category_id)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const input: ExpenseInput = {
      description,
      category_id: categoryId || null,
      amount: Number(amount),
      competence_month: `${competence}-01`,
      due_date: dueDate,
      paid_at: isNew ? (alreadyPaid ? today : null) : expense.paid_at,
      paid_method: isNew ? (alreadyPaid ? paidMethod : null) : expense.paid_method,
    }
    try {
      if (isNew) {
        await createExpense(input, repeat)
        onSaved(repeat ? 'Despesa fixa criada.' : 'Despesa lançada.')
      } else {
        await updateExpense(expense.id, input)
        onSaved('Conta atualizada.')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao salvar a despesa.'))
      setSaving(false)
    }
  }

  const repeatDay = Math.min(Number(dueDate.slice(8, 10)) || 1, 28)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto modal-backdrop p-4 pt-16">
      <Card raised className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-label={isNew ? 'Nova despesa' : 'Editar conta'}>
          <h2 className="text-lg font-semibold text-ink">{isNew ? 'Nova despesa' : 'Editar conta'}</h2>
          <Input
            id="exp-desc"
            label="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Aluguel da loja"
            autoFocus
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="exp-cat" className="text-sm font-medium text-ink-secondary">
                Categoria
              </label>
              <select
                id="exp-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Sem categoria</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <CurrencyInput id="exp-amount" label="Valor" value={amount} onValueChange={setAmount} />
            <Input
              id="exp-competence"
              type="month"
              label="Referente ao mês"
              value={competence}
              onChange={(e) => setCompetence(e.target.value)}
              required
            />
            <Input
              id="exp-due"
              type="date"
              label="Vencimento"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>

          {isNew && (
            <>
              <label className="flex items-start gap-3 rounded-xl bg-surface-secondary p-3 text-sm">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <strong className="text-ink">Repetir todo mês</strong>
                  <span className="block text-xs text-ink-secondary">
                    Vence todo dia {repeatDay}. Para de gerar quando você desativar em Configurações.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={alreadyPaid}
                  onChange={(e) => setAlreadyPaid(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Já está paga (hoje)
              </label>
              {alreadyPaid && (
                <PaidMethodSelect id="exp-paid-method" value={paidMethod} onChange={setPaidMethod} />
              )}
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Salvando…' : isNew ? 'Salvar despesa' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function PaidMethodSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: ExpensePaidMethod
  onChange: (v: ExpensePaidMethod) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink-secondary">
        Pago com
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as ExpensePaidMethod)}
        className={SELECT_CLASS}
      >
        {(Object.keys(EXPENSE_PAID_METHOD_LABEL) as ExpensePaidMethod[]).map((m) => (
          <option key={m} value={m}>
            {EXPENSE_PAID_METHOD_LABEL[m]}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: marcar como paga
// ---------------------------------------------------------------------------

function PayModal({
  expense,
  onClose,
  onSaved,
}: {
  expense: FinanceExpense
  onClose: () => void
  onSaved: () => void
}) {
  const [paidAt, setPaidAt] = useState(todayKey())
  const [method, setMethod] = useState<ExpensePaidMethod>('pix')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!paidAt) {
      setError('Informe a data do pagamento.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await markExpensePaid(expense.id, paidAt, method)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao marcar como paga.'))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
      <Card raised className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-label="Marcar como paga">
          <div>
            <h2 className="text-lg font-semibold text-ink">Marcar como paga</h2>
            <p className="text-sm text-ink-secondary">
              {expense.description} · {formatCurrency(Number(expense.amount))}
            </p>
          </div>
          <Input
            id="pay-date"
            type="date"
            label="Pago em"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            required
          />
          <PaidMethodSelect id="pay-method" value={method} onChange={setMethod} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Salvando…' : 'Confirmar pagamento'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
