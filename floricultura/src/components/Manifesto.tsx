import { Fragment, useRef } from 'react'
import { PRODUCTS } from '../data/products'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'

// texto com "figurinhas" de flor entre as palavras
const PARTS: (string | { img: string })[] = [
  'Nossas flores chegam',
  { img: 'buque-campo' },
  'toda manhã. Cada buquê é montado à mão,',
  { img: 'peonias-blush' },
  'na hora do pedido. Você conta o motivo,',
  { img: 'orquidea-lilas' },
  'a gente cuida do resto.',
]

export function Manifesto() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.fromTo(
        '.mf-c',
        { opacity: 0.12 },
        {
          opacity: 1,
          ease: 'none',
          stagger: 0.02,
          scrollTrigger: { trigger: '.mf-text', start: 'top 75%', end: 'bottom 55%', scrub: true },
        },
      )
      gsap.utils.toArray<HTMLElement>('.mf-img').forEach((el, i) => {
        gsap.from(el, {
          scale: 0,
          rotate: i % 2 ? 40 : -40,
          ease: 'back.out(1.8)',
          duration: 1,
          scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' },
        })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} className="manifesto" data-bg="#23452f" data-fg="#f4f1ea" aria-label="Sobre a loja">
      <p className="eyebrow">(01) — O ateliê</p>
      <p className="mf-text">
        {PARTS.map((part, i) => {
          if (typeof part !== 'string') {
            const p = PRODUCTS.find((x) => x.id === part.img)!
            return (
              <span key={i} className="mf-img" style={{ background: p.art.bg }} aria-hidden>
                <FlowerArt spec={p.art} seed={`${p.id}-mf`} />
              </span>
            )
          }
          return (
            <span key={i} className="mf-chunk">
              {part.split(' ').map((w, wi) => (
                <Fragment key={wi}>
                  <span className="mf-w">
                    {w.split('').map((c, ci) => (
                      <span key={ci} className="mf-c">
                        {c}
                      </span>
                    ))}
                  </span>{' '}
                </Fragment>
              ))}
            </span>
          )
        })}
      </p>
    </section>
  )
}
