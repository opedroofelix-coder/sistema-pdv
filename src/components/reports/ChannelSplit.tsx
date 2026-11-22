import { formatCurrency } from '../../lib/format'

/**
 * Divisão do faturamento entre loja e site (decisão #66, opção B aprovada no
 * mockup): barra fina + legenda com os dois valores. Só aparece quando o
 * período teve venda do site -- sem isso, toda loja que ainda não vende
 * online veria uma barra 100% "Loja" sem informação nenhuma.
 */
export function ChannelSplit({ total, site }: { total: number; site: number }) {
  if (site <= 0 || total <= 0) return null
  const store = Math.max(total - site, 0)
  const sitePct = Math.min(100, (site / total) * 100)

  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="channel-split">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-surface-secondary"
        role="img"
        aria-label={`Loja ${formatCurrency(store)}, site ${formatCurrency(site)}`}
      >
        <span className="block bg-primary" style={{ width: `${100 - sitePct}%` }} />
        <span className="block bg-info" style={{ width: `${sitePct}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          Loja {formatCurrency(store)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-info" />
          Site {formatCurrency(site)}
        </span>
      </div>
    </div>
  )
}
