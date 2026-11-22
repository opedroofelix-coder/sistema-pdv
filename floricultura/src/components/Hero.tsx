import { useRef } from 'react'
import { STORE } from '../config'
import { HERO_ART } from '../data/products'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'
import { Magnetic } from './Magnetic'
import { PetalField } from './PetalField'
import { useScrollTo } from './SmoothScroll'

const WORD = 'FLORES'

export function Hero({ ready }: { ready: boolean }) {
  const root = useRef<HTMLElement>(null)
  const scrollTo = useScrollTo()

  // entrada (depois do preloader)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      if (!ready) {
        gsap.set('.hero-char', { yPercent: 105 })
        gsap.set('.hero-serif .sw-i, .hero-meta > *, .hero-foot > *', { yPercent: 110, autoAlpha: 0 })
        gsap.set('.hero-art .fa-bloom', { scale: 0, transformOrigin: '50% 50%' })
        gsap.set('.hero-art .fa-stem', { strokeDasharray: 1, strokeDashoffset: 1 })
        gsap.set('.hero-art .hero-holder', { yPercent: 40, autoAlpha: 0 })
        return
      }
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
      tl.to('.hero-char', { yPercent: 0, duration: 1.4, stagger: 0.06 }, 0)
        .to('.hero-art .hero-holder', { yPercent: 0, autoAlpha: 1, duration: 1.2 }, 0.2)
        .to('.hero-art .fa-stem', { strokeDashoffset: 0, duration: 1.3, ease: 'power2.inOut', stagger: 0.015 }, 0.3)
        .to('.hero-art .fa-bloom', { scale: 1, duration: 1.1, ease: 'back.out(1.8)', stagger: { each: 0.03, from: 'random' } }, 0.75)
        .to('.hero-serif .sw-i', { yPercent: 0, autoAlpha: 1, duration: 1.1, stagger: 0.05 }, 0.6)
        .to('.hero-meta > *, .hero-foot > *', { yPercent: 0, autoAlpha: 1, duration: 1, stagger: 0.06 }, 0.8)
    },
    { scope: root, dependencies: [ready], revertOnUpdate: false },
  )

  // rolagem: a palavra se abre, o buquê avança (só desktop)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
        const chars = gsap.utils.toArray<HTMLElement>('.hero-char-wrap')
        const mid = (chars.length - 1) / 2
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=110%', scrub: 1, pin: true },
        })
        chars.forEach((c, i) => {
          tl.to(c, { xPercent: (i - mid) * 60, yPercent: -20 - Math.abs(i - mid) * 18, rotate: (i - mid) * 7, ease: 'none' }, 0)
        })
        tl.to('.hero-art-inner', { scale: 1.45, yPercent: -6, ease: 'none' }, 0)
          .to('.hero-serif, .hero-meta, .hero-foot', { autoAlpha: 0, y: -40, ease: 'none', duration: 0.4 }, 0)
          .to('.hero-word', { autoAlpha: 0.0, ease: 'none', duration: 0.4 }, 0.6)

        // inclinação com o mouse
        const tilt = root.current!.querySelector('.hero-art-tilt')!
        const rx = gsap.quickTo(tilt, 'rotateY', { duration: 1.2, ease: 'power3.out' })
        const ry = gsap.quickTo(tilt, 'rotateX', { duration: 1.2, ease: 'power3.out' })
        const word = gsap.quickTo('.hero-word-inner', 'x', { duration: 1.4, ease: 'power3.out' })
        const onMove = (e: PointerEvent) => {
          const nx = e.clientX / window.innerWidth - 0.5
          const ny = e.clientY / window.innerHeight - 0.5
          rx(nx * 16)
          ry(ny * -10)
          word(nx * -30)
        }
        window.addEventListener('pointermove', onMove)
        return () => window.removeEventListener('pointermove', onMove)
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} className="hero" id="topo" data-bg="#f6c9cf" data-fg="#141414">
      <PetalField />
      <div className="hero-meta">
        <p>
          {STORE.tagline}
          <br />
          {STORE.city}
        </p>
        <p className="hero-meta-right">
          Entrega no mesmo dia
          <br />
          para pedidos até 14h
        </p>
      </div>

      <h1 className="hero-word" aria-label="Flores que dizem o que você sente">
        <span className="hero-word-inner" aria-hidden>
          {WORD.split('').map((c, i) => (
            <span className="hero-char-wrap" key={i}>
              <span className="hero-char">{c}</span>
            </span>
          ))}
        </span>
      </h1>

      <div className="hero-art">
        <div className="hero-art-inner">
          <div className="hero-art-tilt">
            <div className="hero-holder">
              <FlowerArt spec={HERO_ART} seed="hero-primavera" className="hero-svg" title="Ilustração de um buquê" />
            </div>
          </div>
        </div>
      </div>

      <p className="hero-serif" aria-hidden>
        {'que dizem o que você sente.'.split(' ').map((w, i) => (
          <span className="sw" key={i}>
            <span className="sw-i">{w}&nbsp;</span>
          </span>
        ))}
      </p>

      <div className="hero-foot">
        <p className="hero-lede">
          Buquês, arranjos e plantas montados à mão no dia. Monte sua sacola aqui e finalize o pedido no nosso WhatsApp.
        </p>
        <Magnetic strength={0.4}>
          <button className="round-btn" onClick={() => scrollTo('catalogo')} data-cursor="Ver">
            <span>Ver o catálogo</span>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 4v16M5 13l7 7 7-7" />
            </svg>
          </button>
        </Magnetic>
        <p className="hero-scroll">
          <span>Role</span>
          <span className="hero-scroll-line" />
        </p>
      </div>
    </section>
  )
}
