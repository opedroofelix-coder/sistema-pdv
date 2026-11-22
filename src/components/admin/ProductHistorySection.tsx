import { getErrorMessage } from '../../lib/errors'
import { useState } from 'react'
import { Card } from '../ui/Card'
import { SkeletonRows } from '../ui/Skeleton'
import { formatDate } from '../../lib/format'
import {
  searchProductsForHistory,
  getProductHistory,
  type ProductSearchResult,
  type ProductHistory,
  type HistoryEntry,
} from '../../lib/admin'

export function ProductHistorySection() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [selected, setSelected] = useState<ProductSearchResult | null>(null)
  const [history, setHistory] = useState<ProductHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(value: string) {
    setTerm(value)
    setError(null)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    try {
      setResults(await searchProductsForHistory(value.trim()))
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao buscar produto.'))
    }
  }

  async function selectProduct(product: ProductSearchResult) {
    setSelected(product)
    setResults([])
    setTerm('')
    setLoading(true)
    setError(null)
    try {
      setHistory(await getProductHistory(product.id))
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar histórico.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-[17px] font-bold tracking-tight text-ink">Histórico de um produto</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Busque por nome ou EAN e veja quem cadastrou e quem vendeu cada unidade.
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="relative max-w-md">
        <input
          type="text"
          value={term}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por nome ou EAN…"
          className="w-full field"
        />
        {results.length > 0 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg glass-blur">
            {results.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-primary/[0.08]"
              >
                <span className="text-sm font-bold text-ink">{product.name ?? 'Sem descrição'}</span>
                <span className="text-xs text-ink-soft">{product.ean ?? '—'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-4">
          <div className="border-b border-border pb-3">
            <div className="text-base font-semibold text-ink">{selected.name ?? 'Sem descrição'}</div>
            <div className="text-xs text-ink-soft">
              {selected.ean ?? '—'}
              {selected.brand ? ` · ${selected.brand}` : ''}
            </div>
          </div>

          {loading ? (
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <SkeletonRows rows={4} label="Carregando histórico…" />
              <SkeletonRows rows={4} label="Carregando histórico…" />
            </div>
          ) : history ? (
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <HistoryColumn title="Cadastros (quem cadastrou)" entries={history.registrations} />
              <HistoryColumn title="Vendas (quem vendeu)" entries={history.sales} />
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function HistoryColumn({ title, entries }: { title: string; entries: HistoryEntry[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</div>
      {entries.length === 0 ? (
        <p className="py-2 text-sm text-ink-soft">Nenhum registro.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                <b className="font-medium text-ink">{entry.operatorName ?? '— (desconhecido)'}</b>
                <span className="text-ink-secondary"> · {entry.quantity} un.</span>
              </span>
              <span className="text-xs text-ink-soft">{formatDate(entry.date.slice(0, 10))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
