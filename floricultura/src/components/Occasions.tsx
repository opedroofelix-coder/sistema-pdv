import { useRef } from 'react'
import { OCCASIONS, PRODUCTS, type Occasion } from '../data/products'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { photo } from '../lib/photos'
import { IconArrow } from './Icons'
import { SectionHead } from './SectionHead'

export function Occasions({ onPick }: { onPick: (o: Occasion | null) => void }) {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.fromTo(
        '.occ-card',
        { clipPath: 'inset(100% 0% 0% 0% round 22px)', y: 40 },
        {
          clipPath: 'inset(0% 0% 0% 0% round 22px)',
          y: 0,
          duration: 1.2,
          ease: 'power4.inOut',
          stagger: 0.07,
          scrollTrigger: { trigger: '.occ-row', start: 'top 85%', once: true },
        },
      )
      gsap.from('.occ-card img', { scale: 1.35, duration: 1.8, ease: 'power3.out', stagger: 0.07, scrollTrigger: { trigger: '.occ-row', start: 'top 85%', once: true } })
    },
    { scope: root },
  )

  return (
    <section ref={root} className="section occasions" id="ocasioes" aria-labelledby="occ-title">
      <SectionHead
        id="occ-title"
        eyebrow="Catálogo de ocasiões"
        title={
          <>
            Escolha a ideia
            <br />
            para o seu momento
          </>
        }
        action={
          <button className="link-arrow" onClick={() => onPick(null)}>
            Ver todos <IconArrow />
          </button>
        }
      />
      <div className="occ-row">
        {OCCASIONS.map((o) => {
          const n = PRODUCTS.filter((p) => p.occasions.includes(o.id)).length
          return (
            <button key={o.id} className="occ-card" onClick={() => onPick(o.id)} data-cursor="Ver">
              <img src={photo(o.photo)} alt="" loading="lazy" />
              <span className="occ-shade" />
              <span className="occ-info">
                <span className="occ-name">{o.label}</span>
                <span className="occ-n">
                  {n} {n === 1 ? 'opção' : 'opções'}
                </span>
              </span>
              <span className="occ-go" aria-hidden>
                <IconArrow />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
