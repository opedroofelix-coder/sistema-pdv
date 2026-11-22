import { ReactLenis, useLenis, type LenisRef } from 'lenis/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { gsap, ScrollTrigger, prefersReducedMotion } from '../lib/gsap'
import { useCart } from '../lib/cart'

/** Lenis dirigido pelo ticker do GSAP, para o ScrollTrigger andar junto. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const ref = useRef<LenisRef>(null)

  useEffect(() => {
    const update = (time: number) => ref.current?.lenis?.raf(time * 1000)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    return () => gsap.ticker.remove(update)
  }, [])

  if (prefersReducedMotion()) return <>{children}</>

  return (
    <ReactLenis root ref={ref} options={{ autoRaf: false, lerp: 0.1, smoothWheel: true, anchors: { offset: -80 } }}>
      <ScrollSync />
      {children}
    </ReactLenis>
  )
}

function ScrollSync() {
  const lenis = useLenis()
  const { open } = useCart()

  useEffect(() => {
    if (!lenis) return
    lenis.on('scroll', ScrollTrigger.update)
    return () => lenis.off('scroll', ScrollTrigger.update)
  }, [lenis])

  // trava a página atrás da sacola aberta
  useEffect(() => {
    if (!lenis) return
    if (open) lenis.stop()
    else lenis.start()
  }, [lenis, open])

  return null
}

/** Rolagem suave até um id, com ou sem Lenis. */
export function useScrollTo() {
  const lenis = useLenis()
  return (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    if (lenis) lenis.scrollTo(el, { offset: -70, duration: 1.4 })
    else el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }
}
