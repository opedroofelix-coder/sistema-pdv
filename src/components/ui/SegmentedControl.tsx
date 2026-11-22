interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[]
  /** `null` = nenhuma opção marcada (ex.: intervalo de datas manual). */
  value: T | null
  onChange: (value: T) => void
  'aria-label': string
  className?: string
}

/** Seletor de período e afins (decisão #71): um trilho único com a opção
 * escolhida em destaque, no lugar das pílulas soltas. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  ...props
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={props['aria-label']}
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-border p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm transition-colors ${
              active
                ? 'bg-surface-raised font-bold text-primary shadow-md shadow-ink/10'
                : 'font-semibold text-ink-secondary hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
