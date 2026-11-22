import { useRef } from 'react'
import { STORE } from '../config'
import { HERO_ART } from '../data/products'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'
import { Magnetic } from './Magnetic'
import { useScrollTo } from './SmoothScroll'
import { SplitWords } from './SplitWords'

const RING = 'feito à mão · entrega no mesmo dia · pedido pelo whatsapp · '

export function Hero() {
  const root = useRef<HTMLElement>(null)
  const scrollTo = useScrollTo()

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
      tl.from('.hero .sw-i', { yPercent: 115, rotate: 4, duration: 1.2, stagger: 0.06 }, 0.1)
        .from('.hero-sub, .hero-actions, .hero-facts li', { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.6)
        .fromTo(
          '.hero-art .fa-stem',
          { strokeDasharray: 1, strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', stagger: 0.02 },
          0.2,
        )
        .from(
          '.hero-art .fa-bloom',
          { scale: 0, rotate: -40, transformOrigin: '50% 50%', duration: 1.1, ease: 'back.out(1.6)', stagger: { each: 0.035, from: 'random' } },
          0.7,
        )
        .from('.hero-ring', { scale: 0.6, autoAlpha: 0, duration: 1 }, 1.1)

      // parallax de rolagem
      gsap.to('.hero-art-inner', {
        yPercent: 18,
        rotate: 4,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      })
      gsap.to('.hero-title', {
        yPercent: -30,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      })

      // inclinação com o mouse
      if (window.matchMedia('(pointer: fine)').matches) {
        const art = root.current?.querySelector('.hero-art-tilt')
        if (!art) return
        const rx = gsap.quickTo(art, 'rotateY', { duration: 1, ease: 'power3.out' })
        const ry = gsap.quickTo(art, 'rotateX', { duration: 1, ease: 'power3.out' })
        const onMove = (e: PointerEvent) => {
          rx(((e.clientX / window.innerWidth) - 0.5) * 14)
          ry(((e.clientY / window.innerHeight) - 0.5) * -10)
        }
        window.addEventListener('pointermove', onMove)
        return () => window.removeEventListener('pointermove', onMove)
      }
    },
    { scope: root },
  )

  return (
    <section ref={root} className="hero" id="topo">
      <div className="hero-copy">
        <p className="eyebrow">{STORE.tagline} · {STORE.city}</p>
        <h1 className="hero-title">
          <SplitWords text="Flores que dizem o que você sente." italic={['dizem', 'sente.']} />
        </h1>
        <p className="hero-sub">
          Buquês, arranjos e plantas montados à mão no dia. Escolha no catálogo, monte sua sacola e finalize o pedido direto
          no nosso WhatsApp.
        </p>
        <div className="hero-actions">
          <Magnetic>
            <button className="btn btn-primary" onClick={() => scrollTo('catalogo')} data-cursor="Ver">
              Ver catálogo
              <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            </button>
          </Magnetic>
          <button className="btn btn-ghost" onClick={() => scrollTo('como-funciona')}>
            Como funciona
          </button>
        </div>
        <ul className="hero-facts">
          <li><strong>Mesmo dia</strong> pedidos até 14h</li>
          <li><strong>Cartão grátis</strong> com sua mensagem</li>
          <li><strong>Pix ou cartão</strong> na confirmação</li>
        </ul>
      </div>

      <div className="hero-art">
        <div className="hero-art-inner">
          <div className="hero-blob" aria-hidden />
          <div className="hero-art-tilt">
            <FlowerArt spec={HERO_ART} seed="hero-primavera" className="hero-svg" title="Ilustração de um buquê de flores" />
          </div>
          <svg className="hero-ring" viewBox="0 0 200 200" aria-hidden>
            <defs>
              <path id="ring-path" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
            </defs>
            <circle cx="100" cy="100" r="96" className="hero-ring-bg" />
            <text>
              <textPath href="#ring-path">{RING.toUpperCase()}</textPath>
            </text>
            <g transform="translate(100 100)" className="hero-ring-flower">
              {[0, 60, 120, 180, 240, 300].map((a) => (
                <ellipse key={a} cx="0" cy="-14" rx="7" ry="13" transform={`rotate(${a})`} />
              ))}
              <circle r="7" />
            </g>
          </svg>
        </div>
      </div>
    </section>
  )
}
