import { useRef } from 'react'
import { STORE } from '../config'
import { gsap, useGSAP } from '../lib/gsap'
import { whatsappUrl } from '../lib/order'
import { Magnetic } from './Magnetic'

const WORD = 'ATELIÊ'

/** Rodapé fixo por baixo, revelado quando a página termina. */
export function Footer() {
  const root = useRef<HTMLDivElement>(null)

  // peso de cada letra segue a distância do ponteiro (fonte variável)
  useGSAP(
    (_, contextSafe) => {
      if (!contextSafe || !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return
      const chars = gsap.utils.toArray<HTMLElement>('.ft-char')
      const setters = chars.map((c) => gsap.quickTo(c, '--w', { duration: 0.6, ease: 'power3.out' }))
      const move = contextSafe((e: PointerEvent) => {
        chars.forEach((c, i) => {
          const r = c.getBoundingClientRect()
          const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
          setters[i](gsap.utils.mapRange(0, 600, 200, 800, Math.min(d, 600)))
        })
      })
      window.addEventListener('pointermove', move)
      return () => window.removeEventListener('pointermove', move)
    },
    { scope: root },
  )

  const hello = whatsappUrl(STORE.whatsapp, `Olá! Vim pelo site da ${STORE.name} e tenho uma dúvida.`)

  return (
    <div className="footer-wrap" id="contato" ref={root}>
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-call">
            <p className="eyebrow">(05) — Fale com a gente</p>
            <h2 className="footer-title">
              Não achou o que queria? <span className="display-serif">A gente monta.</span>
            </h2>
            <Magnetic>
              <a className="pill pill-solid pill-lg" href={hello} target="_blank" rel="noreferrer" data-cursor="Conversar">
                <span className="pill-roll" data-text="Chamar no WhatsApp">Chamar no WhatsApp</span>
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
                  <span key={h.days} className="footer-hour">
                    <span>{h.days}</span>
                    <span>{h.time}</span>
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
          {WORD.split('').map((c, i) => (
            <span key={i} className="ft-char">
              {c}
            </span>
          ))}
        </p>
        <p className="footer-legal">
          <span>© {new Date().getFullYear()} {STORE.name}</span>
          <span>Preços e disponibilidade confirmados no atendimento.</span>
        </p>
      </footer>
    </div>
  )
}
