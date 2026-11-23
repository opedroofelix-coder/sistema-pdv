import { Logo } from './Logo'

// Loader padrão do app (DESIGN.md "Comportamentos transversais": nunca
// spinner de tela cheia, é sempre um indicador inline). O símbolo da marca
// (flor em gradiente) pulsando. A animação é o keyframe `pulse-soft` em
// src/index.css (mais suave que o `animate-pulse` padrão do Tailwind).

const SIZE = {
  sm: 20,
  md: 32,
} as const

interface PulseLoaderProps {
  size?: keyof typeof SIZE
  label?: string
  className?: string
}

export function PulseLoader({ size = 'md', label = 'Carregando', className = '' }: PulseLoaderProps) {
  return (
    <span role="status" aria-label={`${label}…`} className={`inline-flex animate-pulse-soft items-center ${className}`}>
      <Logo showName={false} size={SIZE[size]} />
    </span>
  )
}
