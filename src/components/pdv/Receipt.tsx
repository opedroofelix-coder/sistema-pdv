import { formatCurrency, formatDateTime } from '../../lib/format'
import { PAYMENT_LABEL } from '../../lib/sales'
import type { RecordedPaymentSplit, ReceiptLine, Sale } from '../../lib/types'

// `ReceiptLine` vive em types.ts (pra sales.ts montá-la sem importar de um
// componente); re-exportado aqui pra os call sites antigos não mudarem.
export type { ReceiptLine }

interface ReceiptProps {
  sale: Sale
  items: ReceiptLine[]
  cashierName: string
  amountReceived?: number
  /** Uma entrada por forma de pagamento (decisão #53). Ausente em venda antiga
   * do histórico, que só tem a forma única em `sale.payment_method`. */
  payments?: RecordedPaymentSplit[]
}

export function Receipt({ sale, items, cashierName, amountReceived, payments }: ReceiptProps) {
  const subtotal = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0)
  // Troco sai sobre a parte em espécie, não sobre o total: numa venda mista o
  // cliente entrega a nota só pra essa parcela (decisão #53).
  const cashAmount =
    payments?.find((p) => p.method === 'dinheiro')?.amount ??
    (sale.payment_method === 'dinheiro' ? sale.total : 0)
  const change = cashAmount > 0 && amountReceived != null ? amountReceived - cashAmount : null

  return (
    <div className="receipt-sheet mx-auto flex w-[80mm] flex-col gap-1 bg-white p-3 text-xs text-gray-900">
      <div className="text-center">
        <p className="font-semibold">Sistema PDV</p>
        <p>Comprovante não fiscal</p>
        <p>{formatDateTime(sale.created_at)}</p>
      </div>
      <div className="border-t border-dashed border-gray-400 py-1">
        {items.map((i) => (
          <div key={i.key} className="flex justify-between gap-2">
            <span className="flex-1">
              {i.quantity}x {i.name}
            </span>
            <span>{formatCurrency(i.unitPrice * i.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-gray-400 py-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between">
            <span>Desconto</span>
            <span>- {formatCurrency(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatCurrency(sale.total)}</span>
        </div>
        {payments && payments.length > 1 ? (
          // Venda dividida: uma linha por forma, com o valor de cada uma.
          payments.map((p) => (
            <div key={p.method} className="flex justify-between">
              <span>{PAYMENT_LABEL[p.method]}</span>
              <span>{formatCurrency(p.amount)}</span>
            </div>
          ))
        ) : (
          <div className="flex justify-between">
            <span>Pagamento</span>
            <span>
              {payments?.[0]
                ? PAYMENT_LABEL[payments[0].method]
                : sale.payment_method && sale.payment_method !== 'misto'
                  ? PAYMENT_LABEL[sale.payment_method]
                  : '-'}
            </span>
          </div>
        )}
        {amountReceived != null && (
          <div className="flex justify-between">
            <span>Recebido</span>
            <span>{formatCurrency(amountReceived)}</span>
          </div>
        )}
        {change != null && (
          <div className="flex justify-between">
            <span>Troco</span>
            <span>{formatCurrency(change)}</span>
          </div>
        )}
      </div>
      <div className="border-t border-dashed border-gray-400 pt-1 text-center">
        <p>Operador: {cashierName}</p>
      </div>
    </div>
  )
}
