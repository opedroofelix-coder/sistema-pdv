import { type ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: botão só com ícone precisa de nome pra leitor de tela. */
  'aria-label': string
  /** Cor do ícone. */
  tone?: 'neutral' | 'primary' | 'danger'
  /** `outline` = quadrado de vidro com borda (ações de card); `plain` = sem
   * fundo (ações dentro de linhas e listas). */
  look?: 'outline' | 'plain'
  size?: 'sm' | 'md' | 'lg'
}

const toneClasses = {
  neutral: 'text-ink-soft hover:text-ink',
  primary: 'text-primary',
  danger: 'text-danger',
}
const sizeClasses = {
  sm: 'h-9 w-9 rounded-full',
  md: 'h-10 w-10 rounded-full',
  lg: 'h-12 w-12 rounded-full',
}

/** Botão só de ícone (decisão #71): editar, excluir, imprimir, câmera,
 * fechar aviso. Substitui os links "✎ Editar" com borda fina e as lixeiras
 * soltas. */
export function IconButton({
  tone = 'neutral',
  look = 'outline',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  const lookClass =
    look === 'outline'
      ? 'glass-chip hover:bg-surface-raised'
      : 'bg-transparent hover:bg-surface-secondary'
  return (
    <button
      type={type}
      title={props['aria-label']}
      className={`inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sizeClasses[size]} ${lookClass} ${toneClasses[tone]} ${className}`}
      {...props}
    />
  )
}
