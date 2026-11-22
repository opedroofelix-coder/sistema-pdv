import { Check } from 'lucide-react'
import { type ButtonHTMLAttributes } from 'react'

interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Filtro que liga e desliga (decisão #71), no lugar das caixinhas de
 * seleção: ligado fica azul com um ✓. */
export function FilterChip({ checked, onChange, className = '', children, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13.5px] transition-colors ${
        checked
          ? 'border-primary/40 bg-primary/[0.14] font-bold text-primary'
          : 'border-border bg-surface-secondary font-semibold text-ink-secondary hover:text-ink'
      } ${className}`}
      {...props}
    >
      {checked && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
      {children}
    </button>
  )
}
