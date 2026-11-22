import { useEffect, useRef, useState } from 'react'
import { gsap } from '../lib/gsap'

/** Ponto em "diferença" que vira etiqueta sobre elementos [data-cursor]. */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null)
  const tag = useRef<HTMLDivElement>(null)
  const [label, setLabel] = useState('')
  const [enabled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches,
  )

  useEffect(() => {
    const d = dot.current
    const t = tag.current
    if (!enabled || !d || !t) return
    const dx = gsap.quickTo(d, 'x', { duration: 0.15, ease: 'power3.out' })
    const dy = gsap.quickTo(d, 'y', { duration: 0.15, ease: 'power3.out' })
    const tx = gsap.quickTo(t, 'x', { duration: 0.5, ease: 'power3.out' })
    const ty = gsap.quickTo(t, 'y', { duration: 0.5, ease: 'power3.out' })
    let shown = false
    const move = (e: PointerEvent) => {
      if (!shown) {
        gsap.set([d, t], { x: e.clientX, y: e.clientY })
        gsap.to(d, { autoAlpha: 1, duration: 0.3 })
        shown = true
      }
      dx(e.clientX)
      dy(e.clientY)
      tx(e.clientX)
      ty(e.clientY)
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-cursor]')
      setLabel(el?.dataset.cursor ?? '')
    }
    const down = () => gsap.to(d, { scale: 0.6, duration: 0.2 })
    const up = () => gsap.to(d, { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.4)' })
    const leave = () => {
      gsap.to(d, { autoAlpha: 0, duration: 0.3 })
      shown = false
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !tag.current) return
    gsap.to(tag.current, { scale: label ? 1 : 0, duration: label ? 0.5 : 0.3, ease: label ? 'back.out(2)' : 'power3.in' })
    gsap.to(dot.current, { scale: label ? 0 : 1, duration: 0.3 })
  }, [label, enabled])

  if (!enabled) return null
  return (
    <>
      <div ref={dot} className="cursor-dot" aria-hidden />
      <div ref={tag} className="cursor-tag" aria-hidden>
        <span>{label}</span>
      </div>
    </>
  )
}
