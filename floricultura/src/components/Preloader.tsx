import { useRef } from 'react'
import { gsap, useGSAP } from '../lib/gsap'

/** Abertura curta: nome da loja, linha dourada que enche e cortina que sobe. */
export function Preloader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const tl = gsap.timeline({ onComplete: onDone })
      tl.from('.pl-letter', { yPercent: 110, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.035 })
        .from('.pl-sub', { opacity: 0, y: 10, duration: 0.6 }, 0.4)
        .fromTo('.pl-bar span', { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power2.inOut' }, 0.2)
        .to('.pl-inner', { opacity: 0, y: -20, duration: 0.5, ease: 'power2.in' }, '+=0.15')
        .to(root.current, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '-=0.2')
    },
    { scope: root },
  )

  return (
    <div ref={root} className="preloader" aria-hidden>
      <div className="pl-inner">
        <p className="pl-name">
          {'Ateliê'.split('').map((c, i) => (
            <span key={i} className="pl-letter">
              {c}
            </span>
          ))}
        </p>
        <p className="pl-sub">das flores</p>
        <div className="pl-bar">
          <span />
        </div>
      </div>
    </div>
  )
}
