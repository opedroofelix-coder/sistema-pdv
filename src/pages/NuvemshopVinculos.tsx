import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SkeletonPanel } from '../components/ui/Skeleton'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getErrorMessage } from '../lib/errors'
import { formatCurrency } from '../lib/format'
import {
  enableAutoCreate,
  getConnection,
  linkProduct,
  listExcluded,
  listPendingCatalog,
  listUnmatched,
  setCatalogChoice,
  setUnmatchedIgnored,
  suggestMatches,
  type NuvemshopConnection,
  type PendingCatalog,
  type UnmatchedVariant,
} from '../lib/nuvemshop'

const PICKER_LIMIT = 8

function matchesTerm(term: string, ...fields: (string | null | undefined)[]) {
  if (!term) return true
  return fields.some((f) => f?.toLowerCase().includes(term))
}

/**
 * Revisão dos vínculos com a Nuvemshop (decisão #66, tela 2 do mockup
 * aprovado). Na primeira conexão o sistema casa sozinho tudo que tem o mesmo
 * código de barras e ESPERA o dono revisar o resto antes de criar qualquer
 * produto no site -- evita duplicar algo que já está lá com outro código.
 */
export function NuvemshopVinculos() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [connection, setConnection] = useState<NuvemshopConnection | null>(null)
  const [pending, setPending] = useState<PendingCatalog[]>([])
  const [unmatched, setUnmatched] = useState<UnmatchedVariant[]>([])
  const [excluded, setExcluded] = useState<{ catalog_id: string; name: string | null; ean: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [searchHere, setSearchHere] = useState('')
  const [searchSite, setSearchSite] = useState('')
  /** Picker aberto: "Vincular a…" de um produto daqui ou de uma variante do site. */
  const [picker, setPicker] = useState<{ side: 'here'; id: string } | { side: 'site'; id: number } | null>(null)
  const [pickerTerm, setPickerTerm] = useState('')

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [conn, p, u, e] = await Promise.all([
        getConnection(),
        listPendingCatalog(),
        listUnmatched(),
        listExcluded(),
      ])
      setConnection(conn)
      setPending(p)
      setUnmatched(u)
      setExcluded(e)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar os vínculos.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const hereTerm = searchHere.trim().toLowerCase()
  const siteTerm = searchSite.trim().toLowerCase()
  const visiblePending = useMemo(
    () => pending.filter((p) => matchesTerm(hereTerm, p.name, p.ean, p.sku, p.brand)),
    [pending, hereTerm],
  )
  const activeUnmatched = useMemo(() => unmatched.filter((u) => !u.ignored), [unmatched])
  const visibleUnmatched = useMemo(
    () => unmatched.filter((u) => matchesTerm(siteTerm, u.name, u.barcode, u.sku)),
    [unmatched, siteTerm],
  )
  const remaining = pending.filter((p) => p.choice === null).length

  if (profile && profile.role !== 'dono') {
    return <Navigate to={profile.role === 'caixa' ? '/pdv' : '/lotes'} replace />
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      showToast(success, 'success')
      setPicker(null)
      setPickerTerm('')
      await refresh()
    } catch (err) {
      showToast(getErrorMessage(err, 'Não foi possível concluir.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const pickerOptions =
    picker?.side === 'here'
      ? activeUnmatched
          .filter((u) => matchesTerm(pickerTerm.trim().toLowerCase(), u.name, u.barcode, u.sku))
          .slice(0, PICKER_LIMIT)
      : picker?.side === 'site'
        ? pending
            .filter((p) => matchesTerm(pickerTerm.trim().toLowerCase(), p.name, p.ean, p.sku))
            .slice(0, PICKER_LIMIT)
        : []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/relatorios" className="text-sm font-bold text-primary hover:underline">
            ← Integrações
          </Link>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink md:text-[30px]">Revisar vínculos</h1>
          {!loading && (
            <p className="text-sm text-ink-soft">
              {pending.length} produto{pending.length === 1 ? '' : 's'} daqui e {activeUnmatched.length} do site
              ficaram sem par
            </p>
          )}
        </div>
        {connection && !connection.auto_create && remaining > 0 && (
          <Button
            disabled={busy}
            onClick={() =>
              run(enableAutoCreate, `${remaining} produto(s) entraram na fila pra criar no site.`)
            }
          >
            {remaining === 1 ? 'Criar o 1 restante no site' : `Criar os ${remaining} restantes no site`}
          </Button>
        )}
        {connection?.auto_create && (
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-ink-secondary">
            Produto novo com saldo é criado no site sozinho
          </span>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonPanel rows={6} label="Carregando vínculos…" />
          <SkeletonPanel rows={6} label="Carregando vínculos…" />
        </div>
      ) : !connection ? (
        <Card>
          <p className="text-sm text-ink-secondary">
            A loja ainda não está conectada. Conecte em{' '}
            <Link to="/relatorios" className="font-bold text-primary hover:underline">
              Integrações
            </Link>
            .
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Daqui, sem par no site */}
          <Card className="min-w-0">
            <ColumnHeader title="Daqui, sem par no site" count={pending.length} />
            <input
              id="busca-daqui"
              value={searchHere}
              onChange={(e) => setSearchHere(e.target.value)}
              placeholder="Buscar por nome ou código…"
              className="mb-1 w-full field"
            />
            {visiblePending.length === 0 ? (
              <p className="py-3 text-sm text-ink-soft">Nada pra revisar aqui.</p>
            ) : (
              visiblePending.map((p) => {
                const suggestions = p.choice === null ? suggestMatches(p.name, activeUnmatched) : []
                const pickerOpen = picker?.side === 'here' && picker.id === p.catalog_id
                return (
                  <div key={p.catalog_id} className="flex gap-3 border-t border-border py-3">
                    <Thumb src={p.photo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">{p.name ?? 'Sem nome'}</div>
                      <div className="text-xs tabular-nums text-ink-soft">
                        {p.ean ? `EAN ${p.ean}` : `Código interno ${p.sku ?? '—'}`} · {p.available} unid. ·{' '}
                        {formatCurrency(Number(p.create_price ?? 0))}
                      </div>

                      {p.choice === 'create' && (
                        <p className="mt-1 text-xs text-info">Na fila pra criar no site.</p>
                      )}
                      {p.choice === 'review' && (
                        <p className="mt-1 text-xs text-danger">{p.reason ?? 'Precisa de revisão.'}</p>
                      )}

                      {suggestions.length > 0 && !pickerOpen && (
                        <div className="mt-2 rounded-xl border border-primary/50 px-3 py-2">
                          <div className="mb-1 text-xs text-ink-soft">Parecidos no site:</div>
                          <div className="divide-y divide-border">
                            {suggestions.map((s) => (
                              <div
                                key={s.ns_variant_id}
                                className="flex items-center justify-between gap-2 py-1.5 text-xs"
                              >
                                <span className="min-w-0 text-ink-secondary">
                                  {s.name} · {s.barcode ? `código ${s.barcode}` : s.sku ? `SKU ${s.sku}` : 'sem código'}
                                </span>
                                <Button
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => run(() => linkProduct(p.catalog_id, s.ns_variant_id), 'Produto vinculado.')}
                                >
                                  Vincular
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {pickerOpen && (
                        <Picker
                          term={pickerTerm}
                          onTerm={setPickerTerm}
                          onClose={() => setPicker(null)}
                          options={pickerOptions.map((o) => {
                            const u = o as UnmatchedVariant
                            return {
                              key: String(u.ns_variant_id),
                              label: u.name,
                              sub: u.barcode ? `código ${u.barcode}` : u.sku ? `SKU ${u.sku}` : 'sem código',
                              onPick: () => run(() => linkProduct(p.catalog_id, u.ns_variant_id), 'Produto vinculado.'),
                            }
                          })}
                          busy={busy}
                        />
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {!pickerOpen && activeUnmatched.length > 0 && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              setPicker({ side: 'here', id: p.catalog_id })
                              setPickerTerm('')
                            }}
                          >
                            Vincular a…
                          </Button>
                        )}
                        {p.choice === 'create' ? (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => run(() => setCatalogChoice(p.catalog_id, null), 'Criação desfeita.')}
                          >
                            Desfazer
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(() => setCatalogChoice(p.catalog_id, 'create'), 'Produto na fila pra criar no site.')
                            }
                          >
                            Criar no site
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run(() => setCatalogChoice(p.catalog_id, 'exclude'), 'Produto não vai pro site.')
                          }
                        >
                          Não vender no site
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}

            {excluded.length > 0 && (
              <details className="mt-3 border-t border-border pt-3">
                <summary className="cursor-pointer text-sm text-ink-secondary">
                  Fora do site ({excluded.length})
                </summary>
                {excluded.map((e) => (
                  <div key={e.catalog_id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span className="min-w-0 text-ink-secondary">{e.name ?? e.ean ?? 'Sem nome'}</span>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => run(() => setCatalogChoice(e.catalog_id, null), 'Produto volta pra revisão.')}
                    >
                      Desfazer
                    </Button>
                  </div>
                ))}
              </details>
            )}
          </Card>

          {/* Do site, sem par aqui */}
          <Card className="min-w-0">
            <ColumnHeader title="Do site, sem par aqui" count={activeUnmatched.length} />
            <input
              id="busca-site"
              value={searchSite}
              onChange={(e) => setSearchSite(e.target.value)}
              placeholder="Buscar no site…"
              className="mb-1 w-full field"
            />
            {visibleUnmatched.length === 0 ? (
              <p className="py-3 text-sm text-ink-soft">Nada pra revisar aqui.</p>
            ) : (
              visibleUnmatched.map((u) => {
                const pickerOpen = picker?.side === 'site' && picker.id === u.ns_variant_id
                return (
                  <div
                    key={u.ns_variant_id}
                    className={`flex gap-3 border-t border-border py-3 ${u.ignored ? 'opacity-60' : ''}`}
                  >
                    <Thumb src={u.image_url} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">{u.name}</div>
                      <div className="text-xs tabular-nums text-ink-soft">
                        {u.barcode ? `Código de barras ${u.barcode}` : 'Sem código de barras'}
                        {u.sku ? ` · SKU ${u.sku}` : ''} · estoque no site: {u.stock ?? '—'}
                      </div>

                      {pickerOpen && (
                        <Picker
                          term={pickerTerm}
                          onTerm={setPickerTerm}
                          onClose={() => setPicker(null)}
                          options={pickerOptions.map((o) => {
                            const p = o as PendingCatalog
                            return {
                              key: p.catalog_id,
                              label: p.name ?? 'Sem nome',
                              sub: `${p.ean ? `EAN ${p.ean}` : `Código ${p.sku ?? '—'}`} · ${p.available} unid.`,
                              onPick: () => run(() => linkProduct(p.catalog_id, u.ns_variant_id), 'Produto vinculado.'),
                            }
                          })}
                          busy={busy}
                        />
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {u.ignored ? (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => run(() => setUnmatchedIgnored(u.ns_variant_id, false), 'Produto volta pra revisão.')}
                          >
                            Desfazer
                          </Button>
                        ) : (
                          <>
                            {!pickerOpen && pending.length > 0 && (
                              <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() => {
                                  setPicker({ side: 'site', id: u.ns_variant_id })
                                  setPickerTerm('')
                                }}
                              >
                                Vincular a…
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => run(() => setUnmatchedIgnored(u.ns_variant_id, true), 'Produto ignorado.')}
                            >
                              Ignorar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <p className="mt-3 text-xs text-ink-soft">
              Produto do site ignorado não é tocado pelo sistema: o estoque dele continua sendo editado na
              Nuvemshop.
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}

function ColumnHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
      <span className="text-xs tabular-nums text-ink-soft">{count}</span>
    </div>
  )
}

function Thumb({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-surface-secondary object-cover" />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-[10px] text-ink-soft">
      sem foto
    </div>
  )
}

function Picker({
  term,
  onTerm,
  onClose,
  options,
  busy,
}: {
  term: string
  onTerm: (value: string) => void
  onClose: () => void
  options: { key: string; label: string; sub: string; onPick: () => void }[]
  busy: boolean
}) {
  return (
    <div className="mt-2 rounded-xl border border-primary/50 p-2">
      <div className="flex gap-2">
        <input
          id="busca-vinculo"
          autoFocus
          value={term}
          onChange={(e) => onTerm(e.target.value)}
          placeholder="Buscar o par…"
          className="w-full field field-sm"
        />
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </div>
      {options.length === 0 ? (
        <p className="px-1 pt-2 text-xs text-ink-soft">Nenhum produto encontrado.</p>
      ) : (
        options.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={busy}
            onClick={o.onPick}
            className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left text-sm hover:bg-primary/[0.08] disabled:opacity-40"
          >
            <span className="text-ink">{o.label}</span>
            <span className="text-xs text-ink-soft">{o.sub}</span>
          </button>
        ))
      )}
    </div>
  )
}
