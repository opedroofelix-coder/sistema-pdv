import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui/Card'
import { SkeletonRows } from '../ui/Skeleton'
import { getErrorMessage } from '../../lib/errors'
import { getLotMarginReport } from '../../lib/reports'
import { formatCurrency } from '../../lib/format'
import type { LotMarginReport } from '../../lib/types'

export function LotMarginSection() {
  const [rows, setRows] = useState<LotMarginReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getLotMarginReport()
      .then(setRows)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar relatório.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <h2 className="mb-3 text-[17px] font-bold tracking-tight text-ink">Margem por lote</h2>
      {error && <p className="text-sm text-danger">{error}</p>}
      {loading ? (
        <SkeletonRows rows={4} label="Carregando margem por lote…" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhum lote cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-bold uppercase tracking-wide text-ink-soft">
                <th className="py-2 pr-3">Fornecedor</th>
                <th className="py-2 pr-3">Vendido</th>
                <th className="py-2 pr-3">Custo</th>
                <th className="py-2 pr-3">Margem</th>
                <th className="py-2 pr-3">Restante em estoque</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.lot_id} className="border-b border-border">
                  <td className="py-2 pr-3">
                    <Link to={`/lotes/${row.lot_id}`} className="text-ink hover:text-primary hover:underline">
                      {row.supplier || 'Sem fornecedor'}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-ink-secondary">{formatCurrency(row.revenue)}</td>
                  <td className="py-2 pr-3 text-ink-secondary">
                    {formatCurrency(row.cost_of_sold)}
                  </td>
                  <td className="py-2 pr-3 font-medium text-ink">
                    {formatCurrency(row.revenue - row.cost_of_sold)}
                  </td>
                  <td className="py-2 pr-3 text-ink-secondary">
                    {row.remaining_units} un. · {formatCurrency(row.remaining_stock_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
