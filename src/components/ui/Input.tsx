import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
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
          className={`field ${error ? 'border-danger focus:border-danger' : ''} ${className}`}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {error && <span className="text-xs font-semibold text-danger">{error}</span>}
      </div>
    )
  },
)
Input.displayName = 'Input'
