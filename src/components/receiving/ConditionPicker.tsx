import type { StockItemCondition } from '../../lib/types'

const CONDITIONS: { value: StockItemCondition; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'caixa_aberta', label: 'Caixa aberta' },
  { value: 'avaria', label: 'Avaria' },
  { value: 'usado', label: 'Usado' },
]

/** Seletor de condição em pílulas (DESIGN.md seção 2, passo 2). */
export function ConditionPicker({
  value,
  onChange,
}: {
  value: StockItemCondition
  onChange: (condition: StockItemCondition) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CONDITIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          aria-pressed={value === c.value}
          className={`inline-flex h-10 items-center rounded-full border px-4 text-sm transition-colors ${
            value === c.value
              ? 'border-primary/50 bg-primary/[0.14] font-bold text-primary'
              : 'border-border bg-field font-semibold text-ink-secondary hover:text-ink'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
