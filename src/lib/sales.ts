import { supabase } from './supabaseClient'
import { getErrorMessage } from './errors'
import {
  enqueuePendingSale,
  listPendingSales,
  removePendingSale,
  incrementPendingSaleFailures,
  type PendingSale,
} from './offlineQueue'
import type { PaymentSplit, ReceiptLine, RecordedPaymentMethod, RecordedPaymentSplit, Sale, SalePaymentMethod } from './types'

/** Rótulo de cada forma de pagamento. Vive aqui pra PDV, comprovante,
 * histórico e dashboard lerem do mesmo lugar (antes eram quatro cópias). */
export const PAYMENT_LABEL: Record<RecordedPaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Crédito',
  debito: 'Débito',
  online: 'Online (site)',
}

/** Diferença de até 1 centavo é arredondamento, não erro: o operador divide o
 * total entre as formas e a soma pode sobrar/faltar um centavo. Mesmo limiar
 * usado no `create_sale` (migration 0018), onde o `numeric` do Postgres é
 * exato. */
const PAYMENT_TOLERANCE_CENTS = 1

/** Converte pra centavos inteiros antes de comparar. Em ponto flutuante,
 * 100 − (33.33 × 3) dá 0.010000000000005, que estouraria uma tolerância
 * escrita como `<= 0.01` -- e rejeitaria uma divisão em três partes
 * perfeitamente válida. */
function toCents(value: number): number {
  return Math.round(value * 100)
}

/** Quanto ainda falta pra as parcelas fecharem o total. Negativo = passou do
 * total. Pura, pra ser testável. */
export function remainingToPay(total: number, payments: PaymentSplit[]): number {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0)
  return total - paid
}

/** As parcelas fecham o total? Exige ao menos uma forma escolhida -- é isso
 * que impede finalizar sem escolher nada (decisão #53, item 1) -- e nenhuma
 * parcela zerada, que o `create_sale` recusaria (`check amount > 0`). */
export function isPaymentComplete(total: number, payments: PaymentSplit[]): boolean {
  if (payments.length === 0) return false
  if (payments.some((p) => p.amount <= 0)) return false
  const paidCents = payments.reduce((sum, p) => sum + toCents(p.amount), 0)
  return Math.abs(toCents(total) - paidCents) <= PAYMENT_TOLERANCE_CENTS
}

/** O que vai pra `sales.payment_method`: a forma única, ou `misto` quando há
 * mais de uma. Espelha a regra do `create_sale`, pra a venda sintetizada da
 * fila offline não divergir do que o servidor gravaria. */
export function primaryPaymentMethod(payments: PaymentSplit[]): SalePaymentMethod | null {
  if (payments.length === 0) return null
  if (payments.length > 1) return 'misto'
  return payments[0].method
}

/**
 * Item de uma venda enviado ao `create_sale`. Duas formas (Branch 5, item 8):
 * - item de estoque: `{ stock_item_id, quantity }` (baixa estoque, custo
 *   rateado, checa validade);
 * - item avulso "diversos": `{ description, unit_price, quantity }` sem
 *   `stock_item_id` (não baixa estoque, custo 0 no servidor).
 * O RPC recebe os dois no mesmo jsonb e decide pelo `stock_item_id` nulo.
 */
export type SaleCartItem =
  | { stock_item_id: string; quantity: number }
  | { description: string; unit_price: number; quantity: number }

const RPC_TIMEOUT_MS = 10000
const MAX_SYNC_FAILURES = 5

/**
 * status === 0 cobre tanto falha de rede pura (nunca chegou ao servidor)
 * quanto abort por timeout — em ambos os casos supabase.rpc() (sem
 * .throwOnError()) resolve com { data: null, error, status: 0 } em vez de
 * rejeitar a Promise. status >= 500 é resposta ambígua (pode ter commitado
 * do lado do servidor mesmo assim) — nesses casos é seguro enfileirar, já
 * que a idempotência cobre o replay.
 */
function isNetworkFailure(status: number): boolean {
  return status === 0 || status >= 500
}

async function callCreateSale(input: {
  cashier_id: string
  items: SaleCartItem[]
  payment_method: SalePaymentMethod | null
  /** Ausente em venda antiga da fila offline (gravada antes da decisão #53):
   * o RPC aceita `p_payments` nulo e cai no caminho de forma única. */
  payments?: PaymentSplit[]
  discount: number
  session_id: string
  idempotency_key: string
  override_expired: boolean
}) {
  return supabase
    .rpc('create_sale', {
      p_cashier_id: input.cashier_id,
      p_items: input.items,
      p_payment_method: input.payment_method,
      p_discount: input.discount,
      p_session_id: input.session_id,
      p_idempotency_key: input.idempotency_key,
      p_override_expired: input.override_expired,
      p_payments: input.payments ?? null,
    })
    .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
}

export async function createSale(input: {
  cashier_id: string
  items: SaleCartItem[]
  /** Uma entrada por forma de pagamento (decisão #53). Uma só = venda comum. */
  payments: PaymentSplit[]
  discount: number
  session_id: string
  /** Total já calculado no cliente (carrinho) — só usado se a venda cair na fila offline. */
  total: number
  /** true só quando o carrinho tem item vencido E quem está no PDV é dono
   * (a UI nem deixa adicionar item vencido ao carrinho se não for) -- o RPC
   * revalida isso com auth.uid() no servidor de qualquer forma. */
  overrideExpired?: boolean
}): Promise<Sale> {
  const idempotencyKey = crypto.randomUUID()
  const overrideExpired = input.overrideExpired ?? false
  const paymentMethod = primaryPaymentMethod(input.payments)
  // Invariante: a UI já bloqueia finalizar sem forma escolhida (decisão #53,
  // item 1). O guarda aqui é o que garante isso pra qualquer outro chamador.
  if (!paymentMethod) throw new Error('Escolha uma forma de pagamento.')

  const { data, error, status } = await callCreateSale({
    ...input,
    payment_method: paymentMethod,
    idempotency_key: idempotencyKey,
    override_expired: overrideExpired,
  })

  if (!error) return data as Sale

  if (isNetworkFailure(status)) {
    await enqueuePendingSale({
      idempotency_key: idempotencyKey,
      cashier_id: input.cashier_id,
      session_id: input.session_id,
      items: input.items,
      payment_method: paymentMethod,
      payments: input.payments,
      discount: input.discount,
      override_expired: overrideExpired,
      created_at: new Date().toISOString(),
    })
    // "conclui localmente": resolve em vez de lançar, com uma venda
    // sintetizada, pra o fluxo de sucesso em Pdv.tsx rodar sem mudança.
    return {
      id: idempotencyKey,
      store_id: '',
      cashier_id: input.cashier_id,
      session_id: input.session_id,
      total: input.total,
      discount: input.discount,
      payment_method: paymentMethod,
      status: 'completed',
      created_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      pending: true,
    }
  }

  throw error
}

/**
 * Tenta sincronizar cada venda enfileirada. Sucesso ou "já existe"
 * (idempotência) remove da fila. Erro de negócio real durante o replay
 * (ex.: estoque que sumiu, sessão fechada nesse meio tempo) mantém na
 * fila e incrementa o contador de falhas — acima de MAX_SYNC_FAILURES
 * para de tentar sozinho e fica sinalizado pra atenção manual.
 *
 * `force` (botão "Sincronizar agora") tenta também as que passaram do limite:
 * sem isso, uma venda que esgotou as tentativas ficava presa pra sempre --
 * e, como o PDV não deixa fechar o caixa com venda pendente, o caixa também.
 */
export async function flushPendingSales(
  { force = false }: { force?: boolean } = {},
): Promise<{ synced: number; pending: PendingSale[] }> {
  const pending = await listPendingSales()
  let synced = 0
  const stillPending: PendingSale[] = []

  for (const item of pending) {
    if (!force && item.failures >= MAX_SYNC_FAILURES) {
      stillPending.push(item)
      continue
    }

    const { error, status } = await callCreateSale({
      cashier_id: item.cashier_id,
      items: item.items,
      payment_method: item.payment_method,
      // Registro gravado antes da decisão #53 não tem `payments`; sem ele o
      // RPC cai no caminho de forma única, que é exatamente o que a venda era.
      payments: item.payments,
      discount: item.discount,
      session_id: item.session_id,
      idempotency_key: item.idempotency_key,
      override_expired: item.override_expired ?? false,
    })

    if (!error) {
      await removePendingSale(item.idempotency_key)
      synced++
    } else if (isNetworkFailure(status)) {
      stillPending.push(item)
    } else {
      const lastError = getErrorMessage(error)
      await incrementPendingSaleFailures(item.idempotency_key, lastError)
      stillPending.push({ ...item, failures: item.failures + 1, last_error: lastError })
    }
  }

  return { synced, pending: stillPending }
}

export async function cancelSale(saleId: string): Promise<Sale> {
  const { data, error } = await supabase.rpc('cancel_sale', { p_sale_id: saleId })
  if (error) throw error
  return data as Sale
}

export async function listSales(input: { date?: string; limit?: number } = {}): Promise<Sale[]> {
  let query = supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 50)

  if (input.date) {
    query = query.gte('created_at', `${input.date}T00:00:00`).lt('created_at', `${input.date}T23:59:59.999`)
  }

  const { data, error } = await query
  if (error) throw error
  return data as Sale[]
}

/** Linha de `sale_items` já com o vínculo de estoque/catálogo embutido, no
 * mínimo pra resolver o nome exibido. `stock_items`/`product_catalog` são
 * nulos numa linha avulsa (decisão #41), que traz `description`. */
export interface SaleItemNameRow {
  description: string | null
  stock_items: { nickname: string | null; product_catalog: { name: string | null } | null } | null
}

/** Nome de uma linha do comprovante de uma venda já gravada. Pura, testável.
 * Espelha `stockItemDisplayName` (decisão #30) e o caso avulso: descrição, se
 * houver; senão apelido do item, senão nome do catálogo, senão fallback. */
export function saleItemLineName(row: SaleItemNameRow): string {
  if (row.description) return row.description
  return row.stock_items?.nickname || row.stock_items?.product_catalog?.name || 'Sem descrição'
}

/**
 * Reconstrói o comprovante de uma venda já gravada (pra rever/reimprimir no
 * histórico do PDV). Busca em paralelo os itens (com o nome resolvido), as
 * parcelas (`sale_payments`, uma linha por forma -- decisão #53) e o nome do
 * operador (`profiles.full_name` por `cashier_id`, mesmo padrão de lookup do
 * `admin.ts`). O preço de cada linha é o congelado na venda (`unit_price`),
 * não o preço atual do estoque.
 */
export async function getSaleReceipt(
  sale: Sale,
): Promise<{ items: ReceiptLine[]; payments: RecordedPaymentSplit[]; cashierName: string | null }> {
  const [itemsRes, paymentsRes, profileRes] = await Promise.all([
    supabase
      .from('sale_items')
      .select('id, quantity, unit_price, description, stock_items(nickname, product_catalog(name))')
      .eq('sale_id', sale.id)
      .order('id'),
    supabase.from('sale_payments').select('method, amount').eq('sale_id', sale.id),
    sale.cashier_id
      ? supabase.from('profiles').select('full_name').eq('id', sale.cashier_id).maybeSingle()
      : null,
  ])
  if (itemsRes.error) throw itemsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const itemRows = (itemsRes.data ?? []) as unknown as (SaleItemNameRow & {
    id: string
    quantity: number
    unit_price: number
  })[]
  const items: ReceiptLine[] = itemRows.map((row) => ({
    key: row.id,
    name: saleItemLineName(row),
    unitPrice: row.unit_price,
    quantity: row.quantity,
  }))

  const payments: RecordedPaymentSplit[] = ((paymentsRes.data ?? []) as RecordedPaymentSplit[]).map(
    (p) => ({ method: p.method, amount: p.amount }),
  )

  // Erro ao resolver o nome do operador não trava o comprovante -- é opcional.
  const cashierName = (profileRes && !profileRes.error ? profileRes.data?.full_name : null) ?? null

  return { items, payments, cashierName }
}
