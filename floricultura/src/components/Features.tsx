import { useRef } from 'react'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { IconCamera, IconChat, IconGift, IconShield, IconTruck } from './Icons'

const ITEMS = [
  { Icon: IconShield, t: 'Frescor garantido', d: 'até 7 dias no vaso' },
  { Icon: IconTruck, t: 'Entrega no mesmo dia', d: 'pedidos até 14h' },
  { Icon: IconCamera, t: 'Foto do buquê', d: 'antes de sair da loja' },
  { Icon: IconGift, t: 'Embalagem de presente', d: 'e cartão inclusos' },
  { Icon: IconChat, t: 'Atendimento humano', d: 'pelo WhatsApp' },
]

export function Features() {
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from('.feat', { y: 30, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: root.current, start: 'top 92%', once: true } })
    },
    { scope: root },
  )
  return (
    <div ref={root} className="features-wrap">
      <ul className="features">
        {ITEMS.map(({ Icon, t, d }) => (
          <li key={t} className="feat">
            <span className="feat-icon">
              <Icon />
            </span>
            <span>
              <strong>{t}</strong>
              <small>{d}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
