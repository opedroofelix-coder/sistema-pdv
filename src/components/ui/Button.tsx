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
  // Brilho na cor da primária: o botão de ação "acende" sobre o vidro.
  primary:
    'bg-primary text-primary-content font-bold shadow-lg shadow-primary/30 hover:bg-primary-hover disabled:opacity-40 disabled:shadow-none',
  secondary:
    'border border-border bg-surface-secondary text-ink font-semibold hover:bg-surface-raised disabled:opacity-40',
  // Destrutivo continua discreto (DESIGN.md: nunca um vermelho cheio), mas
  // com um fundo vermelho bem leve pra se distinguir do secundário.
  danger:
    'border border-danger/40 bg-danger/[0.07] text-danger font-semibold hover:bg-danger/[0.12] disabled:opacity-40',
  ghost: 'bg-transparent text-primary font-semibold hover:bg-surface-secondary disabled:opacity-40',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 rounded-[10px] px-3.5 text-[13px]',
  md: 'h-12 rounded-[14px] px-5 text-[15px]',
  lg: 'h-14 rounded-2xl px-6 text-base',
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
      className={`inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
