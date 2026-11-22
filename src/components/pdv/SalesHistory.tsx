import { getErrorMessage } from '../../lib/errors'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Printer, ReceiptText } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { Card } from '../ui/Card'
import { SkeletonBar, SkeletonRows, SkeletonStatus } from '../ui/Skeleton'
import { Button } from '../ui/Button'
import { PrintPortal } from '../ui/PrintPortal'
import { Receipt } from './Receipt'
import { listSales, cancelSale, getSaleReceipt, PAYMENT_LABEL } from '../../lib/sales'
import { formatCurrency, formatDateTime } from '../../lib/format'
import type { RecordedPaymentSplit, ReceiptLine, Sale, SalePaymentMethod } from '../../lib/types'

/** Rótulo da forma da venda, incluindo o caso dividido (decisão #53). O
 * detalhe por forma fica no comprovante; aqui a coluna é estreita. */
function paymentLabel(method: SalePaymentMethod | null): string {
  if (!method) return '-'
  return method === 'misto' ? 'Misto' : PAYMENT_LABEL[method]
}

/** Selo do canal (decisão #66): "Loja" neutro, "Site · #pedido" em azul. */
function ChannelBadge({ sale }: { sale: Sale }) {
  if (sale.channel === 'site') {
    return (
      <Badge tone="info">Site{sale.external_order_number ? ` · #${sale.external_order_number}` : ''}</Badge>
    )
  }
  return <Badge tone="neutral">Loja</Badge>
}

interface SaleDetail {
  items: ReceiptLine[]
  payments: RecordedPaymentSplit[]
  cashierName: string | null
}

/** Comprovante adaptado à tela (mais largo que o cupom térmico de 80mm) de uma
 * venda já concluída. A impressão continua saindo pelo <Receipt>/PrintPortal
 * no formato térmico -- este painel é só a leitura na tela. */
function SaleReceiptPanel({
  sale,
  detail,
  loading,
  onPrint,
}: {
  sale: Sale
  detail: SaleDetail | null
  loading: boolean
  onPrint: () => void
}) {
  if (loading || !detail) {
    return (
      <div className="rounded-xl border border-border bg-surface-secondary p-4">
        <SkeletonStatus label="Carregando comprovante…" className="flex flex-col gap-2.5">
          <SkeletonBar className="h-3.5 w-1/3" />
          <SkeletonBar className="h-3.5 w-3/5" />
          <SkeletonBar className="h-3.5 w-1/2" />
          <SkeletonBar className="mt-1 h-5 w-1/4" />
        </SkeletonStatus>
      </div>
    )
  }

  const subtotal = detail.items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0)
  const multi = detail.payments.length > 1

  return (
    <div
      data-testid="sale-history-receipt"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-secondary p-4"
    >
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-soft">
        <span>Comprovante não fiscal</span>
        <span className="normal-case">
          {formatDateTime(sale.created_at)}
          {detail.cashierName ? ` · ${detail.cashierName}` : ''}
        </span>
      </div>

      {sale.status === 'cancelled' && (
        <Badge tone="danger" className="self-start">Venda cancelada</Badge>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
        {detail.items.map((i) => (
          <div key={i.key} className="flex justify-between gap-3">
            <span className="min-w-0 font-semibold text-ink">
              {i.quantity}x {i.name}
            </span>
            <span className="shrink-0 tabular-nums text-ink-secondary">
              {formatCurrency(i.unitPrice * i.quantity)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
        <div className="flex justify-between text-ink-secondary">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-ink-secondary">
            <span>Desconto</span>
            <span className="tabular-nums">- {formatCurrency(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-ink">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(sale.total)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
        {multi ? (
          detail.payments.map((p) => (
            <div key={p.method} className="flex justify-between text-ink-secondary">
              <span>{PAYMENT_LABEL[p.method]}</span>
              <span className="tabular-nums">{formatCurrency(p.amount)}</span>
            </div>
          ))
        ) : (
          <div className="flex justify-between text-ink-secondary">
            <span>Pagamento</span>
            <span>
              {detail.payments[0] ? PAYMENT_LABEL[detail.payments[0].method] : paymentLabel(sale.payment_method)}
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onPrint}>
          <Printer size={16} />
          Imprimir
        </Button>
      </div>
    </div>
  )
}

interface SalesHistoryProps {
  canCancel: boolean
  refreshKey: number
}

export function SalesHistory({ canCancel, refreshKey }: SalesHistoryProps) {
  const [sales, setSales] = useState<Sale[]>([])
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Acordeão: no máximo uma venda aberta por vez. Guardamos o objeto Sale (não
  // só o id) pra montar o comprovante sem procurar de novo na lista.
  const [expandedSale, setExpandedSale] = useState<Sale | null>(null)
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const refresh = useCallback(async () => {
    setSales(await listSales({ date: date || undefined }))
  }, [date])

  useEffect(() => {
    setLoading(true)
    // Recarregar a lista (nova venda, troca de data) fecha o painel aberto: a
    // venda pode nem estar na lista nova, ou ter mudado de status.
    setExpandedSale(null)
    refresh().finally(() => setLoading(false))
  }, [refresh, refreshKey])

  // Busca o detalhe do comprovante quando uma venda é aberta. A flag cancela a
  // resposta de uma venda anterior se o operador clicar em outra antes dela
  // resolver (senão o detalhe da primeira sobrescreveria o da segunda).
  useEffect(() => {
    if (!expandedSale) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetail(null)
    setDetailLoading(true)
    getSaleReceipt(expandedSale)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Erro ao carregar comprovante.'))
          setExpandedSale(null)
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expandedSale])

  function toggle(sale: Sale) {
    setError(null)
    setExpandedSale((prev) => (prev?.id === sale.id ? null : sale))
  }

  async function handleCancel(saleId: string) {
    setError(null)
    try {
      await cancelSale(saleId)
      await refresh()
      setExpandedSale(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao cancelar venda.'))
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-bold tracking-tight text-ink">Vendas</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="field field-sm"
        />
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {loading ? (
        <SkeletonRows rows={5} label="Carregando vendas…" />
      ) : sales.length === 0 ? (
        <EmptyState icon={<ReceiptText size={22} />} title="Nenhuma venda encontrada." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Canal</th>
                <th className="py-2 pr-3">Pagamento</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const open = expandedSale?.id === sale.id
                return (
                  <Fragment key={sale.id}>
                    <tr
                      onClick={() => toggle(sale)}
                      className={`cursor-pointer border-b border-border transition-colors hover:bg-primary/[0.05] ${open ? 'bg-primary/[0.05]' : ''}`}
                    >
                      <td className="py-3 pr-3 font-semibold text-ink">
                        <span className="flex items-center gap-1.5">
                          {open ? (
                            <ChevronDown size={15} className="shrink-0 text-ink-soft" />
                          ) : (
                            <ChevronRight size={15} className="shrink-0 text-ink-soft" />
                          )}
                          {formatDateTime(sale.created_at)}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <ChannelBadge sale={sale} />
                      </td>
                      <td className="py-3 pr-3 text-ink-secondary">{paymentLabel(sale.payment_method)}</td>
                      <td className="py-3 pr-3 font-bold tabular-nums text-ink">{formatCurrency(sale.total)}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={sale.status === 'completed' ? 'success' : 'danger'} dot>
                          {sale.status === 'completed' ? 'Concluída' : 'Cancelada'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        {canCancel && sale.status === 'completed' && (
                          <Button
                            variant="danger"
                            size="sm"
                            // Venda do site cancela-se na Nuvemshop; o webhook
                            // devolve o estoque aqui (decisão #66). O servidor
                            // também recusa (guarda no cancel_sale).
                            disabled={sale.channel === 'site'}
                            title={sale.channel === 'site' ? 'Cancele o pedido na Nuvemshop' : undefined}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCancel(sale.id)
                            }}
                          >
                            Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border">
                        <td colSpan={6} className="py-3">
                          <SaleReceiptPanel
                            sale={sale}
                            detail={detail}
                            loading={detailLoading}
                            onPrint={() => window.print()}
                          />
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

      {/* Cópia térmica 80mm da venda aberta, latente pra impressão (mesmo
          mecanismo do Pdv.tsx). Sem troco numa reimpressão -- não temos o valor
          recebido de uma venda antiga. O modal pós-venda do Pdv cobre a tela
          quando aberto, então nunca há dois PrintPortal ativos ao imprimir. */}
      {expandedSale && detail && (
        <PrintPortal>
          <Receipt
            sale={expandedSale}
            items={detail.items}
            cashierName={detail.cashierName ?? ''}
            payments={detail.payments}
          />
        </PrintPortal>
      )}
    </Card>
  )
}
