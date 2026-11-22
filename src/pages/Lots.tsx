import { getErrorMessage } from '../lib/errors'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Plus, RotateCcw, Trash2 } from 'lucide-react'
import * as Sentry from '@sentry/react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { IconButton } from '../components/ui/IconButton'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SkeletonCards } from '../components/ui/Skeleton'
import { Input } from '../components/ui/Input'
import { CurrencyInput } from '../components/ui/CurrencyInput'
import { listLots, reopenLot, deleteLot, createLot } from '../lib/lots'
import { getLotSaleTotals } from '../lib/reports'
import { formatCurrency, formatDate } from '../lib/format'
import type { Lot } from '../lib/types'
import { PageHeader } from '../components/layout/PageHeader'

const STATUS_LABEL: Record<Lot['status'], string> = {
  receiving: 'Recebendo',
  closed: 'Fechado',
}

const STATUS_TONE: Record<Lot['status'], BadgeTone> = {
  receiving: 'warning',
  closed: 'neutral',
}

export function Lots() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [lots, setLots] = useState<Lot[]>([])
  // Valor de venda por lote (soma de sale_price × quantity dos itens ativos) --
  // some do card se ainda não carregou. Chave = lot.id.
  const [saleTotals, setSaleTotals] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // Reabrir e excluir também vivem aqui (decisão #57); fechar fica só na tela
  // do lote, onde dá pra ver os itens e o rateio antes de decidir.
  const [confirm, setConfirm] = useState<{ lot: Lot; action: 'reopen' | 'delete' } | null>(null)
  const [busy, setBusy] = useState(false)

  const isDono = profile?.role === 'dono'

  // `useCallback([isDono])` porque o refresh agora lê `isDono` (só o dono busca
  // os totais) -- sem isso o efeito de montagem ficaria com dependência
  // faltando. `isDono` já está resolvido quando /lotes monta (o `loading` do
  // auth só cai depois de carregar o perfil), então o efeito roda uma vez.
  const refresh = useCallback(async () => {
    // Só o dono vê os valores no card (pedido do dono); não busca os totais à
    // toa pros demais papéis -- e o estoquista, que é quem mais usa /lotes,
    // deixa de rodar essa consulta paginada sem precisar.
    const [lotList, totals] = await Promise.all([
      listLots(),
      isDono ? getLotSaleTotals() : Promise.resolve(new Map<string, number>()),
    ])
    setLots(lotList)
    setSaleTotals(totals)
  }, [isDono])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  async function handleConfirm() {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.action === 'reopen') await reopenLot(confirm.lot.id)
      else await deleteLot(confirm.lot.id)
      await refresh()
      showToast(confirm.action === 'reopen' ? 'Lote reaberto.' : 'Lote excluído.', 'success')
    } catch (err) {
      Sentry.captureException(err)
      // Mensagem do `raise exception` da RPC (lote com itens ou com venda) --
      // vai só pro toast, não também pra uma linha vermelha na página
      // (decisão #58).
      showToast(getErrorMessage(err, 'Erro ao atualizar o lote.'), 'error')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lotes"
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus size={18} />
            Novo lote
          </Button>
        }
      />

      {showForm && (
        <NewLotForm
          onCreated={() => {
            setShowForm(false)
            refresh()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <SkeletonCards label="Carregando lotes…" />
      ) : lots.length === 0 ? (
        <EmptyState
          icon={<Boxes size={22} />}
          title="Nenhum lote cadastrado ainda."
          description="Crie um lote pra começar a receber mercadoria."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lots.map((lot) => {
            const saleValue = saleTotals.get(lot.id) ?? 0
            const hasItems = saleValue > 0
            const profit = saleValue - Number(lot.purchase_value)
            return (
            // O card inteiro continua clicável, mas o <Link> agora envolve só o
            // nome e se estica por cima do card (`after:absolute after:inset-0`):
            // um <button> dentro de um <a> seria HTML inválido, e os botões de
            // ação precisam ficar fora da área de navegação (daí o `relative`
            // deles, que os põe acima da camada esticada).
            <Card key={lot.id} className="relative flex h-full flex-col gap-3 transition-shadow hover:shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[17px] font-bold tracking-tight text-ink">
                  <Link
                    to={`/lotes/${lot.id}`}
                    className="after:absolute after:inset-0 after:rounded-panel hover:text-primary"
                  >
                    {lot.supplier || 'Sem fornecedor'}
                  </Link>
                </h2>
                <Badge tone={STATUS_TONE[lot.status]} dot>
                  {STATUS_LABEL[lot.status]}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                {/* Valor pago só pro dono (decisão #68): funcionário vê só a data. */}
                <p className="text-sm font-semibold text-ink-soft">
                  {isDono && <>{formatCurrency(Number(lot.purchase_value))} · </>}
                  {formatDate(lot.purchase_date)}
                </p>
                {isDono && (
                  <div className="relative flex gap-1.5">
                    {lot.status === 'closed' && (
                      <IconButton aria-label="Reabrir lote" size="sm" onClick={() => setConfirm({ lot, action: 'reopen' })}>
                        <RotateCcw size={16} />
                      </IconButton>
                    )}
                    <IconButton
                      aria-label="Excluir lote"
                      tone="danger"
                      size="sm"
                      onClick={() => setConfirm({ lot, action: 'delete' })}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                )}
              </div>

              {/* Valores só pro dono (pedido do dono, mesma linha da decisão
                  #36: restrição de UI, RLS segue aberta -- decisão #25). */}
              {isDono &&
                (hasItems ? (
                  <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-ink-soft">Valor de venda</span>
                      <span className="text-sm font-bold tabular-nums text-ink">
                        {formatCurrency(saleValue)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-ink-secondary">
                        {profit >= 0 ? 'Lucro previsto' : 'Prejuízo previsto'}
                      </span>
                      <span
                        className={`text-lg font-bold tabular-nums ${
                          profit >= 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {profit >= 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(profit))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-auto border-t border-border pt-3 text-sm text-ink-soft">
                    Adicione itens para ver o lucro previsto
                  </p>
                ))}
            </Card>
            )
          })}
        </div>
      )}

      {confirm?.action === 'reopen' && (
        <ConfirmDialog
          title="Reabrir lote"
          message="O lote volta pra conferência: os itens ficam editáveis de novo e o rateio é recalculado. Itens já vendidos não são afetados."
          confirmLabel="Reabrir lote"
          busyLabel="Reabrindo…"
          variant="primary"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.action === 'delete' && (
        <ConfirmDialog
          title="Excluir lote"
          message="Esta ação não pode ser desfeita. O lote precisa estar sem itens cadastrados."
          confirmLabel="Excluir lote"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function NewLotForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [supplier, setSupplier] = useState('')
  const [purchaseValue, setPurchaseValue] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await createLot({
        supplier,
        purchase_value: Number(purchaseValue),
        purchase_date: purchaseDate,
        notes: notes || undefined,
      })
      onCreated()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao criar lote.'))
      setLoading(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Input
          id="supplier"
          label="Fornecedor / leiloeiro"
          required
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
        <CurrencyInput
          id="purchaseValue"
          label="Valor pago (R$)"
          required
          value={purchaseValue}
          onValueChange={setPurchaseValue}
        />
        <Input
          id="purchaseDate"
          label="Data da compra"
          type="date"
          required
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
        />
        <Input
          id="notes"
          label="Observações"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Criando…' : 'Criar lote'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
