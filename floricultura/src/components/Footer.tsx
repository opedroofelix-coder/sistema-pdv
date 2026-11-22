import { useRef } from 'react'
import { STORE } from '../config'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { whatsappUrl } from '../lib/order'
import { Magnetic } from './Magnetic'

export function Footer() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from('.footer-word span', {
        yPercent: 100,
        stagger: 0.04,
        duration: 1,
        ease: 'power4.out',
        scrollTrigger: { trigger: '.footer-word', start: 'top 95%', once: true },
      })
    },
    { scope: root },
  )

  const hello = whatsappUrl(STORE.whatsapp, `Olá! Vim pelo site da ${STORE.name} e tenho uma dúvida.`)

  return (
    <footer ref={root} className="footer" id="contato">
      <div className="footer-top">
        <div>
          <p className="eyebrow eyebrow-light">Fale com a gente</p>
          <h2 className="footer-title">
            Não achou o que queria? <em>A gente monta.</em>
          </h2>
          <Magnetic>
            <a className="btn btn-light" href={hello} target="_blank" rel="noreferrer" data-cursor="Conversar">
              Chamar no WhatsApp
            </a>
          </Magnetic>
        </div>
        <dl className="footer-info">
          <div>
            <dt>Loja</dt>
            <dd>
              {STORE.address}
              <br />
              {STORE.city}
            </dd>
          </div>
          <div>
            <dt>Horário</dt>
            <dd>
              {STORE.hours.map((h) => (
                <span key={h.days}>
                  {h.days} · {h.time}
                  <br />
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Contato</dt>
            <dd>
              <a href={hello} target="_blank" rel="noreferrer">WhatsApp {STORE.whatsappDisplay}</a>
              <br />
              <a href={`https://instagram.com/${STORE.instagram}`} target="_blank" rel="noreferrer">@{STORE.instagram}</a>
            </dd>
          </div>
        </dl>
      </div>
      <p className="footer-word" aria-hidden>
        {STORE.shortName.split('').map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </p>
      <p className="footer-legal">© {new Date().getFullYear()} {STORE.name}. Preços e disponibilidade confirmados no atendimento.</p>
    </footer>
  )
}
