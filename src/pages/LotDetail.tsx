import { getErrorMessage } from '../lib/errors'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { ArrowLeft, Camera, Lock, Pencil, Printer, RotateCcw, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { IconButton } from '../components/ui/IconButton'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SkeletonBar, SkeletonCards, SkeletonStatus } from '../components/ui/Skeleton'
import { PrintPortal } from '../components/ui/PrintPortal'
import { BarcodeInput } from '../components/scanner/BarcodeInput'
import { CameraScanner } from '../components/scanner/CameraScanner'
import { ManualProductForm } from '../components/receiving/ManualProductForm'
import { ReceivingFlow } from '../components/receiving/ReceivingFlow'
import { StockItemsTable } from '../components/receiving/StockItemRow'
import { LabelPrint } from '../components/receiving/LabelPrint'
import { EditLotModal } from '../components/lots/EditLotModal'
import { getLot, closeLot, reopenLot, deleteLot } from '../lib/lots'
import { listItemsByLot, updateStockItem, splitUnit } from '../lib/stockItems'
import { lookupProduct } from '../lib/catalog'
import { formatCurrency, formatDate } from '../lib/format'
import type { Lot, StockItem, ProductCatalog } from '../lib/types'
import { PageHeader } from '../components/layout/PageHeader'

type LotAction = 'close' | 'reopen' | 'delete'

interface ActionCopy {
  title: string
  message: string
  confirmLabel: string
  busyLabel: string
  variant: 'primary' | 'danger'
  /** Aviso de sucesso (decisão #58); o de erro é a mensagem da própria RPC. */
  success: string
}

const ACTION_DIALOG: Record<LotAction, ActionCopy> = {
  close: {
    title: 'Fechar lote',
    message:
      'Depois de fechado, os itens não podem mais ser editados e ficam liberados pra venda.',
    confirmLabel: 'Fechar lote',
    busyLabel: 'Fechando…',
    variant: 'primary',
    success: 'Lote fechado.',
  },
  reopen: {
    title: 'Reabrir lote',
    message:
      'O lote volta pra conferência: os itens ficam editáveis de novo e o rateio é recalculado. Itens já vendidos não são afetados.',
    confirmLabel: 'Reabrir lote',
    busyLabel: 'Reabrindo…',
    variant: 'primary',
    success: 'Lote reaberto.',
  },
  delete: {
    title: 'Excluir lote',
    message: 'Esta ação não pode ser desfeita. O lote precisa estar sem itens cadastrados.',
    confirmLabel: 'Excluir lote',
    busyLabel: 'Excluindo…',
    variant: 'danger',
    success: 'Lote excluído.',
  },
}

export function LotDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [lot, setLot] = useState<Lot | null>(null)
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [manualPrompt, setManualPrompt] = useState<{
    ean: string | null
    // Presente quando o cadastro foi aberto por falta de cota (decisão
    // #18/#37): corrige a entrada de catálogo `pending` já criada, em vez de
    // duplicar; ausente quando nenhuma fonte reconheceu o código.
    catalog?: ProductCatalog
  } | null>(null)
  const [receiving, setReceiving] = useState<{
    catalog: ProductCatalog
    startAt: 'photo' | 'pricing'
  } | null>(null)
  const [showLabels, setShowLabels] = useState(false)
  // Fechar, reabrir e excluir passam por confirmação (decisão #57); `busy`
  // serve às três, já que só uma pode estar aberta por vez.
  const [confirm, setConfirm] = useState<LotAction | null>(null)
  const [busy, setBusy] = useState(false)
  // Editar lote (decisão #65): modal próprio, sem passar pelo ConfirmDialog --
  // a confirmação do valor pago vive dentro dele.
  const [editing, setEditing] = useState(false)

  const refresh = useCallback(async () => {
    if (!id) return
    const [lotData, itemsData] = await Promise.all([getLot(id), listItemsByLot(id)])
    setLot(lotData)
    setItems(itemsData)
  }, [id])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const closed = lot?.status === 'closed'
  const isDono = profile?.role === 'dono'
  const promptOpen = manualPrompt !== null
  const receivingOpen = receiving !== null
  const pendingEnrichmentCount = items.filter(
    (item) => item.product_catalog?.enrichment_status === 'pending',
  ).length

  async function handleScan(code: string) {
    if (!id || closed) return
    setError(null)
    try {
      const catalog = await lookupProduct(code)
      if (catalog?.enrichment_status === 'pending') {
        // Cascata de catálogo falhou por infra (quota/timeout/auth) em alguma
        // fonte -- o item entrou como placeholder e iria pra fila do dia
        // seguinte. Em vez de mandar direto pra precificação sem nome, abre o
        // cadastro rápido pro operador preencher na hora (decisão #37),
        // corrigindo a mesma entrada `pending` (sem duplicar).
        setManualPrompt({ ean: catalog.ean, catalog })
      } else if (catalog) {
        setReceiving({ catalog, startAt: 'photo' })
      } else {
        setManualPrompt({ ean: code })
      }
    } catch (err) {
      Sentry.captureException(err)
      setError(getErrorMessage(err, 'Erro ao processar o código.'))
    }
  }

  function handleManualCreated(catalog: ProductCatalog) {
    setManualPrompt(null)
    setReceiving({ catalog, startAt: 'pricing' })
  }

  async function handleReceivingDone() {
    setReceiving(null)
    await refresh()
  }

  async function handleUpdate(
    itemId: string,
    patch: Partial<Pick<StockItem, 'sale_price' | 'condition' | 'quantity' | 'expiry_date' | 'nickname'>>,
  ) {
    try {
      await updateStockItem(itemId, patch)
      await refresh()
    } catch (err) {
      Sentry.captureException(err)
      setError(getErrorMessage(err, 'Erro ao atualizar item.'))
    }
  }

  async function handleSplit(item: StockItem) {
    try {
      await splitUnit(item)
      await refresh()
    } catch (err) {
      Sentry.captureException(err)
      setError(getErrorMessage(err, 'Erro ao separar unidade.'))
    }
  }

  async function handleConfirm() {
    if (!id || !confirm) return
    setBusy(true)
    setError(null)
    try {
      if (confirm === 'close') await closeLot(id)
      else if (confirm === 'reopen') await reopenLot(id)
      else await deleteLot(id)

      setConfirm(null)
      showToast(ACTION_DIALOG[confirm].success, 'success')
      // Excluído, não há mais tela pra atualizar -- o lote deixou de existir.
      // O toast vive acima do roteador, então sobrevive a esta navegação.
      if (confirm === 'delete') navigate('/lotes')
      else await refresh()
    } catch (err) {
      Sentry.captureException(err)
      // Mensagem do `raise exception` da RPC (ex.: lote com itens ou com
      // venda) -- vai pro toast, não pro texto vermelho da página, pra não
      // aparecer o mesmo aviso em dois lugares (decisão #58).
      showToast(getErrorMessage(err, 'Erro ao atualizar o lote.'), 'error')
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleEdited() {
    setEditing(false)
    // `refresh` aqui não é cosmético: além do cabeçalho (fornecedor/valor/data),
    // ele recarrega os itens, cujo `allocated_cost` o trigger `lots_recalc`
    // (0002_receiving.sql) acabou de recalcular se o valor pago mudou.
    await refresh()
    showToast('Lote atualizado.', 'success')
  }

  if (loading || !lot) {
    return (
      <SkeletonStatus label="Carregando lote…" className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <SkeletonBar className="h-12 w-12 rounded-xl" />
          <SkeletonBar className="h-9 w-56" />
        </div>
        <SkeletonBar className="h-[72px] w-full rounded-panel" />
        <SkeletonCards count={4} className="grid gap-3" />
      </SkeletonStatus>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        leading={
          <IconButton aria-label="Voltar para Lotes" onClick={() => navigate('/lotes')}>
            <ArrowLeft size={20} />
          </IconButton>
        }
        title={lot.supplier || 'Sem fornecedor'}
        meta={
          <span className="text-sm font-semibold text-ink-soft">
            {/* Valor pago só pro dono (decisão #68). */}
            {isDono && <>{formatCurrency(Number(lot.purchase_value))} · </>}
            {formatDate(lot.purchase_date)} ·{' '}
            {closed ? 'Fechado' : 'Recebendo'}
          </span>
        }
        actions={
          isDono && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil size={16} />
                Editar lote
              </Button>
              <Button variant="danger" onClick={() => setConfirm('delete')}>
                <Trash2 size={16} />
                Excluir lote
              </Button>
              {closed ? (
                <Button variant="secondary" onClick={() => setConfirm('reopen')}>
                  <RotateCcw size={16} />
                  Reabrir lote
                </Button>
              ) : (
                <Button onClick={() => setConfirm('close')}>
                  <Lock size={16} />
                  Fechar lote
                </Button>
              )}
            </>
          )
        }
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {!closed && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <BarcodeInput onScan={handleScan} disabled={cameraOpen || promptOpen || receivingOpen} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCameraOpen(true)}>
              <Camera size={16} />
              Câmera
            </Button>
            <Button variant="secondary" onClick={() => setManualPrompt({ ean: null })}>
              Sem código
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Itens</h2>
          {pendingEnrichmentCount > 0 && (
            <Badge tone="warning">
              {pendingEnrichmentCount} item{pendingEnrichmentCount === 1 ? '' : 's'} aguardando dados do
              catálogo
            </Badge>
          )}
        </div>
        {items.length > 0 && (
          <Button variant="ghost" onClick={() => setShowLabels((v) => !v)}>
            <Printer size={16} />
            {showLabels ? 'Ocultar etiquetas' : 'Etiquetas'}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Card>
          <StockItemsTable
            items={items}
            disabled={closed}
            onUpdate={handleUpdate}
            onSplit={handleSplit}
            showCost={isDono}
          />
        </Card>
      ) : (
        <StockItemsTable
            items={items}
            disabled={closed}
            onUpdate={handleUpdate}
            onSplit={handleSplit}
            showCost={isDono}
          />
      )}

      {showLabels && items.length > 0 && (
        <>
          <Card>
            <div className="mb-3 flex items-center justify-between print:hidden">
              <h2 className="text-[17px] font-bold tracking-tight text-ink">Etiquetas</h2>
              <Button onClick={() => window.print()}>Imprimir</Button>
            </div>
            <LabelPrint items={items} />
          </Card>
          <PrintPortal>
            <LabelPrint items={items} />
          </PrintPortal>
        </>
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

      {manualPrompt && (
        <ManualProductForm
          ean={manualPrompt.ean}
          catalogId={manualPrompt.catalog?.id}
          correctionReason={manualPrompt.catalog ? 'unavailable' : undefined}
          initialName={manualPrompt.catalog?.name ?? ''}
          initialBrand={manualPrompt.catalog?.brand}
          initialOrigin={manualPrompt.catalog?.origin ?? 'nacional'}
          lotItems={items}
          onCreated={handleManualCreated}
          onCancel={() => setManualPrompt(null)}
        />
      )}

      {receiving && (
        <ReceivingFlow
          lot={lot}
          items={items}
          catalog={receiving.catalog}
          startAt={receiving.startAt}
          onDone={handleReceivingDone}
          onCancel={() => setReceiving(null)}
          showCost={isDono}
        />
      )}

      {editing && (
        <EditLotModal
          lot={lot}
          onSaved={handleEdited}
          onCancel={() => setEditing(false)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={ACTION_DIALOG[confirm].title}
          message={ACTION_DIALOG[confirm].message}
          confirmLabel={ACTION_DIALOG[confirm].confirmLabel}
          busyLabel={ACTION_DIALOG[confirm].busyLabel}
          variant={ACTION_DIALOG[confirm].variant}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
