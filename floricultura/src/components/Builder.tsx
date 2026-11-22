import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { BUILDER, type BuilderOption } from '../data/products'
import { useCart } from '../lib/cart'
import { flyToCart } from '../lib/fly'
import { brl } from '../lib/format'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { photo } from '../lib/photos'
import { IconArrow, IconCard, IconFlower, IconRibbon, IconSpark, IconWrap } from './Icons'

type Tab = 'flores' | 'embalagem' | 'fita' | 'extras' | 'cartao'
const TABS: { id: Tab; label: string; Icon: typeof IconFlower }[] = [
  { id: 'flores', label: 'Flores', Icon: IconFlower },
  { id: 'embalagem', label: 'Embalagem', Icon: IconWrap },
  { id: 'fita', label: 'Fita', Icon: IconRibbon },
  { id: 'extras', label: 'Extras', Icon: IconSpark },
  { id: 'cartao', label: 'Cartão', Icon: IconCard },
]

const START: Record<string, number> = { peonia: 5, 'rosa-rose': 5, eucalipto: 3 }

/** Total animado: o número corre até o novo valor. */
function AnimatedPrice({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(value)
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const o = { v: last.current }
      gsap.to(o, {
        v: value,
        duration: prefersReducedMotion() ? 0 : 0.6,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = brl(o.v)
        },
      })
      last.current = value
    },
    { dependencies: [value] },
  )
  return <span ref={ref}>{brl(value)}</span>
}

export function Builder() {
  const [tab, setTab] = useState<Tab>('flores')
  const [stems, setStems] = useState<Record<string, number>>(START)
  const [wrap, setWrap] = useState('seda')
  const [ribbon, setRibbon] = useState('cetim-rose')
  const [extras, setExtras] = useState<string[]>([])
  const [card, setCard] = useState('')
  const [added, setAdded] = useState(false)
  const { addCustom } = useCart()
  const root = useRef<HTMLElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const find = (list: BuilderOption[], id: string) => list.find((o) => o.id === id)!

  const summary = useMemo(() => {
    const lines: { key: string; label: string; detail: string; price: number; color: string }[] = []
    for (const f of BUILDER.flowers) {
      const n = stems[f.id] ?? 0
      if (n > 0) lines.push({ key: f.id, label: f.name, detail: `${n} un.`, price: n * f.price, color: f.color })
    }
    const w = find(BUILDER.wraps, wrap)
    lines.push({ key: 'wrap', label: w.name, detail: 'embalagem', price: w.price, color: w.color })
    const r = find(BUILDER.ribbons, ribbon)
    lines.push({ key: 'ribbon', label: `Fita ${r.name.toLowerCase()}`, detail: 'fita', price: r.price, color: r.color })
    for (const id of extras) {
      const e = find(BUILDER.extras, id)
      lines.push({ key: id, label: e.name, detail: 'extra', price: e.price, color: e.color })
    }
    lines.push({ key: 'base', label: BUILDER.base.name, detail: '', price: BUILDER.base.price, color: '#d8c3a8' })
    const total = lines.reduce((s, l) => s + l.price, 0)
    const flowers = BUILDER.flowers.reduce((s, f) => s + (stems[f.id] ?? 0), 0)
    return { lines, total: Math.round(total * 100) / 100, flowers }
  }, [stems, wrap, ribbon, extras])

  const pulse = () => {
    if (prefersReducedMotion() || !imgRef.current) return
    gsap.fromTo(imgRef.current, { scale: 1.04 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, 0.5)' })
  }

  const bump = (id: string, d: number) => {
    setStems((s) => ({ ...s, [id]: Math.max(0, Math.min(40, (s[id] ?? 0) + d)) }))
    pulse()
  }

  const addToBag = () => {
    if (summary.flowers === 0) return
    const details = [
      ...BUILDER.flowers.filter((f) => stems[f.id]).map((f) => `${stems[f.id]} ${f.name}`),
      find(BUILDER.wraps, wrap).name,
      `Fita ${find(BUILDER.ribbons, ribbon).name.toLowerCase()}`,
      ...extras.map((id) => find(BUILDER.extras, id).name),
      ...(card.trim() ? [`Cartão: "${card.trim()}"`] : []),
    ]
    addCustom({ id: `custom-${Date.now()}`, name: 'Buquê personalizado', price: summary.total, details })
    flyToCart(imgRef.current, photo('builder'))
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2400)
  }

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 75%', once: true } })
      tl.from('.bd-intro > *', { y: 30, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' })
        .from('.bd-tab', { x: -20, autoAlpha: 0, duration: 0.6, stagger: 0.05, ease: 'power3.out' }, 0.2)
        .fromTo('.bd-stage', { clipPath: 'inset(10% 10% 10% 10% round 24px)' }, { clipPath: 'inset(0% 0% 0% 0% round 24px)', duration: 1.3, ease: 'power4.inOut' }, 0.1)
        .from('.bd-summary', { x: 40, autoAlpha: 0, duration: 1, ease: 'power3.out' }, 0.4)
    },
    { scope: root },
  )

  return (
    <section ref={root} className="section builder-wrap" id="monte" aria-labelledby="bd-title">
      <div className="builder">
        <div className="bd-intro">
          <p className="eyebrow">Monte seu buquê</p>
          <h2 className="section-title" id="bd-title">
            Crie o buquê
            <br />
            dos seus sonhos
          </h2>
          <p className="bd-text">Escolha as flores, a embalagem e os detalhes. A gente monta do jeito que você imaginou e manda foto antes de sair.</p>
          <div className="bd-tabs" role="tablist" aria-label="Etapas do buquê">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`bd-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
                {tab === id ? <motion.span layoutId="bd-tab-bg" className="bd-tab-bg" transition={{ type: 'spring', stiffness: 400, damping: 34 }} /> : null}
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bd-stage">
          <img ref={imgRef} src={photo('builder')} alt="Buquê de exemplo em tons pastel" />
          <div className="bd-panel" role="tabpanel" data-lenis-prevent>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                {tab === 'flores' ? (
                  <ul className="bd-list">
                    {BUILDER.flowers.map((f) => (
                      <li key={f.id} className="bd-row">
                        <span className="dot" style={{ background: f.color }} />
                        <span className="bd-row-name">
                          {f.name}
                          <small>{brl(f.price)} / haste</small>
                        </span>
                        <span className="mini-stepper">
                          <button onClick={() => bump(f.id, -1)} aria-label={`Menos ${f.name}`}>−</button>
                          <span>{stems[f.id] ?? 0}</span>
                          <button onClick={() => bump(f.id, 1)} aria-label={`Mais ${f.name}`}>+</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tab === 'embalagem' || tab === 'fita' ? (
                  <div className="bd-options">
                    {(tab === 'embalagem' ? BUILDER.wraps : BUILDER.ribbons).map((o) => {
                      const on = (tab === 'embalagem' ? wrap : ribbon) === o.id
                      return (
                        <button
                          key={o.id}
                          className={`bd-opt${on ? ' is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => {
                            if (tab === 'embalagem') setWrap(o.id)
                            else setRibbon(o.id)
                            pulse()
                          }}
                        >
                          <span className="swatch" style={{ background: o.color }} />
                          <span>{o.name}</span>
                          <small>{o.price ? `+ ${brl(o.price)}` : 'incluso'}</small>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {tab === 'extras' ? (
                  <div className="bd-options">
                    {BUILDER.extras.map((o) => {
                      const on = extras.includes(o.id)
                      return (
                        <button
                          key={o.id}
                          className={`bd-opt${on ? ' is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => {
                            setExtras((x) => (on ? x.filter((i) => i !== o.id) : [...x, o.id]))
                            pulse()
                          }}
                        >
                          <span className="swatch" style={{ background: o.color }} />
                          <span>{o.name}</span>
                          <small>+ {brl(o.price)}</small>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {tab === 'cartao' ? (
                  <label className="bd-card">
                    <span>Mensagem do cartão (escrita à mão)</span>
                    <textarea id="bd-card-msg" rows={4} maxLength={240} value={card} onChange={(e) => setCard(e.target.value)} placeholder="Ex.: Feliz aniversário! Com carinho, Ana." />
                    <small>{card.length}/240</small>
                  </label>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <aside className="bd-summary" aria-label="Resumo do buquê">
          <p className="bd-sum-title">Seu buquê</p>
          <ul className="bd-sum-list">
            <AnimatePresence initial={false}>
              {summary.lines.map((l) => (
                <motion.li key={l.key} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                  <span className="dot" style={{ background: l.color }} />
                  <span className="bd-sum-name">{l.label}</span>
                  <span className="bd-sum-detail">{l.detail}</span>
                  <span className="bd-sum-price">{l.price ? brl(l.price) : '—'}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="bd-total">
            <span>Total</span>
            <strong>
              <AnimatedPrice value={summary.total} />
            </strong>
          </div>
          <button className="btn-gold btn-block" onClick={addToBag} disabled={summary.flowers === 0}>
            {added ? 'Adicionado à sacola ✓' : summary.flowers === 0 ? 'Escolha ao menos uma flor' : 'Adicionar à sacola'}
            {!added && summary.flowers > 0 ? <IconArrow /> : null}
          </button>
        </aside>
      </div>
    </section>
  )
}
