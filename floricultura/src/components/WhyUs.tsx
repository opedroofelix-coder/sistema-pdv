import { useRef } from 'react'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { IconCamera, IconCard, IconFlower, IconGift, IconTruck } from './Icons'
import { SectionHead } from './SectionHead'

const ITEMS = [
  { Icon: IconFlower, t: 'Flores frescas', d: 'de produtores selecionados, que chegam toda manhã' },
  { Icon: IconGift, t: 'Embalagem elegante', d: 'papel de seda, fita de cetim e caixa para presente' },
  { Icon: IconTruck, t: 'Entrega cuidadosa', d: 'no período que você escolher, com o buquê na água' },
  { Icon: IconCard, t: 'Cartão escrito à mão', d: 'com a sua mensagem, sem custo adicional' },
  { Icon: IconCamera, t: 'Foto antes do envio', d: 'você aprova o buquê pelo WhatsApp' },
]

export function WhyUs() {
  const root = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from('.why-item', { y: 50, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: '.why-list', start: 'top 85%', once: true } })
      gsap.from('.why-orb', { scale: 0.4, duration: 1.4, ease: 'elastic.out(1, 0.6)', stagger: 0.1, scrollTrigger: { trigger: '.why-list', start: 'top 85%', once: true } })
    },
    { scope: root },
  )
  return (
    <section ref={root} className="section why" id="sobre" aria-labelledby="why-title">
      <SectionHead id="why-title" eyebrow="Por que nos escolher" title="Cuidado em cada detalhe" />
      <ul className="why-list">
        {ITEMS.map(({ Icon, t, d }, i) => (
          <li key={t} className="why-item" style={{ ['--d' as string]: `${i * -1.1}s` }}>
            <span className="why-orb">
              <Icon />
            </span>
            <strong>{t}</strong>
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
