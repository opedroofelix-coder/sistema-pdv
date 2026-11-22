import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { displayCurrencyValue, maskCurrencyInput } from '../../lib/format'

interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  label?: string
  error?: string
  value: string
  onValueChange: (value: string) => void
}

/** Input mascarado em R$ (dígitos viram centavos ao digitar, mesma
 * convenção de app bancário) -- `value`/`onValueChange` trafegam o valor
 * decimal canônico ("12.34", "" quando vazio), mesmo formato que os
 * formulários já usavam com `<input type="number">`. */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ label, error, id, value, onValueChange, className = '', ...props }, ref) => {
    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      onValueChange(maskCurrencyInput(e.target.value))
    }

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-[13px] font-semibold text-ink-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={displayCurrencyValue(value)}
          onChange={handleChange}
          className={`field ${error ? 'border-danger focus:border-danger' : ''} ${className}`}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {error && <span className="text-xs font-semibold text-danger">{error}</span>}
      </div>
    )
  },
)
CurrencyInput.displayName = 'CurrencyInput'
