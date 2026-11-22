import { useRef } from 'react'
import { OCCASIONS, PRODUCTS, type Occasion } from '../data/products'
import { gsap, useGSAP } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'

/** No desktop a seção fixa na tela e os cards correm na horizontal. */
// um produto diferente ilustrando cada ocasião
const used = new Set<string>()
const samples = OCCASIONS.map((o) => {
  const p = PRODUCTS.find((x) => x.occasions.includes(o.id) && !used.has(x.id)) ?? PRODUCTS.find((x) => x.occasions.includes(o.id))
  if (p) used.add(p.id)
  return p
})

export function Occasions({ onPick }: { onPick: (o: Occasion) => void }) {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
        const el = track.current
        if (!el) return
        const distance = () => el.scrollWidth - window.innerWidth + 48
        const tween = gsap.to(el, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        })
        // arte de cada card desliza no sentido contrário (profundidade)
        gsap.utils.toArray<HTMLElement>('.occ-art').forEach((art) => {
          gsap.fromTo(
            art,
            { xPercent: 18, rotate: 6 },
            {
              xPercent: -18,
              rotate: -6,
              ease: 'none',
              scrollTrigger: { trigger: art, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
            },
          )
        })
        gsap.to('.occ-progress-bar', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top top', end: () => `+=${distance()}`, scrub: true },
        })
      })
      mm.add('(max-width: 899px), (prefers-reduced-motion: reduce)', () => {
        gsap.set('.occ-progress-bar', { scaleX: 1 })
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} className="occasions" id="ocasioes" aria-labelledby="occ-title">
      <div className="occ-head">
        <p className="eyebrow">Para cada momento</p>
        <h2 id="occ-title" className="section-title">
          Escolha pela <em>ocasião</em>
        </h2>
        <div className="occ-progress" aria-hidden>
          <span className="occ-progress-bar" />
        </div>
      </div>
      <div className="occ-viewport">
        <div ref={track} className="occ-track">
          {OCCASIONS.map((o, i) => {
            const sample = samples[i]
            const n = PRODUCTS.filter((p) => p.occasions.includes(o.id)).length
            return (
              <button
                key={o.id}
                className="occ-card"
                style={{ background: o.bg, color: o.ink }}
                onClick={() => onPick(o.id)}
                data-cursor="Filtrar"
              >
                <span className="occ-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="occ-name">{o.label}</span>
                <span className="occ-line">{o.line}</span>
                <span className="occ-count">
                  {n} {n === 1 ? 'opção' : 'opções'} <span aria-hidden>→</span>
                </span>
                {sample ? (
                  <span className="occ-art" aria-hidden>
                    <FlowerArt spec={sample.art} seed={`${sample.id}-occ`} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
