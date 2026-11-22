import { useRef } from 'react'
import { PRODUCTS } from '../data/products'
import { gsap, useGSAP } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'

const STEPS = [
  { t: 'Escolha', d: 'Navegue pelo catálogo e coloque na sacola o que combina com o momento.', bg: '#ef5b4c', fg: '#141414', art: 'buque-aurora' },
  { t: 'Conte', d: 'Entrega ou retirada, data, período e a mensagem do cartão. A gente escreve à mão.', bg: '#ffd166', fg: '#141414', art: 'buque-sol' },
  { t: 'Envie', d: 'O pedido chega pronto no nosso WhatsApp. Confirmamos e você paga por Pix ou cartão.', bg: '#c9bdf2', fg: '#141414', art: 'vaso-lavanda' },
]

/** Cards que empilham: o de trás encolhe e escurece enquanto o próximo sobe. */
export function Steps() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const cards = gsap.utils.toArray<HTMLElement>('.stack-card')
        cards.forEach((card, i) => {
          if (i === cards.length - 1) return
          gsap.to(card.querySelector('.stack-inner'), {
            scale: 0.88 - (cards.length - i) * 0.02,
            filter: 'brightness(0.8)',
            ease: 'none',
            scrollTrigger: { trigger: cards[i + 1], start: 'top bottom', end: 'top 12%', scrub: true },
          })
        })
        gsap.utils.toArray<HTMLElement>('.stack-art').forEach((art) => {
          gsap.fromTo(art, { rotate: -12, yPercent: 20 }, { rotate: 8, yPercent: -10, ease: 'none', scrollTrigger: { trigger: art, start: 'top bottom', end: 'bottom top', scrub: true } })
        })
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} className="steps" id="como-funciona" data-bg="#141414" data-fg="#f4f1ea" aria-labelledby="steps-title">
      <div className="steps-head">
        <p className="eyebrow">(04) — Como funciona</p>
        <h2 id="steps-title" className="display">
          Três passos<span className="display-serif"> e pronto.</span>
        </h2>
      </div>
      <ol className="stack">
        {STEPS.map((s, i) => {
          const p = PRODUCTS.find((x) => x.id === s.art)!
          return (
            <li key={s.t} className="stack-card" style={{ top: `calc(10vh + ${i * 28}px)` }}>
              <div className="stack-inner" style={{ background: s.bg, color: s.fg }}>
                <span className="stack-num">0{i + 1}</span>
                <div className="stack-text">
                  <h3 className="stack-title">{s.t}</h3>
                  <p className="stack-desc">{s.d}</p>
                </div>
                <div className="stack-art" aria-hidden>
                  <FlowerArt spec={p.art} seed={`${p.id}-step`} />
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
