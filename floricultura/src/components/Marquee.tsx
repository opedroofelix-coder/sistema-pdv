import { useRef } from 'react'
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '../lib/gsap'

const WORDS = ['Rosas', 'Girassóis', 'Tulipas', 'Peônias', 'Orquídeas', 'Lavanda', 'Margaridas', 'Suculentas']

/** Faixa infinita cuja velocidade (e direção) segue a rolagem. */
export function Marquee() {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const rows = gsap.utils.toArray<HTMLElement>('.mq-track')
      const pos = rows.map(() => 0)
      let boost = 0
      let dir = 1
      const st = ScrollTrigger.create({
        trigger: root.current,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => {
          dir = self.direction
          boost = Math.min(Math.abs(self.getVelocity()) / 120, 14)
        },
      })
      const tick = (_t: number, dt: number) => {
        boost *= 0.92
        rows.forEach((row, i) => {
          const sign = i % 2 ? -1 : 1
          pos[i] -= (0.012 + boost * 0.01) * dt * 0.06 * sign * dir
          pos[i] = gsap.utils.wrap(-50, 0, pos[i])
          gsap.set(row, { xPercent: pos[i], skewX: -boost * 0.9 * sign * dir })
        })
      }
      gsap.ticker.add(tick)
      return () => {
        gsap.ticker.remove(tick)
        st.kill()
      }
    },
    { scope: root },
  )

  const row = (key: string) => (
    <div className="mq-track" key={key} aria-hidden>
      {[0, 1].map((dup) => (
        <div className="mq-group" key={dup}>
          {WORDS.map((w, i) => (
            <span key={w} className={i % 2 ? 'mq-word is-italic' : 'mq-word'}>
              {w}
              <svg viewBox="0 0 20 20" className="mq-star"><path d="M10 0c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10C6 9 9 6 10 0Z" /></svg>
            </span>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <div ref={root} className="marquee" role="presentation">
      {row('a')}
      {row('b')}
    </div>
  )
}
