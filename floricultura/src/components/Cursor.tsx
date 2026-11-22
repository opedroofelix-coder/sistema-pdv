import { useEffect, useRef, useState } from 'react'
import { gsap } from '../lib/gsap'

/** Bolha que segue o ponteiro e mostra um rótulo sobre elementos [data-cursor]. */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null)
  const [label, setLabel] = useState('')
  const [enabled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches,
  )

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const xTo = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' })
    let shown = false
    const move = (e: PointerEvent) => {
      if (!shown) {
        gsap.set(el, { x: e.clientX, y: e.clientY })
        gsap.to(el, { autoAlpha: 1, duration: 0.3 })
        shown = true
      }
      xTo(e.clientX)
      yTo(e.clientY)
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-cursor]')
      setLabel(target?.dataset.cursor ?? '')
    }
    const leave = () => {
      gsap.to(el, { autoAlpha: 0, duration: 0.3 })
      shown = false
    }
    window.addEventListener('pointermove', move)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <div ref={ref} className={`cursor${label ? ' is-label' : ''}`} aria-hidden>
      <span>{label}</span>
    </div>
  )
}
