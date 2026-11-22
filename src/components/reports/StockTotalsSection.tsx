import { useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { SkeletonKpis } from '../ui/Skeleton'
import { Kpi } from './Kpi'
import { getErrorMessage } from '../../lib/errors'
import { getStockTotals } from '../../lib/reports'
import { formatCurrency } from '../../lib/format'
import type { StockTotals } from '../../lib/types'

/**
 * Totais do estoque no Dashboard (decisão #50): quantas unidades estão
 * disponíveis e quanto elas valem pelo preço de venda. Substituiu o bloco de
 * estoque parado, que exigia escolher um limiar de dias sem venda -- o dono
 * quis um número fixo, sempre visível, sem filtro nem lista item a item.
 */
export function StockTotalsSection() {
  const [totals, setTotals] = useState<StockTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStockTotals()
      .then(setTotals)
      .catch((err) => setError(getErrorMessage(err, 'Erro ao carregar o estoque.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <h2 className="mb-3 text-[17px] font-bold tracking-tight text-ink">Estoque</h2>
      {error && <p className="text-sm text-danger">{error}</p>}
      {loading ? (
        <SkeletonKpis count={2} className="grid gap-3 sm:grid-cols-2" label="Carregando estoque…" />
      ) : totals ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Kpi
            label="Itens em estoque"
            value={totals.units.toLocaleString('pt-BR')}
            sub="unidades disponíveis"
          />
          <Kpi
            label="Valor em estoque"
            value={formatCurrency(totals.saleValue)}
            sub="preço de venda × disponível"
          />
        </div>
      ) : null}
    </Card>
  )
}
