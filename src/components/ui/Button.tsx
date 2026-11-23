import { type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** sm = 36px (tabela, barra de ferramentas) · md = 48px (padrão) ·
   * lg = 56px (ação final da tela, ex.: Finalizar venda). Decisão #71. */
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  // Tema Pétalas: ação escura com brilho rosado e reflexo passando
  // (Shimmer Button, Magic UI). O reflexo some quando desabilitado.
  primary:
    'shimmer bg-action text-action-content font-semibold shadow-[0_6px_18px_-6px_color-mix(in_srgb,var(--primary)_55%,transparent),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-action-hover hover:-translate-y-px active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:after:hidden disabled:hover:translate-y-0',
  secondary:
    'glass-chip text-ink font-semibold hover:bg-surface-raised disabled:opacity-40',
  // Destrutivo continua discreto (DESIGN.md: nunca um vermelho cheio), mas
  // com um fundo vermelho bem leve pra se distinguir do secundário.
  danger:
    'border border-danger/40 bg-danger/[0.07] text-danger font-semibold hover:bg-danger/[0.12] disabled:opacity-40',
  ghost: 'bg-transparent text-primary font-semibold hover:bg-surface-secondary disabled:opacity-40',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 rounded-full px-4 text-[13px]',
  md: 'h-12 rounded-full px-5 text-[15px]',
  lg: 'h-14 rounded-full px-7 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 transition-[background-color,transform,box-shadow] duration-150 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
