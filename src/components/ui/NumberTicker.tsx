import { useEffect, useRef, useState } from 'react'

/**
 * Number Ticker (Magic UI): o número conta de 0 até o valor ao aparecer,
 * com desaceleração no fim. Respeita "reduzir movimento" (mostra direto) e
 * sempre termina exatamente no valor recebido.
 */
export function NumberTicker({
  value,
  format,
  duration = 1200,
}: {
  value: number
  format: (n: number) => string
  duration?: number
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0))
  const raf = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value)
      return
    }
    let start: number | null = null
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / duration)
      setShown(p < 1 ? value * (1 - Math.pow(1 - p, 4)) : value)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  return <span className="tabular-nums">{format(shown)}</span>
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
