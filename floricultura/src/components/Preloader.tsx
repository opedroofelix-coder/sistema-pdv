import { useRef } from 'react'
import { STORE } from '../config'
import { gsap, useGSAP } from '../lib/gsap'

/** Cortina inicial: contador 0→100, flor que abre e saída em cortina. */
export function Preloader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const counter = { v: 0 }
      const num = root.current!.querySelector('.pl-num')!
      const tl = gsap.timeline({ onComplete: onDone })
      tl.to(counter, {
        v: 100,
        duration: 1.9,
        ease: 'power3.inOut',
        onUpdate: () => {
          num.textContent = String(Math.round(counter.v)).padStart(3, '0')
        },
      })
        .from('.pl-petal', { scale: 0, rotate: -90, transformOrigin: '50% 100%', stagger: 0.12, duration: 0.9, ease: 'back.out(2)' }, 0.1)
        .from('.pl-core', { scale: 0, transformOrigin: '50% 50%', duration: 0.6, ease: 'back.out(3)' }, 0.9)
        .to('.pl-flower', { rotate: 180, duration: 1.9, ease: 'power3.inOut' }, 0)
        .from('.pl-line span', { yPercent: 110, duration: 0.8, ease: 'power4.out', stagger: 0.08 }, 0.1)
        .to('.pl-num, .pl-line span', { yPercent: -110, duration: 0.6, ease: 'power3.in', stagger: 0.03 }, '+=0.1')
        .to('.pl-flower', { scale: 0, duration: 0.5, ease: 'power3.in' }, '<')
        .to(root.current, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1, ease: 'power4.inOut' }, '-=0.15')
    },
    { scope: root },
  )

  return (
    <div ref={root} className="preloader" aria-hidden>
      <div className="pl-top pl-line">
        <span>{STORE.name}</span>
        <span>{STORE.tagline}</span>
      </div>
      <svg className="pl-flower" viewBox="-60 -60 120 120">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <ellipse className="pl-petal" cx="0" cy="-26" rx="15" ry="26" />
          </g>
        ))}
        <circle className="pl-core" r="13" />
      </svg>
      <div className="pl-bottom">
        <p className="pl-line">
          <span>Montando o buquê</span>
        </p>
        <p className="pl-count">
          <span className="pl-num">000</span>
        </p>
      </div>
    </div>
  )
}
