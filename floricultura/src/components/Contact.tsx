import { useRef } from 'react'
import { STORE } from '../config'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { whatsappUrl } from '../lib/order'
import { photo } from '../lib/photos'
import { IconWhats } from './Icons'
import { Magnetic } from './Magnetic'

const STEPS = [
  { t: 'Escolha', d: 'Coloque na sacola um buquê do catálogo ou monte o seu.' },
  { t: 'Conte os detalhes', d: 'Entrega ou retirada, data, período e a mensagem do cartão.' },
  { t: 'Envie pelo WhatsApp', d: 'O pedido chega pronto. Confirmamos e você paga por Pix ou cartão.' },
]

export function Contact() {
  const root = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from('.duo > *', { y: 50, autoAlpha: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, scrollTrigger: { trigger: root.current, start: 'top 80%', once: true } })
      gsap.fromTo('.talk-img', { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true } })
    },
    { scope: root },
  )
  const msg = whatsappUrl(STORE.whatsapp, `Olá! Vim pelo site da ${STORE.name} e quero um pedido especial.`)
  return (
    <section ref={root} className="section contact" id="como-funciona" aria-label="Como comprar">
      <div className="duo">
        <div className="how-card">
          <p className="eyebrow">Como funciona</p>
          <h2 className="section-title small">Três passos e pronto</h2>
          <ol className="how-steps">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="how-n">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{s.t}</strong>
                  <span>{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="talk-card">
          <div className="talk-copy">
            <p className="eyebrow">Pedidos especiais</p>
            <h2 className="section-title small">
              Casamentos, eventos
              <br />e presentes sob medida
            </h2>
            <p>Conte o que você imagina. A florista responde pelo WhatsApp com sugestões e orçamento.</p>
            <Magnetic>
              <a className="btn-gold" href={msg} target="_blank" rel="noreferrer" data-cursor="Conversar">
                <IconWhats className="w-icon" />
                Falar com a florista
              </a>
            </Magnetic>
          </div>
          <div className="talk-media" aria-hidden>
            <img className="talk-img" src={photo('presente')} alt="" loading="lazy" />
          </div>
        </div>
      </div>
    </section>
  )
}
