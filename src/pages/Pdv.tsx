import { getErrorMessage } from '../lib/errors'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Sentry from '@sentry/react'
import {
  Banknote,
  Camera,
  CreditCard,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { IconButton } from '../components/ui/IconButton'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/layout/PageHeader'
import { CurrencyInput } from '../components/ui/CurrencyInput'
import { PulseLoader } from '../components/ui/PulseLoader'
import { SkeletonBar, SkeletonRows, SkeletonStatus } from '../components/ui/Skeleton'
import { PrintPortal } from '../components/ui/PrintPortal'
import { BarcodeInput } from '../components/scanner/BarcodeInput'
import { CameraScanner } from '../components/scanner/CameraScanner'
import { CashSessionPanel } from '../components/pdv/CashSessionPanel'
import { SalesHistory } from '../components/pdv/SalesHistory'
import { Receipt, type ReceiptLine } from '../components/pdv/Receipt'
import { getOpenSession } from '../lib/cashSessions'
import { findSellableStockItem, listSellableStockItems, stockItemDisplayName } from '../lib/stockItems'
import {
  createSale,
  flushPendingSales,
  isPaymentComplete,
  PAYMENT_LABEL,
  remainingToPay,
  type SaleCartItem,
} from '../lib/sales'
import { listPendingSales, type PendingSale } from '../lib/offlineQueue'
import { daysUntilExpiry, formatCurrency, formatDate } from '../lib/format'
import type { CashSession, PaymentMethod, PaymentSplit, Sale, StockItem } from '../lib/types'

const PAYMENT_METHODS: PaymentMethod[] = ['dinheiro', 'pix', 'credito', 'debito']

const PAYMENT_ICON: Record<string, LucideIcon> = {
  dinheiro: Banknote,
  pix: QrCode,
  credito: CreditCard,
  debito: Wallet,
}

const SEARCH_RESULT_LIMIT = 8

/**
 * Linha do carrinho (Branch 5): item de estoque (com baixa, custo e validade)
 * ou item avulso "diversos" (só descrição + preço, sem estoque). Os helpers
 * abaixo normalizam as duas formas pro resto da tela não precisar ramificar.
 */
type CartLine =
  | { kind: 'stock'; stockItem: StockItem; quantity: number }
  | { kind: 'avulso'; key: string; description: string; unitPrice: number; quantity: number }

function availableQty(item: StockItem) {
  return item.quantity - item.quantity_sold
}

function isExpired(item: StockItem) {
  return item.expiry_date != null && daysUntilExpiry(item.expiry_date) < 0
}

function lineKey(line: CartLine): string {
  return line.kind === 'stock' ? line.stockItem.id : line.key
}
function lineName(line: CartLine): string {
  return line.kind === 'stock' ? stockItemDisplayName(line.stockItem) : line.description
}
function lineUnitPrice(line: CartLine): number {
  return line.kind === 'stock' ? line.stockItem.sale_price : line.unitPrice
}
/** Teto de quantidade: saldo do estoque, ou sem limite (Infinity) no avulso. */
function lineMaxQty(line: CartLine): number {
  return line.kind === 'stock' ? availableQty(line.stockItem) : Infinity
}
function lineExpired(line: CartLine): boolean {
  return line.kind === 'stock' && isExpired(line.stockItem)
}

function stockItemMatches(item: StockItem, term: string): boolean {
  const t = term.toLowerCase()
  return (
    stockItemDisplayName(item).toLowerCase().includes(t) ||
    (item.product_catalog?.ean ?? '').includes(term) ||
    (item.internal_code ?? '').toLowerCase().includes(t)
  )
}

export function Pdv() {
  const { profile } = useAuth()
  const isDono = profile?.role === 'dono'

  const [session, setSession] = useState<CashSession | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [cart, setCart] = useState<CartLine[]>([])
  // Uma linha por forma escolhida (decisao #53). Comeca VAZIO: nada de
  // forma pre-selecionada -- antes iniciava em 'dinheiro' e dava pra
  // finalizar sem ninguem ter escolhido. `amount` e a string canonica do
  // CurrencyInput ("12.34"), como `discount` e `amountReceived`.
  const [payments, setPayments] = useState<{ method: PaymentMethod; amount: string }[]>([])
  const [discount, setDiscount] = useState('0')
  const [amountReceived, setAmountReceived] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  // Contador, não booleano: o operador bipa vários itens em sequência sem
  // esperar a busca anterior terminar (CLAUDE.md: "bipa 20 itens seguidos"),
  // então pode haver mais de uma busca em voo ao mesmo tempo -- o spinner só
  // some quando a última delas resolver.
  const [scanningCount, setScanningCount] = useState(0)
  const scanning = scanningCount > 0
  const [error, setError] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [completedSale, setCompletedSale] = useState<{
    sale: Sale
    items: ReceiptLine[]
    amountReceived?: number
    payments: PaymentSplit[]
  } | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([])
  const pendingCount = pendingSales.length
  const [syncing, setSyncing] = useState(false)

  // Busca por nome (item 11): carrega os vendáveis sob demanda (no foco) e
  // filtra em memória, mesmo padrão do /estoque. `null` = ainda não carregado;
  // invalidado após cada venda pra refletir o saldo novo.
  const [sellable, setSellable] = useState<StockItem[] | null>(null)
  const [sellableLoading, setSellableLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  // (Re)escreve o campo unificado de bipagem/busca de fora: `barcodePreset` é o
  // conteúdo a aplicar quando `searchResetKey` muda ('' limpa; 'Diversos' entra
  // no modo avulso). O BarcodeInput observa `resetKey`/`presetValue`.
  const [searchResetKey, setSearchResetKey] = useState(0)
  const [barcodePreset, setBarcodePreset] = useState('')
  // Modo "Diversos" (item avulso): o campo mostra "Diversos" e um campo de
  // valor aparece ao lado; a busca por nome fica suprimida enquanto ativo.
  const [avulsoMode, setAvulsoMode] = useState(false)
  const [avulsoPrice, setAvulsoPrice] = useState('')

  const discountRef = useRef<HTMLInputElement>(null)

  function resetBarcode(value = '') {
    setBarcodePreset(value)
    setSearchResetKey((k) => k + 1)
  }

  const loadSellable = useCallback(async () => {
    setSellableLoading(true)
    try {
      setSellable(await listSellableStockItems())
    } catch (err) {
      Sentry.captureException(err)
    } finally {
      setSellableLoading(false)
    }
  }, [])

  // Carrega os vendáveis na primeira vez que o operador digita texto pra buscar.
  useEffect(() => {
    if (searchTerm.trim().length > 0 && sellable === null && !sellableLoading) {
      loadSellable()
    }
  }, [searchTerm, sellable, sellableLoading, loadSellable])

  const searchResults = useMemo(() => {
    const term = searchTerm.trim()
    if (term.length === 0 || !sellable) return []
    return sellable
      .filter((item) => availableQty(item) > 0 && stockItemMatches(item, term))
      .slice(0, SEARCH_RESULT_LIMIT)
  }, [searchTerm, sellable])

  // Caixa é por operador desde a decisão #53 -- sem o id, pegaria o caixa de
  // outra pessoa.
  useEffect(() => {
    if (!profile) return
    getOpenSession(profile.id)
      .then(setSession)
      .finally(() => setLoadingSession(false))
  }, [profile])

  const refreshPendingCount = useCallback(async () => {
    setPendingSales(await listPendingSales())
  }, [])

  // `force` = clique em "Sincronizar agora": tenta também as vendas que já
  // esgotaram as tentativas automáticas (senão ficariam presas pra sempre).
  const syncPending = useCallback(async (force = false) => {
    setSyncing(true)
    try {
      await flushPendingSales({ force })
    } finally {
      await refreshPendingCount()
      setSyncing(false)
    }
  }, [refreshPendingCount])

  useEffect(() => {
    refreshPendingCount()
    syncPending()
    const onOnline = () => syncPending()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refreshPendingCount, syncPending])

  const subtotal = cart.reduce((acc, c) => acc + lineUnitPrice(c) * c.quantity, 0)
  const discountValue = isDono ? Number(discount || 0) : 0
  const total = Math.max(subtotal - discountValue, 0)
  const hasExpiredItem = cart.some(lineExpired)

  const paymentSplits: PaymentSplit[] = payments.map((p) => ({
    method: p.method,
    amount: Number(p.amount || 0),
  }))
  const remaining = remainingToPay(total, paymentSplits)
  const paymentComplete = isPaymentComplete(total, paymentSplits)
  /** Só a parcela em dinheiro gera troco -- numa venda mista o cliente pode
   * dar uma nota maior só pra essa parte (decisão #53). */
  const cashAmount = Number(payments.find((p) => p.method === 'dinheiro')?.amount || 0)
  const change = cashAmount > 0 && amountReceived ? Number(amountReceived) - cashAmount : null

  /** Com uma forma só, o valor dela É o total: o operador não digita nada, e
   * a venda comum continua de um toque. Com duas ou mais, os valores são
   * digitados e ficam como estão -- a faixa de "falta" avisa se não fechar. */
  useEffect(() => {
    setPayments((prev) => {
      if (prev.length !== 1) return prev
      const amount = total > 0 ? total.toFixed(2) : ''
      return prev[0].amount === amount ? prev : [{ ...prev[0], amount }]
    })
  }, [total])

  // "Valor recebido" acompanha a parte em dinheiro (troco 0 por padrão; o
  // operador ajusta se o cliente pagar com nota maior).
  useEffect(() => {
    setAmountReceived(cashAmount > 0 ? cashAmount.toFixed(2) : '')
  }, [cashAmount])

  function togglePayment(method: PaymentMethod) {
    setError(null)
    setPayments((prev) => {
      if (prev.some((p) => p.method === method)) {
        return prev.filter((p) => p.method !== method)
      }
      // A forma que entra já vem com o que falta -- dividir em duas vira
      // "toca PIX, digita, toca Crédito" sem digitar o segundo valor.
      const paid = prev.reduce((sum, p) => sum + Number(p.amount || 0), 0)
      const rest = Math.max(total - paid, 0)
      return [...prev, { method, amount: rest > 0 ? rest.toFixed(2) : '' }]
    })
  }

  function setPaymentAmount(method: PaymentMethod, amount: string) {
    setPayments((prev) => prev.map((p) => (p.method === method ? { ...p, amount } : p)))
  }

  function addToCart(item: StockItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.kind === 'stock' && c.stockItem.id === item.id)
      if (existing) {
        if (existing.quantity >= availableQty(item)) return prev
        return prev.map((c) =>
          c.kind === 'stock' && c.stockItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        )
      }
      return [...prev, { kind: 'stock', stockItem: item, quantity: 1 }]
    })
  }

  // "Diversos" (item 8): clicar escreve "Diversos" no campo de bipar e abre o
  // campo de valor ao lado; confirmar cria a linha avulsa no carrinho.
  function enterAvulsoMode() {
    setError(null)
    setAvulsoMode(true)
    setAvulsoPrice('')
    resetBarcode('Diversos')
  }

  function cancelAvulso() {
    setAvulsoMode(false)
    setAvulsoPrice('')
    resetBarcode('')
  }

  function confirmAvulso() {
    const unitPrice = Number(avulsoPrice || 0)
    if (!(unitPrice > 0)) {
      setError('Informe um valor maior que zero para o item avulso.')
      return
    }
    setCart((prev) => [
      ...prev,
      { kind: 'avulso', key: crypto.randomUUID(), description: 'Diversos', unitPrice, quantity: 1 },
    ])
    cancelAvulso()
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (lineKey(c) !== key) return c
          const next = Math.min(c.quantity + delta, lineMaxQty(c))
          return { ...c, quantity: next }
        })
        .filter((c) => c.quantity > 0),
    )
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((c) => lineKey(c) !== key))
  }

  const handleScan = useCallback(
    async (code: string) => {
      setError(null)
      setScanningCount((n) => n + 1)
      try {
        const item = await findSellableStockItem(code)
        if (!item) {
          setError(`Nenhum item disponível para o código ${code}.`)
          return
        }
        // Vencido bloqueia a venda pro caixa comum; o dono pode liberar (RPC
        // revalida o papel no servidor, não é só a UI escondendo o bloqueio).
        if (isExpired(item) && !isDono) {
          setError(
            `Item vencido em ${formatDate(item.expiry_date!)}. Só o dono pode liberar a venda.`,
          )
          return
        }
        addToCart(item)
      } catch (err) {
        Sentry.captureException(err)
        setError(getErrorMessage(err, 'Erro ao buscar item.'))
      } finally {
        setScanningCount((n) => n - 1)
      }
    },
    [isDono],
  )

  function addFromSearch(item: StockItem) {
    setError(null)
    if (isExpired(item) && !isDono) {
      setError(`Item vencido em ${formatDate(item.expiry_date!)}. Só o dono pode liberar a venda.`)
      return
    }
    addToCart(item)
    setSearchTerm('')
    resetBarcode('') // limpa o campo unificado
  }

  const handleFinalize = useCallback(async () => {
    if (!profile || !session || cart.length === 0 || finalizing) return

    // Decisão #53, item 1: nenhuma forma vem marcada, então finalizar sem
    // escolher precisa avisar em vez de deixar passar como dinheiro.
    if (payments.length === 0) {
      setError('Escolha uma forma de pagamento.')
      return
    }
    if (!paymentComplete) {
      setError(
        remaining > 0
          ? `Falta ${formatCurrency(remaining)} para fechar o pagamento.`
          : `O pagamento passou ${formatCurrency(Math.abs(remaining))} do total.`,
      )
      return
    }

    setFinalizing(true)
    setError(null)
    try {
      const items: SaleCartItem[] = cart.map((c) =>
        c.kind === 'stock'
          ? { stock_item_id: c.stockItem.id, quantity: c.quantity }
          : { description: c.description, unit_price: c.unitPrice, quantity: c.quantity },
      )
      const receiptLines: ReceiptLine[] = cart.map((c) => ({
        key: lineKey(c),
        name: lineName(c),
        unitPrice: lineUnitPrice(c),
        quantity: c.quantity,
      }))
      const sale = await createSale({
        cashier_id: profile.id,
        session_id: session.id,
        items,
        payments: paymentSplits,
        discount: discountValue,
        total,
        overrideExpired: hasExpiredItem,
      })
      setCompletedSale({
        sale,
        items: receiptLines,
        amountReceived: cashAmount > 0 && amountReceived ? Number(amountReceived) : undefined,
        payments: paymentSplits,
      })
      setCart([])
      setPayments([])
      setDiscount('0')
      setAmountReceived('')
      setSearchTerm('')
      // Venda mudou o saldo -- força recarregar os vendáveis na próxima busca.
      setSellable(null)
      setHistoryKey((k) => k + 1)
      if (sale.pending) await refreshPendingCount()
    } catch (err) {
      Sentry.captureException(err)
      setError(getErrorMessage(err, 'Erro ao finalizar venda.'))
    } finally {
      setFinalizing(false)
    }
  }, [
    profile,
    session,
    cart,
    finalizing,
    payments,
    paymentSplits,
    paymentComplete,
    remaining,
    cashAmount,
    discountValue,
    amountReceived,
    total,
    hasExpiredItem,
    refreshPendingCount,
  ])

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // No modo "Diversos" o campo de valor cuida do Enter/Escape; os atalhos
      // globais ficam desligados pra não finalizar nem apagar item do carrinho.
      if (avulsoMode) return
      if (e.key === 'F2') {
        e.preventDefault()
        handleFinalize()
      } else if (e.key === 'F4') {
        if (isDono) {
          e.preventDefault()
          discountRef.current?.focus()
        }
      } else if (e.key === 'Escape') {
        setCart((prev) => prev.slice(0, -1))
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [handleFinalize, isDono, avulsoMode])

  if (loadingSession) {
    return (
      <SkeletonStatus label="Carregando PDV…" className="flex flex-col gap-6">
        <SkeletonBar className="h-9 w-24" />
        <SkeletonBar className="h-14 w-full rounded-panel" />
        <div className="grid overflow-hidden rounded-panel glass glass-blur lg:grid-cols-3">
          <div className="flex flex-col gap-5 border-b border-border p-5 md:p-6 lg:col-span-2 lg:border-b-0 lg:border-r">
            <SkeletonBar className="h-14 w-full rounded-xl" />
            <SkeletonBar className="h-16 w-full rounded-xl" />
            <SkeletonBar className="h-16 w-full rounded-xl" />
            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <SkeletonBar className="h-4 w-16" />
              <SkeletonBar className="h-10 w-40" />
            </div>
          </div>
          <div className="flex flex-col gap-3 p-5 md:p-6">
            <SkeletonBar className="h-3 w-1/2" />
            <div className="grid grid-cols-2 gap-2.5">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonBar key={i} className="h-[68px] rounded-xl" />
              ))}
            </div>
            <SkeletonBar className="mt-2 h-14 w-full rounded-xl" />
          </div>
        </div>
      </SkeletonStatus>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="PDV" />

      <CashSessionPanel
        session={session}
        cashierId={profile?.id ?? ''}
        isDono={isDono}
        onOpened={setSession}
        onClosed={() => setSession(null)}
        // Só as pendentes DESTE caixa travam o fechamento: a fila offline é
        // do aparelho, não do operador -- no PC do caixa, compartilhado, uma
        // venda presa de outra sessão (ou de outro operador) impedia fechar
        // um caixa que não tem nada a ver com ela.
        pendingSyncCount={session ? pendingSales.filter((p) => p.session_id === session.id).length : 0}
      />

      {pendingCount > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning/40 bg-warning/10">
          <div className="text-sm text-warning">
            <p>
              {pendingCount} venda{pendingCount === 1 ? '' : 's'} pendente{pendingCount === 1 ? '' : 's'} de sincronização.
            </p>
            {/* Motivo da última recusa do servidor, quando houver -- sem isso o
                operador só via o contador e não sabia por que não subia. */}
            {pendingSales.find((p) => p.last_error)?.last_error && (
              <p className="mt-0.5 text-xs">
                Motivo: {pendingSales.find((p) => p.last_error)?.last_error}
              </p>
            )}
          </div>
          <Button variant="secondary" onClick={() => syncPending(true)} disabled={syncing}>
            <RefreshCw size={16} />
            {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
          </Button>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {session && (
        <div className="grid overflow-hidden rounded-panel glass glass-blur lg:grid-cols-3">
          <div className="flex flex-col gap-5 border-b border-border p-5 md:p-6 lg:col-span-2 lg:border-b-0 lg:border-r">
            <div>
              {/* Campo único (item 11): Enter = código (leitor); digitar texto
                  busca por nome e mostra o dropdown abaixo. No modo "Diversos"
                  (item 8) o campo mostra "Diversos" (desabilitado) e um campo de
                  valor aparece ao lado. */}
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <BarcodeInput
                      onScan={handleScan}
                      disabled={cameraOpen || avulsoMode}
                      placeholder="Bipar código ou buscar por nome…"
                      onValueChange={setSearchTerm}
                      resetKey={searchResetKey}
                      presetValue={barcodePreset}
                    />
                  </div>
                  {avulsoMode && (
                    <>
                      <div className="w-36 shrink-0">
                        <CurrencyInput
                          id="avulso-valor"
                          aria-label="Valor do item avulso"
                          autoFocus
                          value={avulsoPrice}
                          onValueChange={setAvulsoPrice}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmAvulso()
                            else if (e.key === 'Escape') cancelAvulso()
                          }}
                        />
                      </div>
                      <Button type="button" onClick={confirmAvulso} className="shrink-0">
                        Adicionar
                      </Button>
                      <Button type="button" variant="ghost" onClick={cancelAvulso} className="shrink-0">
                        Cancelar
                      </Button>
                    </>
                  )}
                  {scanning && <PulseLoader size="sm" className="shrink-0" />}
                </div>

                {!avulsoMode && searchTerm.trim().length > 0 && (
                  <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-[14px] border border-border bg-surface-raised shadow-2xl glass-blur">
                    {searchResults.length === 0 ? (
                      sellable && !sellableLoading ? (
                        <p className="px-3 py-3 text-sm text-ink-soft">Nenhum item vendável encontrado.</p>
                      ) : (
                        <div className="px-3">
                          <SkeletonRows rows={3} label="Buscando itens…" />
                        </div>
                      )
                    ) : (
                      searchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addFromSearch(item)}
                          className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-primary/[0.08]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-ink">
                              {stockItemDisplayName(item)}
                            </span>
                            <span className="block truncate text-xs text-ink-soft">
                              {item.product_catalog?.ean ?? item.internal_code} · {availableQty(item)} disponível
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                            {formatCurrency(item.sale_price)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setCameraOpen(true)}>
                  <Camera size={17} />
                  Câmera
                </Button>
                <Button variant="secondary" onClick={enterAvulsoMode} disabled={avulsoMode}>
                  <Plus size={16} />
                  Diversos
                </Button>
              </div>
            </div>

            <div className="flex flex-1 flex-col border-t border-border pt-5">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
                Carrinho
                {cart.length > 0 && (
                  <span className="rounded-full bg-primary/[0.13] px-2 py-px text-[11px] text-primary">
                    {cart.reduce((n, c) => n + c.quantity, 0)}
                  </span>
                )}
              </h2>
              {cart.length === 0 ? (
                <EmptyState
                  icon={<ShoppingCart size={22} />}
                  title="Nenhum item bipado ainda."
                  description="Bipe um código, use a câmera ou busque pelo nome."
                />
              ) : (
                <div className="flex flex-1 flex-col gap-2">
                  {cart.map((c) => {
                    const key = lineKey(c)
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-field px-3.5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold text-ink">
                            {lineName(c)}
                            {c.kind === 'avulso' && (
                              <span className="ml-1.5 text-xs font-normal text-ink-soft">(avulso)</span>
                            )}
                          </p>
                          {c.kind === 'stock' && isExpired(c.stockItem) ? (
                            <p className="text-xs font-bold text-danger">
                              Vencido em {formatDate(c.stockItem.expiry_date!)}
                            </p>
                          ) : (
                            <p className="text-xs text-ink-soft">
                              {formatCurrency(lineUnitPrice(c))} un.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Diminuir quantidade"
                            onClick={() => changeQuantity(key, -1)}
                            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border bg-surface-raised text-ink-secondary hover:text-ink"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="w-7 text-center text-[15px] font-bold tabular-nums text-ink">{c.quantity}</span>
                          <button
                            type="button"
                            aria-label="Aumentar quantidade"
                            onClick={() => changeQuantity(key, 1)}
                            disabled={c.quantity >= lineMaxQty(c)}
                            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border bg-surface-raised text-ink-secondary hover:text-ink disabled:opacity-40"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <span className="w-24 text-right text-[15px] font-bold tabular-nums text-ink">
                          {formatCurrency(lineUnitPrice(c) * c.quantity)}
                        </span>
                        <IconButton aria-label="Remover item" tone="danger" look="plain" size="sm" onClick={() => removeFromCart(key)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="flex items-baseline justify-between border-t border-border pt-4">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Total
                </span>
                <span className="text-[40px] font-bold leading-none tracking-tight tabular-nums text-ink">
                  {formatCurrency(total)}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-5 md:p-6">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
                Forma de pagamento
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = PAYMENT_ICON[method]
                  const selected = payments.some((p) => p.method === method)
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => togglePayment(method)}
                      aria-pressed={selected}
                      className={`flex h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border text-sm transition-colors ${
                        selected
                          ? 'border-primary bg-primary font-bold text-primary-content shadow-lg shadow-primary/30'
                          : 'border-border bg-field font-semibold text-ink-secondary hover:border-primary/40 hover:text-ink'
                      }`}
                    >
                      <Icon size={20} aria-hidden="true" />
                      {PAYMENT_LABEL[method]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Com duas ou mais formas (decisão #53) cada uma vira uma linha
                com o próprio valor. Com uma só não aparece nada: o valor dela
                é o total, e a venda comum segue de um toque. */}
            {payments.length > 1 && (
              <div className="flex flex-col gap-2">
                {payments.map((p) => (
                  <div
                    key={p.method}
                    className="flex items-center gap-2 rounded-[14px] border border-border bg-field px-3 py-2"
                  >
                    <span className="flex-1 text-sm font-bold text-ink">
                      {PAYMENT_LABEL[p.method]}
                    </span>
                    <CurrencyInput
                      id={`payment-${p.method}`}
                      aria-label={`Valor em ${PAYMENT_LABEL[p.method]}`}
                      value={p.amount}
                      onValueChange={(v) => setPaymentAmount(p.method, v)}
                      className="w-28 text-right"
                    />
                    <IconButton
                      aria-label={`Remover ${PAYMENT_LABEL[p.method]}`}
                      tone="danger"
                      look="plain"
                      size="sm"
                      onClick={() => togglePayment(p.method)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                ))}

                <div
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-bold ${
                    paymentComplete
                      ? 'bg-success/10 text-success'
                      : remaining > 0
                        ? 'bg-warning/10 text-warning'
                        : 'bg-danger/10 text-danger'
                  }`}
                >
                  {paymentComplete ? (
                    <>
                      <span>Pagamento fechado</span>
                      <span className="tabular-nums">{formatCurrency(total)}</span>
                    </>
                  ) : remaining > 0 ? (
                    <>
                      <span>Falta</span>
                      <span className="tabular-nums">{formatCurrency(remaining)}</span>
                    </>
                  ) : (
                    <>
                      <span>Passou do total</span>
                      <span className="tabular-nums">{formatCurrency(Math.abs(remaining))}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {isDono && (
              <CurrencyInput
                id="discount"
                ref={discountRef}
                label="Desconto (R$) — F4"
                value={discount}
                onValueChange={setDiscount}
              />
            )}

            {cashAmount > 0 && (
              <CurrencyInput
                id="amountReceived"
                // Numa venda mista o troco sai só sobre a parte em espécie, e
                // o rótulo precisa deixar isso explícito (decisão #53).
                label={
                  payments.length > 1 ? 'Valor recebido em dinheiro (R$)' : 'Valor recebido (R$)'
                }
                value={amountReceived}
                onValueChange={setAmountReceived}
              />
            )}

            <div className="flex flex-col gap-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between text-ink-secondary">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-ink-secondary">
                  <span>Desconto</span>
                  <span>- {formatCurrency(discountValue)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-ink">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              {change != null && (
                <div className="mt-1 flex items-center justify-between rounded-xl bg-success/10 px-3.5 py-2.5 font-bold text-success">
                  <span>Troco</span>
                  <span className="tabular-nums">{formatCurrency(Math.max(change, 0))}</span>
                </div>
              )}
            </div>

            {hasExpiredItem && (
              <p className="text-xs font-bold text-danger">
                Carrinho tem item vencido — venda liberada como dono.
              </p>
            )}

            <Button
              size="lg"
              onClick={handleFinalize}
              disabled={cart.length === 0 || finalizing}
              className="w-full"
            >
              {finalizing ? 'Finalizando…' : 'Finalizar venda (F2)'}
            </Button>
          </div>
        </div>
      )}

      {cameraOpen && (
        <CameraScanner
          onDetected={(code) => {
            setCameraOpen(false)
            handleScan(code)
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
          <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-y-auto rounded-panel border border-border bg-surface-raised shadow-2xl">
            {completedSale.sale.pending && (
              <p className="bg-warning/10 px-3 py-2 text-center text-xs font-bold text-warning print:hidden">
                Pendente de sincronização — venda concluída localmente
              </p>
            )}
            <div data-testid="sale-receipt">
              <Receipt
                sale={completedSale.sale}
                items={completedSale.items}
                cashierName={profile?.full_name ?? profile?.role ?? ''}
                amountReceived={completedSale.amountReceived}
                payments={completedSale.payments}
              />
            </div>
            <div className="flex gap-2 p-4 print:hidden">
              <Button variant="secondary" className="flex-1" onClick={() => setCompletedSale(null)}>
                Fechar
              </Button>
              <Button className="flex-1" onClick={() => window.print()}>
                <Printer size={16} />
                Imprimir
              </Button>
            </div>
          </div>
        </div>
      )}

      {completedSale && (
        <PrintPortal>
          <Receipt
            sale={completedSale.sale}
            items={completedSale.items}
            cashierName={profile?.full_name ?? profile?.role ?? ''}
            amountReceived={completedSale.amountReceived}
            payments={completedSale.payments}
          />
        </PrintPortal>
      )}

      <SalesHistory canCancel={isDono} refreshKey={historyKey} />
    </div>
  )
}
