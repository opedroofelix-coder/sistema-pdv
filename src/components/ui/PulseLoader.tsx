import logoColor from '../../assets/logo-cor.png'
import logoWhite from '../../assets/logo-branco.png'

// Loader padrão do app (DESIGN.md "Comportamentos transversais": nunca
// spinner de tela cheia, é sempre um indicador inline). Ícone da marca
// pulsando -- reaproveita as mesmas imagens do Logo (troca por tema via
// CSS, dark:hidden/dark:block, sem flash), em vez de duplicar asset. A
// animação é o keyframe `pulse-soft` em src/index.css (mais suave que o
// `animate-pulse` padrão do Tailwind, que é abrupto demais para um
// indicador que fica visível por segundos).

const SIZE_CLASS = {
  sm: 'h-5',
  md: 'h-8',
} as const

interface PulseLoaderProps {
  size?: keyof typeof SIZE_CLASS
  label?: string
  className?: string
}

export function PulseLoader({ size = 'md', label = 'Carregando', className = '' }: PulseLoaderProps) {
  return (
    <span
      role="status"
      aria-label={`${label}…`}
      className={`inline-flex animate-pulse-soft items-center ${SIZE_CLASS[size]} ${className}`}
    >
      <img src={logoColor} alt="" className="block h-full w-auto dark:hidden" />
      <img src={logoWhite} alt="" className="hidden h-full w-auto dark:block" />
    </span>
  )
}
