import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CurrencyInput } from '../ui/CurrencyInput'
import { Input } from '../ui/Input'
import { SkeletonBar, SkeletonRows, SkeletonStatus } from '../ui/Skeleton'
import { useToast } from '../../contexts/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { formatCurrency, formatDate } from '../../lib/format'
import {
  createCategory,
  FEE_METHOD_LABEL,
  FEE_METHODS,
  getSettings,
  listFeeRates,
  listRecurring,
  saveFeeRates,
  saveSettings,
  setCategoryActive,
  todayKey,
  updateRecurring,
  type FeeMethod,
  type FeeRate,
  type FinanceCategory,
  type FinanceRecurring,
} from '../../lib/finance'

const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-wide text-ink-secondary'

/** "3,15" / "3.15" → 3.15; vazio ou inválido → NaN. */
function parseDecimal(raw: string): number {
  const v = raw.trim().replace(',', '.')
  return v === '' ? Number.NaN : Number(v)
}

function formatPercent(v: number): string {
  return String(v).replace('.', ',')
}

export function FinanceConfig({
  categories,
  onCategoriesChanged,
  onChanged,
}: {
  categories: FinanceCategory[]
  onCategoriesChanged: () => Promise<void>
  onChanged: () => void
}) {
  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-5">
        <FeeRatesSection onChanged={onChanged} />
      </div>
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
        <OpeningBalanceSection onChanged={onChanged} />
        <RecurringSection categories={categories} onChanged={onChanged} />
        <CategoriesSection categories={categories} onCategoriesChanged={onCategoriesChanged} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Taxas
// ---------------------------------------------------------------------------

interface RateDraft {
  fee: string
  days: string
  since: string
}

function currentRow(rates: FeeRate[], method: FeeMethod, today: string): FeeRate | null {
  let best: FeeRate | null = null
  for (const r of rates) {
    if (r.method === method && r.valid_from <= today && (!best || r.valid_from > best.valid_from)) best = r
  }
  return best
}

function FeeRatesSection({ onChanged }: { onChanged: () => void }) {
  const { showToast } = useToast()
  const today = todayKey()
  const [rates, setRates] = useState<FeeRate[]>([])
  const [drafts, setDrafts] = useState<Record<FeeMethod, RateDraft> | null>(null)
  const [validFrom, setValidFrom] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await listFeeRates()
    setRates(r)
    const d = {} as Record<FeeMethod, RateDraft>
    for (const m of FEE_METHODS) {
      const row = currentRow(r, m, todayKey())
      d[m] = {
        fee: formatPercent(Number(row?.fee_percent ?? 0)),
        days: String(row?.settle_days ?? 0),
        since: row?.valid_from ?? '',
      }
    }
    setDrafts(d)
  }, [])

  useEffect(() => {
    load().catch((err) => setError(getErrorMessage(err, 'Erro ao carregar as taxas.')))
  }, [load])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!drafts) return
    setError(null)
    const changed: { method: FeeMethod; fee_percent: number; settle_days: number }[] = []
    for (const m of FEE_METHODS) {
      const fee = parseDecimal(drafts[m].fee)
      const days = Number(drafts[m].days)
      if (!Number.isFinite(fee) || fee < 0 || fee >= 100) {
        setError(`Taxa inválida em ${FEE_METHOD_LABEL[m]}.`)
        return
      }
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        setError(`Prazo inválido em ${FEE_METHOD_LABEL[m]} (dias inteiros, de 0 a 365).`)
        return
      }
      const row = currentRow(rates, m, today)
      if (!row || Number(row.fee_percent) !== fee || Number(row.settle_days) !== days) {
        changed.push({ method: m, fee_percent: fee, settle_days: days })
      }
    }
    if (changed.length === 0) {
      setError('Nenhuma taxa mudou.')
      return
    }
    if (!validFrom) {
      setError('Informe a partir de quando as taxas valem.')
      return
    }
    setSaving(true)
    try {
      await saveFeeRates(changed, validFrom)
      await load()
      showToast('Taxas salvas.', 'success')
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao salvar as taxas.'))
    } finally {
      setSaving(false)
    }
  }

  function setDraft(m: FeeMethod, patch: Partial<RateDraft>) {
    setDrafts((d) => (d ? { ...d, [m]: { ...d[m], ...patch } } : d))
  }

  return (
    <Card>
      <h2 className={SECTION_TITLE}>Taxas e prazos por forma de pagamento</h2>
      <p className="mb-3 mt-1 text-xs text-ink-soft">
        Usadas no lucro líquido e para prever quando o dinheiro cai. Mudar uma taxa vale a partir da data
        escolhida — os meses anteriores não mudam.
      </p>
      {!drafts ? (
        error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <SkeletonRows rows={5} label="Carregando taxas…" />
        )
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm" data-testid="finance-fee-rates">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-secondary">
                  <th className="py-2 pr-2 font-semibold">Forma</th>
                  <th className="p-2 font-semibold">Taxa (%)</th>
                  <th className="p-2 font-semibold">Cai em (dias)</th>
                  <th className="p-2 font-semibold">Vale desde</th>
                </tr>
              </thead>
              <tbody>
                {FEE_METHODS.map((m) => (
                  <tr key={m} className="border-t border-border">
                    <td className="py-2 pr-2 text-ink">{FEE_METHOD_LABEL[m]}</td>
                    <td className="p-2">
                      <input
                        aria-label={`Taxa ${FEE_METHOD_LABEL[m]}`}
                        inputMode="decimal"
                        value={drafts[m].fee}
                        onChange={(e) => setDraft(m, { fee: e.target.value })}
                        className="field field-sm w-24"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Prazo ${FEE_METHOD_LABEL[m]}`}
                        inputMode="numeric"
                        value={drafts[m].days}
                        onChange={(e) => setDraft(m, { days: e.target.value.replace(/\D/g, '') })}
                        className="field field-sm w-24"
                      />
                    </td>
                    <td className="p-2 text-ink-secondary">
                      {!drafts[m].since || drafts[m].since <= '2000-01-01' ? 'sempre' : formatDate(drafts[m].since)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Input
              id="fee-valid-from"
              type="date"
              label="Novas taxas valem a partir de"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar taxas'}
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Saldo inicial
// ---------------------------------------------------------------------------

function OpeningBalanceSection({ onChanged }: { onChanged: () => void }) {
  const { showToast } = useToast()
  const [amount, setAmount] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then((s) => {
        setAmount(Number(s.opening_balance) ? Number(s.opening_balance).toFixed(2) : '')
        setDate(s.opening_date ?? '')
      })
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar o saldo inicial.')))
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!date) {
      setError('Informe a data do saldo inicial.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveSettings({ opening_balance: Number(amount || 0), opening_date: date })
      showToast('Saldo inicial salvo.', 'success')
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao salvar o saldo inicial.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className={SECTION_TITLE}>Saldo inicial</h2>
      <p className="mb-3 mt-1 text-xs text-ink-soft">
        Quanto havia em conta + gaveta no dia em que você começou a usar o financeiro. Base do saldo acumulado
        do fluxo de caixa.
      </p>
      {amount === null ? (
        error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <SkeletonStatus label="Carregando saldo inicial…" className="grid grid-cols-2 gap-3">
            <SkeletonBar className="h-12 rounded-xl" />
            <SkeletonBar className="h-12 rounded-xl" />
          </SkeletonStatus>
        )
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <CurrencyInput id="opening-amount" label="Valor" value={amount} onValueChange={setAmount} />
            <Input id="opening-date" type="date" label="Em" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar saldo inicial'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Despesas fixas
// ---------------------------------------------------------------------------

function RecurringSection({
  categories,
  onChanged,
}: {
  categories: FinanceCategory[]
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [items, setItems] = useState<FinanceRecurring[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftAmount, setDraftAmount] = useState('')
  const [draftDay, setDraftDay] = useState('')
  const [error, setError] = useState<string | null>(null)
  const catName = new Map(categories.map((c) => [c.id, c.name]))

  const load = useCallback(async () => {
    setItems(await listRecurring())
  }, [])

  useEffect(() => {
    load().catch((err) => setError(getErrorMessage(err, 'Erro ao carregar as despesas fixas.')))
  }, [load])

  async function toggle(r: FinanceRecurring) {
    try {
      await updateRecurring(r.id, { active: !r.active })
      await load()
      showToast(r.active ? 'Despesa fixa desativada.' : 'Despesa fixa reativada.', 'success')
      onChanged()
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao atualizar a despesa fixa.'), 'error')
    }
  }

  function startEdit(r: FinanceRecurring) {
    setEditingId(r.id)
    setDraftAmount(Number(r.amount).toFixed(2))
    setDraftDay(String(r.day_of_month))
  }

  async function saveEdit(r: FinanceRecurring) {
    const amount = Number(draftAmount)
    const day = Number(draftDay)
    if (!(amount > 0)) {
      showToast('Informe um valor maior que zero.', 'error')
      return
    }
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      showToast('O dia do vencimento vai de 1 a 28.', 'error')
      return
    }
    try {
      await updateRecurring(r.id, { amount, day_of_month: day })
      await load()
      setEditingId(null)
      showToast('Despesa fixa atualizada. Vale para os meses ainda não gerados.', 'success')
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao atualizar a despesa fixa.'), 'error')
    }
  }

  return (
    <Card>
      <h2 className={`${SECTION_TITLE} mb-1`}>Despesas fixas (todo mês)</h2>
      <p className="mb-2 text-xs text-ink-soft">
        Crie em Contas a pagar → Nova despesa → “Repetir todo mês”.
      </p>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : items === null ? (
        <SkeletonRows rows={3} label="Carregando despesas fixas…" />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhuma despesa fixa cadastrada.</p>
      ) : (
        <div className="flex flex-col" data-testid="finance-recurring">
          {items.map((r) => (
            <div
              key={r.id}
              className={`flex flex-wrap items-center gap-2 border-b border-border py-2.5 last:border-b-0 ${
                r.active ? '' : 'opacity-60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">{r.description}</div>
                <div className="text-xs text-ink-soft">
                  dia {r.day_of_month}
                  {r.category_id && ` · ${catName.get(r.category_id) ?? ''}`}
                  {!r.active && ' · desativada'}
                </div>
              </div>
              {editingId === r.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-32">
                    <CurrencyInput
                      aria-label="Valor"
                      value={draftAmount}
                      onValueChange={setDraftAmount}
                    />
                  </div>
                  <input
                    aria-label="Dia do vencimento"
                    inputMode="numeric"
                    value={draftDay}
                    onChange={(e) => setDraftDay(e.target.value.replace(/\D/g, ''))}
                    className="field field-sm w-16"
                  />
                  <Button type="button" onClick={() => saveEdit(r)}>
                    Salvar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm tabular-nums text-ink">{formatCurrency(Number(r.amount))}</span>
                  <Button type="button" variant="ghost" onClick={() => startEdit(r)}>
                    Editar
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => toggle(r)}>
                    {r.active ? 'Desativar' : 'Reativar'}
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

function CategoriesSection({
  categories,
  onCategoriesChanged,
}: {
  categories: FinanceCategory[]
  onCategoriesChanged: () => Promise<void>
}) {
  const { showToast } = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    try {
      await createCategory(name)
      await onCategoriesChanged()
      setName('')
      setAdding(false)
      showToast('Categoria criada.', 'success')
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao criar a categoria.'), 'error')
    }
  }

  async function toggle(c: FinanceCategory) {
    try {
      await setCategoryActive(c.id, !c.active)
      await onCategoriesChanged()
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao atualizar a categoria.'), 'error')
    }
  }

  return (
    <Card>
      <h2 className={`${SECTION_TITLE} mb-1`}>Categorias</h2>
      <p className="mb-3 text-xs text-ink-soft">
        Categoria oculta some da lista de nova despesa; as contas antigas continuam com ela.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((c) => (
          <span
            key={c.id}
            className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-sm ${
              c.active ? 'bg-surface-secondary text-ink' : 'border border-dashed border-border text-ink-soft line-through'
            }`}
          >
            {c.name}
            <button
              type="button"
              onClick={() => toggle(c)}
              aria-label={c.active ? `Ocultar ${c.name}` : `Reativar ${c.name}`}
              title={c.active ? 'Ocultar' : 'Reativar'}
              className="rounded-full p-0.5 text-ink-soft hover:bg-border hover:text-ink"
            >
              {c.active ? <X size={13} /> : <Plus size={13} />}
            </button>
          </span>
        ))}
        {adding ? (
          <form onSubmit={handleAdd} className="flex items-center gap-1.5">
            <input
              autoFocus
              aria-label="Nome da categoria"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field field-sm w-40"
            />
            <Button type="submit" className="!rounded-full !px-3 !py-1">
              Criar
            </Button>
            <Button type="button" variant="ghost" className="!rounded-full !px-2 !py-1" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-ink-soft px-3 py-1 text-sm text-ink-secondary hover:bg-surface-secondary"
          >
            + Nova
          </button>
        )}
      </div>
    </Card>
  )
}
