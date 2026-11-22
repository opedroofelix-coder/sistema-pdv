import { useRef } from 'react'
import { STORE } from '../config'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { whatsappUrl } from '../lib/order'
import { photo } from '../lib/photos'
import { IconArrow, IconWhats } from './Icons'
import { Magnetic } from './Magnetic'
import { PetalField } from './PetalField'
import { useScrollTo } from './SmoothScroll'

export function Footer() {
  const root = useRef<HTMLElement>(null)
  const scrollTo = useScrollTo()

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.fromTo('.banner-img', { scale: 1.25, yPercent: -6 }, { scale: 1, yPercent: 6, ease: 'none', scrollTrigger: { trigger: '.banner', start: 'top bottom', end: 'bottom top', scrub: true } })
      gsap.from('.banner-line-i', { yPercent: 110, duration: 1.2, ease: 'power4.out', stagger: 0.1, scrollTrigger: { trigger: '.banner', start: 'top 70%', once: true } })
    },
    { scope: root },
  )

  const hello = whatsappUrl(STORE.whatsapp, `Olá! Vim pelo site da ${STORE.name}.`)

  return (
    <footer ref={root} className="footer" id="contato">
      <div className="banner">
        <PetalField density={0.6} />
        <div className="banner-media" aria-hidden>
          <img className="banner-img" src={photo('banner')} alt="" loading="lazy" />
        </div>
        <div className="banner-copy">
          <h2 className="banner-title">
            {['Presenteie sentimentos', 'que ficam no coração', 'para sempre'].map((l) => (
              <span key={l} className="banner-line">
                <span className="banner-line-i">{l}</span>
              </span>
            ))}
          </h2>
          <Magnetic>
            <button className="btn-gold" onClick={() => scrollTo('catalogo')} data-cursor="Ver">
              Escolher buquê <IconArrow />
            </button>
          </Magnetic>
        </div>
      </div>

      <div className="foot">
        <div className="foot-brand">
          <p className="brand-name">{STORE.shortName}</p>
          <p className="brand-sub">das flores</p>
          <p className="foot-text">{STORE.tagline}. Flores frescas, montadas à mão, com entrega na cidade.</p>
        </div>
        <dl className="foot-cols">
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
                <span key={h.days} className="foot-hour">
                  <span>{h.days}</span>
                  <span>{h.time}</span>
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Contato</dt>
            <dd>
              <a href={hello} target="_blank" rel="noreferrer" className="foot-whats">
                <IconWhats /> {STORE.whatsappDisplay}
              </a>
              <a href={`https://instagram.com/${STORE.instagram}`} target="_blank" rel="noreferrer">
                @{STORE.instagram}
              </a>
            </dd>
          </div>
        </dl>
      </div>
      <p className="foot-legal">
        <span>© {new Date().getFullYear()} {STORE.name}. Preços e disponibilidade confirmados no atendimento.</span>
        <span>Fotos ilustrativas de banco de imagens livre (CC0).</span>
      </p>
    </footer>
  )
}
