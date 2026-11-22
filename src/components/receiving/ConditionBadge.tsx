import type { StockItemCondition } from '../../lib/types'
import { Badge, type BadgeTone } from '../ui/Badge'

const CONDITION_LABEL: Record<StockItemCondition, string> = {
  novo: 'Novo',
  caixa_aberta: 'Caixa aberta',
  avaria: 'Avaria',
  usado: 'Usado',
}

/** Cor por condição: verde = novo, azul = caixa aberta (como na proposta
 * aprovada, decisão #71), neutro = usado, vermelho = avaria. */
const CONDITION_TONE: Record<StockItemCondition, BadgeTone> = {
  novo: 'success',
  caixa_aberta: 'primary',
  avaria: 'danger',
  usado: 'neutral',
}

/** Selo de condição do item (Estoque/conferência do lote). */
export function ConditionBadge({ condition }: { condition: StockItemCondition | null }) {
  if (!condition) return null
  return <Badge tone={CONDITION_TONE[condition]}>{CONDITION_LABEL[condition]}</Badge>
}
