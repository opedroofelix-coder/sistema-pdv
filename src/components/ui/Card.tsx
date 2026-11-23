import { type HTMLAttributes, type PointerEvent } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Painel que flutua sobre a tela (modal): quase opaco em vez de vidro --
   * vidro translúcido sobre o véu do modal ficaria cinza e ilegível. */
  raised?: boolean
}

// Magic Card (Magic UI): a borda acende em rosa onde o cursor passa. Só
// grava a posição em variáveis CSS; o desenho fica em `.magic` (index.css).
function trackPointer(e: PointerEvent<HTMLDivElement>) {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - r.left}px`)
  el.style.setProperty('--my', `${e.clientY - r.top}px`)
}

/** Painel padrão do app: vidro do tema Pétalas. */
export function Card({ className = '', raised = false, onPointerMove, ...props }: CardProps) {
  const look = raised
    ? 'bg-surface-raised shadow-2xl glass-blur ring-1 ring-border'
    : 'glass glass-blur magic'
  return (
    <div
      className={`rounded-panel ${look} p-6 ${className}`}
      onPointerMove={(e) => {
        if (!raised) trackPointer(e)
        onPointerMove?.(e)
      }}
      {...props}
    />
  )
}
