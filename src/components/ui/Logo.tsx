/**
 * Marca do Sistema PDV (tema Pétalas): flor desenhada num quadrado com
 * gradiente rosa → pêssego, seguida do nome. É SVG + texto, então segue o
 * tema sozinha (sem trocar imagem entre claro e escuro).
 */
export function Logo({
  className = '',
  showName = true,
  size = 34,
}: {
  className?: string
  /** `false` = só o símbolo (trilho estreito, ícones). */
  showName?: boolean
  /** Lado do símbolo em px. */
  size?: number
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[11px] text-white shadow-[0_6px_14px_-4px_color-mix(in_srgb,var(--primary)_60%,transparent)]"
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(140deg, var(--primary), var(--peach))',
        }}
      >
        <FlowerMark size={Math.round(size * 0.6)} />
      </span>
      {showName ? (
        <span className="whitespace-nowrap text-lg font-bold tracking-tight text-ink">Sistema PDV</span>
      ) : (
        <span className="sr-only">Sistema PDV</span>
      )}
    </span>
  )
}

export function FlowerMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="9" r="2.4" />
      <path d="M12 6.6c0-2.2 1.2-3.6 2.6-3.6s2.4 1.4 1.6 3.2c1.9-.6 3.4.4 3.4 1.9s-1.6 2.3-3.3 1.9c1 1.6.4 3.3-1 3.7-1.4.4-2.6-.6-3.3-2.3-.7 1.7-1.9 2.7-3.3 2.3-1.4-.4-2-2.1-1-3.7-1.7.4-3.3-.4-3.3-1.9s1.5-2.5 3.4-1.9C7 4.4 8 3 9.4 3s2.6 1.4 2.6 3.6z" />
      <path d="M12 14v7M12 18.5c-2.2 0-3.6-1-4.2-2.6M12 19.5c2.2 0 3.6-1 4.2-2.6" />
    </svg>
  )
}
