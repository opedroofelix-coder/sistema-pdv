import { getErrorMessage } from '../lib/errors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Pencil, Search, PackageSearch } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { IconButton } from '../components/ui/IconButton'
import { FilterChip } from '../components/ui/FilterChip'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonBar, SkeletonStatus } from '../components/ui/Skeleton'
import { PageHeader } from '../components/layout/PageHeader'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ConditionBadge } from '../components/receiving/ConditionBadge'
import { EditProductModal } from '../components/products/EditProductModal'
import { listAllStockItems, deleteStockItem, stockItemDisplayName } from '../lib/stockItems'
import { getBestReferencePrice, compareToReference, type ReferenceComparison } from '../lib/catalog'
import { daysUntilExpiry, formatCurrency, formatDate } from '../lib/format'
import { getWebStatusByCatalog, type WebStatus } from '../lib/nuvemshop'
import { useAuth } from '../contexts/AuthContext'
import type { StockItem } from '../lib/types'

const EXPIRY_WARNING_DAYS = 90

/** Cards desenhados por vez. Desenhar os ~3.700 itens de uma vez travava a
 * tela por segundos (mais ainda em PC/celular simples); a busca e os filtros
 * continuam sobre a lista inteira, só o desenho vai em partes, conforme a
 * rolagem chega perto do fim. */
const RENDER_BATCH = 60

function expiryClassName(expiryDate: string | null): string {
  if (!expiryDate) return 'text-ink'
  const daysLeft = daysUntilExpiry(expiryDate)
  if (daysLeft < 0) return 'font-medium text-danger'
  if (daysLeft <= EXPIRY_WARNING_DAYS) return 'font-medium text-warning'
  return 'text-ink'
}

/** Plano B do preço de referência (CLAUDE.md decisão #23): Cosmos > anotado
 * manualmente > sem referência, mesma precedência em toda a UI. Indicador em
 * pontinho colorido + rótulo (verde/âmbar/vermelho), mesmo padrão visual do
 * mockup de referência aprovado. */
const COMPARISON_TONE: Record<ReferenceComparison, string> = {
  below: 'text-success',
  near: 'text-warning',
  above: 'text-danger',
}
const COMPARISON_DOT: Record<ReferenceComparison, string> = {
  below: 'bg-success',
  near: 'bg-warning',
  above: 'bg-danger',
}

function ReferenceIndicator({ item }: { item: StockItem }) {
  const catalog = item.product_catalog
  const reference = catalog ? getBestReferencePrice(catalog) : null
  if (!reference) return <span className="text-xs text-ink-soft">Sem referência de mercado</span>

  const comparison = compareToReference(item.sale_price, reference.value)
  const pct = Math.round((item.sale_price / reference.value - 1) * 100)
  const label = comparison === 'below' ? 'Dentro da referência' : `${pct}% acima da referência`

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${COMPARISON_TONE[comparison]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COMPARISON_DOT[comparison]}`} />
      {label}
      <span className="font-normal text-ink-soft">
        {formatCurrency(reference.value)} ({reference.source === 'cosmos' ? 'Cosmos' : 'anotado'})
      </span>
    </span>
  )
}

/** Selo da integração com a Nuvemshop (decisão #66). Sem interruptor: tudo
 * que tem saldo vai pro site; o card só informa o estado. */
function WebBadge({ status }: { status: WebStatus | undefined }) {
  if (!status) return null
  return status.kind === 'ok' ? (
    <Badge tone="info">No site</Badge>
  ) : (
    <Badge tone="danger" dot>
      Erro no site
    </Badge>
  )
}

function webErrorReason(status: WebStatus | undefined): string | null {
  return status?.kind === 'error' ? status.reason : null
}

function webErrorDetail(status: WebStatus | undefined): string | undefined {
  return status?.kind === 'error' ? status.detail : undefined
}

/** Card fantasma do carregamento (decisão #73): mesma moldura e as mesmas
 * faixas do card de produto (nome/código, preço, Disponível/Validade,
 * rodapé). Peças em `components/ui/Skeleton`. */
function StockCardSkeleton() {
  return (
    <div className="flex flex-col gap-3.5 rounded-panel glass p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <SkeletonBar className="h-5 w-3/5" />
          <SkeletonBar className="h-3 w-1/3" />
        </div>
        <SkeletonBar className="h-6 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-4 w-1/4" />
        <SkeletonBar className="h-7 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SkeletonBar className="h-12 rounded-xl" />
        <SkeletonBar className="h-12 rounded-xl" />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <SkeletonBar className="h-3 w-2/5" />
        <SkeletonBar className="h-3 w-1/5" />
      </div>
    </div>
  )
}

function availableQty(item: StockItem) {
  return item.quantity - item.quantity_sold
}

export function Estoque() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Padrão desligado (decisão #56): item que zerou continua visível em /estoque
  // (produtos costumam se repetir). O filtro segue existindo pra quando o dono
  // quiser ver só o que tem saldo.
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [onlyExpiring, setOnlyExpiring] = useState(
    () => new URLSearchParams(window.location.search).get('vencendo') === '1',
  )
  const [onlyAboveReference, setOnlyAboveReference] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [editingCatalog, setEditingCatalog] = useState<StockItem | null>(null)
  const { profile } = useAuth()
  // Custo rateado só pro dono (decisão #68): é derivado do valor pago no lote.
  const isDono = profile?.role === 'dono'
  // Selo "No site"/"Erro no site" (decisão #66). Vazio quando a loja não está
  // conectada; erro aqui não atrapalha a tela -- o selo é só informativo.
  const [webStatus, setWebStatus] = useState<Map<string, WebStatus>>(new Map())

  useEffect(() => {
    listAllStockItems()
      .then(setItems)
      .finally(() => setLoading(false))
    getWebStatusByCatalog()
      .then(setWebStatus)
      .catch(() => setWebStatus(new Map()))
  }, [])

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteStockItem(deleteTarget.id)
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Erro ao excluir item.'))
    } finally {
      setDeleting(false)
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      if (onlyAvailable && availableQty(item) <= 0) return false
      if (onlyExpiring && (!item.expiry_date || daysUntilExpiry(item.expiry_date) > EXPIRY_WARNING_DAYS)) {
        return false
      }
      if (onlyAboveReference) {
        const reference = item.product_catalog ? getBestReferencePrice(item.product_catalog) : null
        if (!reference || compareToReference(item.sale_price, reference.value) !== 'above') return false
      }
      if (!term) return true
      return (
        item.product_catalog?.name?.toLowerCase().includes(term) ||
        item.nickname?.toLowerCase().includes(term) ||
        item.product_catalog?.ean?.includes(term) ||
        item.internal_code?.toLowerCase().includes(term)
      )
    })
  }, [items, search, onlyAvailable, onlyExpiring, onlyAboveReference])

  // Desenho em partes (ver RENDER_BATCH). Volta ao começo quando a busca ou
  // um filtro muda; o sentinela no fim da lista pede a próxima parte quando
  // a rolagem chega a ~1 tela de distância.
  const [renderCount, setRenderCount] = useState(RENDER_BATCH)
  useEffect(() => {
    setRenderCount(RENDER_BATCH)
  }, [search, onlyAvailable, onlyExpiring, onlyAboveReference])
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const hasMore = renderCount < filtered.length
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setRenderCount((n) => n + RENDER_BATCH)
      },
      { rootMargin: '1000px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, renderCount])
  const visible = useMemo(() => filtered.slice(0, renderCount), [filtered, renderCount])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estoque"
        meta={
          <span className="text-sm font-semibold text-ink-soft">
            {loading
              ? 'carregando…'
              : filtered.length === items.length
                ? `${items.length} itens`
                : `${filtered.length} de ${items.length} itens`}
          </span>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Buscar por nome, EAN ou código interno…"
            aria-label="Buscar no estoque"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field w-full pl-11"
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:pb-0">
          <FilterChip checked={onlyAvailable} onChange={setOnlyAvailable}>
            Só disponíveis
          </FilterChip>
          <FilterChip checked={onlyExpiring} onChange={setOnlyExpiring}>
            Vencendo em 90 dias
          </FilterChip>
          <FilterChip checked={onlyAboveReference} onChange={setOnlyAboveReference}>
            Acima da referência
          </FilterChip>
        </div>
      </div>

      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      {loading ? (
        <SkeletonStatus label="Carregando estoque…" className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <StockCardSkeleton key={i} />
          ))}
        </SkeletonStatus>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<PackageSearch size={22} />}
          title="Nenhum item encontrado."
          description="Tente outro termo de busca ou desligue algum filtro."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((item) => (
              <div key={item.id} className="flex flex-col gap-3.5 rounded-panel glass p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-ink">{stockItemDisplayName(item)}</span>
                      {availableQty(item) <= 0 && <Badge tone="neutral">Esgotado</Badge>}
                      <WebBadge status={item.catalog_id ? webStatus.get(item.catalog_id) : undefined} />
                    </div>
                    {webErrorReason(item.catalog_id ? webStatus.get(item.catalog_id) : undefined) && (
                      <div
                        className="mt-0.5 text-xs text-ink-soft"
                        title={item.catalog_id ? webErrorDetail(webStatus.get(item.catalog_id)) : undefined}
                      >
                        {webErrorReason(item.catalog_id ? webStatus.get(item.catalog_id) : undefined)}
                        {profile?.role === 'dono' && (
                          <>
                            {' '}
                            <Link to="/relatorios/nuvemshop" className="font-bold text-primary hover:underline">
                              Revisar
                            </Link>
                          </>
                        )}
                      </div>
                    )}
                    <div className="font-mono text-xs tabular-nums text-ink-soft">
                      {item.product_catalog?.ean ?? item.internal_code}
                    </div>
                    {item.product_catalog && (
                      <div className="mt-0.5 text-sm text-ink-secondary">
                        Marca:{' '}
                        {item.product_catalog.brand ? (
                          <span className="font-medium text-ink">{item.product_catalog.brand}</span>
                        ) : (
                          <span className="text-ink-soft">—</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ConditionBadge condition={item.condition} />
                    {item.product_catalog && (
                      <IconButton aria-label="Editar item" tone="primary" size="sm" onClick={() => setEditingCatalog(item)}>
                        <Pencil size={16} />
                      </IconButton>
                    )}
                    <IconButton aria-label="Excluir item" tone="danger" size="sm" onClick={() => setDeleteTarget(item)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-secondary">
                    {isDono && (
                      <>
                        Custo rateado <b className="tabular-nums text-ink">{formatCurrency(item.allocated_cost)}</b>
                      </>
                    )}
                  </span>
                  <span className="text-2xl font-bold tracking-tight tabular-nums text-ink">
                    {formatCurrency(item.sale_price)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-surface-secondary px-3 py-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Disponível</div>
                    <div className="text-[15px] font-bold tabular-nums text-ink">{availableQty(item)}</div>
                  </div>
                  <div className="rounded-xl bg-surface-secondary px-3 py-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Validade</div>
                    <div className={`text-[15px] font-bold tabular-nums ${expiryClassName(item.expiry_date)}`}>
                      {item.expiry_date ? formatDate(item.expiry_date) : '-'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <ReferenceIndicator item={item} />
                  {item.lot && (
                    <Link
                      to={`/lotes/${item.lot.id}`}
                      className="shrink-0 text-xs font-bold text-primary hover:underline"
                    >
                      {item.lot.supplier || 'Sem fornecedor'}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir item do estoque"
          message="Tem certeza? Não pode ser desfeito."
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {editingCatalog?.product_catalog && (
        <EditProductModal
          catalogId={editingCatalog.product_catalog.id}
          ean={editingCatalog.product_catalog.ean}
          currentName={editingCatalog.product_catalog.name ?? ''}
          currentBrand={editingCatalog.product_catalog.brand}
          stockItemId={editingCatalog.id}
          currentSalePrice={editingCatalog.sale_price}
          currentQuantity={editingCatalog.quantity}
          quantitySold={editingCatalog.quantity_sold}
          allocatedCost={isDono ? editingCatalog.allocated_cost : undefined}
          onCancel={() => setEditingCatalog(null)}
          onSaved={({ name, brand, sale_price, quantity }) => {
            const catalogId = editingCatalog.product_catalog!.id
            setEditingCatalog(null)
            if (sale_price !== undefined || quantity !== undefined) {
              // Preço ou quantidade mudaram -> o trigger de rateio pode ter
              // recalculado o allocated_cost de outros itens do mesmo lote;
              // refaz a busca pra refletir isso nos demais cards, não só no editado.
              listAllStockItems().then(setItems)
              return
            }
            setItems((prev) =>
              prev.map((i) =>
                i.product_catalog?.id === catalogId
                  ? { ...i, product_catalog: { ...i.product_catalog!, name, brand } }
                  : i,
              ),
            )
          }}
        />
      )}
    </div>
  )
}
