import { getErrorMessage } from '../../lib/errors'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Eye, EyeOff, Lock } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CurrencyInput } from '../ui/CurrencyInput'
import {
  openSession,
  closeSession,
  addCashMovement,
  listOpenSessions,
  SESSION_ALREADY_CLOSED,
  type OpenSessionWithCashier,
} from '../../lib/cashSessions'
import { formatCurrency, formatDateTime } from '../../lib/format'
import type { CashSession, CashMovementType } from '../../lib/types'

interface CashSessionPanelProps {
  session: CashSession | null
  cashierId: string
  isDono: boolean
  onOpened: (session: CashSession) => void
  onClosed: () => void
  pendingSyncCount?: number
}

export function CashSessionPanel({
  session,
  cashierId,
  isDono,
  onOpened,
  onClosed,
  pendingSyncCount = 0,
}: CashSessionPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      {session ? (
        <OpenSessionInfo
          session={session}
          isDono={isDono}
          onClosed={onClosed}
          pendingSyncCount={pendingSyncCount}
        />
      ) : (
        <OpenSessionForm cashierId={cashierId} onOpened={onOpened} />
      )}
      {/* Caixa é por operador desde a decisão #53; só o dono enxerga (e
          fecha) o dos outros -- é o que resolve caixa esquecido aberto, que
          senão impediria a pessoa de abrir o dela no dia seguinte. */}
      {isDono && <OtherOpenSessions cashierId={cashierId} />}
    </div>
  )
}

/** Caixas abertos de OUTROS operadores. Só renderiza algo quando existe pelo
 * menos um -- no dia a dia (todo mundo fechando o seu) some da tela. */
function OtherOpenSessions({ cashierId }: { cashierId: string }) {
  const [sessions, setSessions] = useState<OpenSessionWithCashier[]>([])
  const [closing, setClosing] = useState<OpenSessionWithCashier | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const all = await listOpenSessions()
      setSessions(all.filter((s) => s.cashier_id !== cashierId))
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar os caixas abertos.'))
    }
  }, [cashierId])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="px-1 text-xs text-danger">{error}</p>
  if (sessions.length === 0) return null

  return (
    <div className="overflow-hidden rounded-panel glass glass-blur">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Outros caixas abertos</h3>
      </div>
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
        >
          <div>
            <div className="text-sm font-bold text-ink">{s.cashier_name ?? 'Operador'}</div>
            <div className="text-xs text-ink-soft">desde {formatDateTime(s.opened_at)}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setClosing(s)}>
            Fechar
          </Button>
        </div>
      ))}

      {closing && (
        <CloseSessionModal
          session={closing}
          onClose={() => setClosing(null)}
          // Fecha o caixa de OUTRO: recarrega a lista, mas não mexe na sessão
          // de quem está no PDV (por isso não chama o `onClosed` do pai).
          onClosed={() => {
            setClosing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function OpenSessionForm({
  cashierId,
  onOpened,
}: {
  cashierId: string
  onOpened: (session: CashSession) => void
}) {
  const [openingAmount, setOpeningAmount] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const session = await openSession({
        cashier_id: cashierId,
        opening_amount: Number(openingAmount),
      })
      onOpened(session)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao abrir caixa.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mx-auto max-w-sm">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
        <Lock size={22} />
      </span>
      <h2 className="mb-1 text-xl font-bold text-ink">Abrir caixa</h2>
      <p className="mb-4 text-sm text-ink-soft">
        É preciso abrir o caixa antes de iniciar as vendas.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CurrencyInput
          id="openingAmount"
          label="Valor de abertura (R$)"
          required
          value={openingAmount}
          onValueChange={setOpeningAmount}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? 'Abrindo…' : 'Abrir caixa'}
        </Button>
      </form>
    </Card>
  )
}

function OpenSessionInfo({
  session,
  isDono,
  onClosed,
  pendingSyncCount,
}: {
  session: CashSession
  isDono: boolean
  onClosed: () => void
  pendingSyncCount: number
}) {
  const [showMovement, setShowMovement] = useState<CashMovementType | null>(null)
  const [showClose, setShowClose] = useState(false)
  // Valor de abertura escondido por padrão -- só o dono tem o botão de olho
  // pra revelar (CLAUDE.md decisão #36). Caixa nunca vê o valor, nem mascarado
  // com botão: pra ele o token nem aparece na árvore.
  const [showAmount, setShowAmount] = useState(false)
  const hasPending = pendingSyncCount > 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel glass glass-blur px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success" dot>
            Caixa aberto
          </Badge>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-secondary">
            {isDono ? (
              <>
                {showAmount ? formatCurrency(session.opening_amount) : '••••••'}
                <button
                  type="button"
                  aria-label={showAmount ? 'Ocultar valor de abertura' : 'Mostrar valor de abertura'}
                  onClick={() => setShowAmount((v) => !v)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-secondary hover:text-ink"
                >
                  {showAmount ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                {' · '}
              </>
            ) : null}
            desde {formatDateTime(session.opened_at)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Sangria/Suprimento voltam pra todos os papéis (Branch 2, item 10
              -- reverte a decisão #36). O valor de abertura acima continua
              oculto pro caixa (parte da decisão #36 que não muda). */}
          <Button variant="ghost" size="sm" onClick={() => setShowMovement('sangria')}>
            <ArrowUpFromLine size={15} />
            Sangria
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowMovement('suprimento')}>
            <ArrowDownToLine size={15} />
            Suprimento
          </Button>
          {/* Fechar caixa é ação de conclusão, não destrutiva (CLAUDE.md
              decisão #7: mesma cor primária de "Finalizar venda"/"Fechar lote"). */}
          <Button size="sm" variant="secondary" onClick={() => setShowClose(true)} disabled={hasPending}>
            <Lock size={15} />
            Fechar caixa
          </Button>
        </div>
      </div>
      {hasPending && (
        <p className="px-1 text-xs font-semibold text-warning">
          Sincronize as vendas pendentes antes de fechar o caixa.
        </p>
      )}

      {showMovement && (
        <CashMovementModal
          sessionId={session.id}
          type={showMovement}
          onClose={() => setShowMovement(null)}
        />
      )}
      {showClose && (
        <CloseSessionModal
          session={session}
          onClose={() => setShowClose(false)}
          onClosed={onClosed}
        />
      )}
    </div>
  )
}

function CashMovementModal({
  sessionId,
  type,
  onClose,
}: {
  sessionId: string
  type: CashMovementType
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (Number(amount) <= 0) {
      setError('Valor deve ser maior que zero.')
      return
    }
    setLoading(true)
    try {
      await addCashMovement({ session_id: sessionId, type, amount: Number(amount), reason })
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao registrar movimento.'))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
      <Card raised className="w-full max-w-sm">
        <h2 className="mb-4 text-xl font-bold tracking-tight text-ink">
          {type === 'sangria' ? 'Sangria' : 'Suprimento'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <CurrencyInput
            id="amount"
            label="Valor (R$)"
            required
            autoFocus
            value={amount}
            onValueChange={setAmount}
          />
          <Input
            id="reason"
            label="Motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Salvando…' : 'Confirmar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function CloseSessionModal({
  session,
  onClose,
  onClosed,
}: {
  session: CashSession
  onClose: () => void
  onClosed: () => void
}) {
  const [closingAmount, setClosingAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CashSession | null>(null)
  // O caixa já tinha sido fechado em outro lugar (dono em "Outros caixas
  // abertos", outro aparelho, ou um pedido anterior que deu timeout mas
  // chegou ao banco). Antes isso virava um erro sem saída: a tela continuava
  // mostrando "Caixa aberto" e todo clique em Fechar repetia o erro.
  const [alreadyClosed, setAlreadyClosed] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const closed = await closeSession(session.id, Number(closingAmount))
      setResult(closed)
    } catch (err) {
      const message = getErrorMessage(err, 'Erro ao fechar caixa.')
      if (message.startsWith(SESSION_ALREADY_CLOSED)) {
        setAlreadyClosed(true)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  if (alreadyClosed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
        <Card raised className="w-full max-w-sm">
          <h2 className="mb-2 text-xl font-bold tracking-tight text-ink">Caixa já fechado</h2>
          <p className="text-sm text-ink-secondary">
            Este caixa já tinha sido fechado (pelo dono ou em outro aparelho).
            Abra um novo caixa para continuar vendendo.
          </p>
          <Button className="mt-4 w-full" onClick={onClosed}>
            OK
          </Button>
        </Card>
      </div>
    )
  }

  if (result) {
    // Em centavos inteiros: subtrair decimais em ponto flutuante podia dar
    // -0,0000001 e pintar de vermelho ("quebra") um caixa que bateu certo.
    const diff =
      (Math.round(Number(closingAmount) * 100) - Math.round((result.expected_amount ?? 0) * 100)) / 100
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
        <Card raised className="w-full max-w-sm">
          <h2 className="mb-4 text-xl font-bold tracking-tight text-ink">
            Caixa fechado
          </h2>
          <div className="flex flex-col gap-1 text-sm text-ink-secondary">
            <div className="flex justify-between">
              <span>Esperado</span>
              <span>{formatCurrency(result.expected_amount ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Contado</span>
              <span>{formatCurrency(Number(closingAmount))}</span>
            </div>
            {/* DESIGN.md seção 5: verde quando zero, vermelha quando há quebra. */}
            <div
              className={`flex justify-between font-semibold ${diff === 0 ? 'text-success' : 'text-danger'}`}
            >
              <span>Diferença</span>
              <span>{formatCurrency(diff)}</span>
            </div>
          </div>
          <Button className="mt-4 w-full" onClick={onClosed}>
            OK
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
      <Card raised className="w-full max-w-sm">
        <h2 className="mb-4 text-xl font-bold tracking-tight text-ink">
          Fechar caixa
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <CurrencyInput
            id="closingAmount"
            label="Valor contado (R$)"
            required
            autoFocus
            value={closingAmount}
            onValueChange={setClosingAmount}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Fechando…' : 'Fechar caixa'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
