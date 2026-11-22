import { getErrorMessage } from '../lib/errors'
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { SkeletonPanel } from '../components/ui/Skeleton'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { OriginBadge } from '../components/receiving/OriginBadge'
import { ManualProductForm } from '../components/receiving/ManualProductForm'
import {
  listNcmPending,
  listEnrichmentPending,
  setCatalogNcm,
  bulkSetCatalogNcm,
  deleteCatalogItem,
} from '../lib/catalog'
import { formatDateTime } from '../lib/format'
import type { ProductCatalog } from '../lib/types'
import { PageHeader } from '../components/layout/PageHeader'

export function CatalogoPendente() {
  const [ncmPending, setNcmPending] = useState<ProductCatalog[]>([])
  const [enrichmentPending, setEnrichmentPending] = useState<ProductCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fillingId, setFillingId] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<ProductCatalog | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function refresh() {
    const [ncm, enrichment] = await Promise.all([listNcmPending(), listEnrichmentPending()])
    setNcmPending(ncm)
    setEnrichmentPending(enrichment)
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar fila.')))
      .finally(() => setLoading(false))
  }, [])

  const fillingItem = enrichmentPending.find((p) => p.id === fillingId) ?? null

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await deleteCatalogItem(deleteTarget.id)
      setNcmPending((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setEnrichmentPending((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao excluir item.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Catálogo pendente" />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <SkeletonPanel rows={6} label="Carregando catálogo pendente…" />
      ) : (
        <>
          <NcmQueue
            items={ncmPending}
            onFilled={(updated) => setNcmPending((prev) => prev.filter((p) => p.id !== updated))}
            onError={(err) => setError(err)}
            onRequestDelete={setDeleteTarget}
          />

          <Card>
            <h2 className="mb-1 text-[17px] font-bold tracking-tight text-ink">Aguardando dados do catálogo</h2>
            <p className="mb-3 text-sm text-ink-soft">
              Itens em que nenhuma fonte externa respondeu (quota/timeout/token). O job diário tenta
              de novo sozinho; se continuar aqui, preencha manualmente.
            </p>
            {enrichmentPending.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum item pendente.</p>
            ) : (
              <>
                {/* Desktop: tabela (DESIGN.md, densidade alta). */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                        <th className="py-2 pr-3">EAN</th>
                        <th className="py-2 pr-3">Origem</th>
                        <th className="py-2 pr-3">Tentativas</th>
                        <th className="py-2 pr-3">Última tentativa</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {enrichmentPending.map((item) => (
                        <tr key={item.id} className="border-b border-border">
                          <td className="py-2 pr-3 text-ink">{item.ean}</td>
                          <td className="py-2 pr-3">
                            {item.origin === 'importado' ? (
                              <OriginBadge origin={item.origin} source={item.source} />
                            ) : (
                              <span className="text-ink-secondary">{item.origin ?? '-'}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-ink-secondary">{item.enrichment_attempts}</td>
                          <td className="py-2 pr-3 text-ink-secondary">
                            {item.enrichment_last_attempt_at
                              ? formatDateTime(item.enrichment_last_attempt_at)
                              : '-'}
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <Button variant="secondary" onClick={() => setFillingId(item.id)}>
                                Preencher manualmente
                              </Button>
                              <button
                                type="button"
                                aria-label="Excluir item"
                                onClick={() => setDeleteTarget(item)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-danger hover:bg-danger/10"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: cards empilhados -- mesma tabela não cabe sem quebrar. */}
                <div className="flex flex-col gap-3 md:hidden">
                  {enrichmentPending.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{item.ean}</span>
                        <button
                          type="button"
                          aria-label="Excluir item"
                          onClick={() => setDeleteTarget(item)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-danger hover:bg-danger/10"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-ink-soft">Origem</span>
                          {item.origin === 'importado' ? (
                            <OriginBadge origin={item.origin} source={item.source} />
                          ) : (
                            <span className="text-ink-secondary">{item.origin ?? '-'}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-ink-soft">Tentativas</span>
                          <span className="text-ink-secondary">{item.enrichment_attempts}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-ink-soft">Última tentativa</span>
                          <span className="text-ink-secondary">
                            {item.enrichment_last_attempt_at
                              ? formatDateTime(item.enrichment_last_attempt_at)
                              : '-'}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        className="mt-3 w-full"
                        onClick={() => setFillingId(item.id)}
                      >
                        Preencher manualmente
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {fillingItem && (
        <ManualProductForm
          ean={fillingItem.ean}
          catalogId={fillingItem.id}
          correctionReason="unavailable"
          initialName={fillingItem.name ?? ''}
          initialBrand={fillingItem.brand}
          initialOrigin={fillingItem.origin ?? 'nacional'}
          onCreated={() => {
            setFillingId(null)
            setEnrichmentPending((prev) => prev.filter((p) => p.id !== fillingItem.id))
          }}
          onCancel={() => setFillingId(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir item do catálogo"
          message="Tem certeza? Não pode ser desfeito."
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function NcmQueue({
  items,
  onFilled,
  onError,
  onRequestDelete,
}: {
  items: ProductCatalog[]
  onFilled: (id: string) => void
  onError: (message: string) => void
  onRequestDelete: (item: ProductCatalog) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [bulkNcm, setBulkNcm] = useState('')
  const [saving, setSaving] = useState(false)

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
  }

  async function saveRow(id: string) {
    const ncm = drafts[id]?.trim()
    if (!ncm) return
    setSaving(true)
    try {
      await setCatalogNcm(id, ncm)
      onFilled(id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      onError(getErrorMessage(err, 'Erro ao salvar NCM.'))
    } finally {
      setSaving(false)
    }
  }

  async function applyBulk() {
    const ncm = bulkNcm.trim()
    if (!ncm || selected.size === 0) return
    setSaving(true)
    try {
      const ids = [...selected]
      await bulkSetCatalogNcm(ids, ncm)
      ids.forEach(onFilled)
      setSelected(new Set())
      setBulkNcm('')
    } catch (err) {
      onError(getErrorMessage(err, 'Erro ao aplicar NCM em lote.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-[17px] font-bold tracking-tight text-ink">NCM pendente</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Produtos importados sem NCM classificado. Preencha por linha, ou selecione vários que
        caem na mesma categoria fiscal e aplique o mesmo código de uma vez.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhum NCM pendente.</p>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-surface-secondary p-3">
              <span className="text-sm text-ink-secondary">{selected.size} selecionado(s)</span>
              <input
                type="text"
                placeholder="NCM"
                value={bulkNcm}
                onChange={(e) => setBulkNcm(e.target.value)}
                className="w-40 field field-sm"
              />
              <Button disabled={saving || !bulkNcm.trim()} onClick={applyBulk}>
                Aplicar aos selecionados
              </Button>
            </div>
          )}

          {/* Desktop: tabela. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-3">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3">Marca</th>
                  <th className="py-2 pr-3">Origem</th>
                  <th className="py-2 pr-3">NCM</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink">{item.name ?? 'Sem descrição'}</div>
                      <div className="text-xs text-ink-soft">{item.ean}</div>
                    </td>
                    <td className="py-2 pr-3 text-ink-secondary">{item.brand ?? '-'}</td>
                    <td className="py-2 pr-3">
                      <OriginBadge origin={item.origin} source={item.source} />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        placeholder="NCM"
                        value={drafts[item.id] ?? ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-32 field field-sm"
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          disabled={saving || !drafts[item.id]?.trim()}
                          onClick={() => saveRow(item.id)}
                        >
                          Salvar
                        </Button>
                        <button
                          type="button"
                          aria-label="Excluir item"
                          onClick={() => onRequestDelete(item)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-danger hover:bg-danger/10"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards empilhados. */}
          <div className="flex flex-col gap-3 md:hidden">
            <button
              type="button"
              onClick={toggleAll}
              className="self-start text-sm font-bold text-primary"
            >
              {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
            </button>
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{item.name ?? 'Sem descrição'}</div>
                    <div className="text-xs text-ink-soft">{item.ean}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Excluir item"
                    onClick={() => onRequestDelete(item)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-danger hover:bg-danger/10"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-xs text-ink-soft">Marca</span>
                  <span className="text-ink-secondary">{item.brand ?? '-'}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-xs text-ink-soft">Origem</span>
                  <OriginBadge origin={item.origin} source={item.source} />
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="NCM"
                    value={drafts[item.id] ?? ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-full field field-sm"
                  />
                  <Button
                    variant="secondary"
                    disabled={saving || !drafts[item.id]?.trim()}
                    onClick={() => saveRow(item.id)}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
