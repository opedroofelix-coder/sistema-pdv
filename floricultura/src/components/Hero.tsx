import { useRef } from 'react'
import { STORE } from '../config'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { photo } from '../lib/photos'
import { IconArrow, IconFlower } from './Icons'
import { Magnetic } from './Magnetic'
import { PetalField } from './PetalField'
import { useScrollTo } from './SmoothScroll'

const LINES = ['Emoções', 'que ficam', 'na memória']

export function Hero({ ready }: { ready: boolean }) {
  const root = useRef<HTMLElement>(null)
  const scrollTo = useScrollTo()

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      if (!ready) {
        gsap.set('.hero-line-i', { yPercent: 110 })
        gsap.set('.hero-fade', { y: 24, autoAlpha: 0 })
        gsap.set('.hero-media', { clipPath: 'inset(0% 0% 0% 100%)' })
        gsap.set('.hero-img', { scale: 1.25 })
        return
      }
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
      tl.to('.hero-media', { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'power4.inOut' }, 0)
        .to('.hero-img', { scale: 1, duration: 2.2, ease: 'power3.out' }, 0.1)
        .to('.hero-line-i', { yPercent: 0, duration: 1.3, stagger: 0.12 }, 0.35)
        .to('.hero-fade', { y: 0, autoAlpha: 1, duration: 1, stagger: 0.08 }, 0.8)
    },
    { scope: root, dependencies: [ready], revertOnUpdate: false },
  )

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.to('.hero-img-wrap', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      })
      gsap.to('.hero-copy', {
        yPercent: -18,
        autoAlpha: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      })
      if (!window.matchMedia('(pointer: fine)').matches) return
      const x = gsap.quickTo('.hero-img', 'x', { duration: 1.4, ease: 'power3.out' })
      const y = gsap.quickTo('.hero-img', 'y', { duration: 1.4, ease: 'power3.out' })
      const move = (e: PointerEvent) => {
        x((e.clientX / window.innerWidth - 0.5) * -24)
        y((e.clientY / window.innerHeight - 0.5) * -16)
      }
      window.addEventListener('pointermove', move)
      return () => window.removeEventListener('pointermove', move)
    },
    { scope: root },
  )

  return (
    <section ref={root} className="hero" id="topo">
      <div className="hero-media" aria-hidden>
        <div className="hero-img-wrap">
          <img className="hero-img" src={photo('hero')} alt="" />
        </div>
      </div>
      <PetalField />
      <div className="hero-copy">
        <p className="eyebrow hero-fade">{STORE.tagline} · {STORE.city}</p>
        <h1 className="hero-title">
          {LINES.map((l, i) => (
            <span key={l} className={`hero-line${i === 2 ? ' is-gold' : ''}`}>
              <span className="hero-line-i">{l}</span>
            </span>
          ))}
        </h1>
        <p className="hero-sub hero-fade">Flores frescas e composições autorais para os momentos mais importantes da vida.</p>
        <div className="hero-actions hero-fade">
          <Magnetic>
            <button className="btn-gold" onClick={() => scrollTo('catalogo')} data-cursor="Ver">
              Escolher buquê
              <IconArrow />
            </button>
          </Magnetic>
          <button className="btn-soft" onClick={() => scrollTo('monte')}>
            <span className="btn-soft-icon">
              <IconFlower />
            </span>
            Monte o seu
          </button>
        </div>
        <p className="hero-scroll hero-fade" aria-hidden>
          <span className="mouse">
            <span />
          </span>
          Role para baixo
        </p>
      </div>
    </section>
  )
}
