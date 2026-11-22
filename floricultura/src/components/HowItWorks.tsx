import { useRef } from 'react'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'

const STEPS = [
  { t: 'Escolha', d: 'Navegue pelo catálogo e coloque na sacola o que combina com o momento.' },
  { t: 'Conte os detalhes', d: 'Entrega ou retirada, data, período e a mensagem do cartão.' },
  { t: 'Envie no WhatsApp', d: 'O pedido chega pronto para nós. Confirmamos e você paga por Pix ou cartão.' },
]

const MANIFESTO =
  'Nossas flores chegam todas as manhãs e cada buquê é montado na hora do pedido, à mão, sem atalho. Você conta o motivo, a gente cuida do resto.'

export function HowItWorks() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      // manifesto: palavras acendem conforme a rolagem
      gsap.fromTo(
        '.manifesto-w',
        { opacity: 0.14 },
        {
          opacity: 1,
          stagger: 0.05,
          ease: 'none',
          scrollTrigger: { trigger: '.manifesto', start: 'top 80%', end: 'bottom 45%', scrub: true },
        },
      )
      gsap.utils.toArray<HTMLElement>('.step').forEach((step) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: step, start: 'top 82%', once: true } })
        tl.from(step.querySelector('.step-line'), { scaleX: 0, transformOrigin: 'left center', duration: 1, ease: 'power3.inOut' })
          .from(step.querySelector('.step-num'), { yPercent: 100, duration: 0.9, ease: 'power4.out' }, 0.2)
          .from(step.querySelectorAll('.step-t, .step-d'), { y: 20, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, 0.35)
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} className="how" id="como-funciona" aria-labelledby="how-title">
      <p className="manifesto">
        {MANIFESTO.split(' ').map((w, i) => (
          <span key={i} className="manifesto-w">
            {w}{' '}
          </span>
        ))}
      </p>

      <p className="eyebrow">Como funciona</p>
      <h2 id="how-title" className="section-title">
        Três passos e <em>pronto</em>
      </h2>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li className="step" key={s.t}>
            <span className="step-line" aria-hidden />
            <span className="step-num-mask" aria-hidden>
              <span className="step-num">0{i + 1}</span>
            </span>
            <h3 className="step-t">{s.t}</h3>
            <p className="step-d">{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
