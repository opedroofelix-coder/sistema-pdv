import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import { STORE } from '../config'
import { useCart } from '../lib/cart'
import { ScrollTrigger, useGSAP } from '../lib/gsap'
import { useScrollTo } from './SmoothScroll'

const LINKS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'ocasioes', label: 'Ocasiões' },
  { id: 'como-funciona', label: 'Como funciona' },
  { id: 'contato', label: 'Contato' },
]

export function Header() {
  const { count, setOpen } = useCart()
  const ref = useRef<HTMLElement>(null)
  const scrollTo = useScrollTo()

  // esconde ao descer, volta ao subir
  useGSAP(() => {
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        const el = ref.current
        if (!el) return
        el.classList.toggle('is-scrolled', self.scroll() > 40)
        el.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 240)
      },
    })
    return () => st.kill()
  })

  return (
    <header ref={ref} className="header">
      <a href="#topo" className="brand" onClick={(e) => { e.preventDefault(); scrollTo('topo') }}>
        <svg viewBox="0 0 32 32" aria-hidden className="brand-mark">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="16" cy="9" rx="4.2" ry="7" transform={`rotate(${a} 16 16)`} />
          ))}
          <circle cx="16" cy="16" r="3.4" className="brand-dot" />
        </svg>
        <span>{STORE.name}</span>
      </a>
      <nav className="nav" aria-label="Seções">
        {LINKS.map((l) => (
          <a key={l.id} href={`#${l.id}`} onClick={(e) => { e.preventDefault(); scrollTo(l.id) }}>
            <span data-text={l.label}>{l.label}</span>
          </a>
        ))}
      </nav>
      <button className="bag-btn" onClick={() => setOpen(true)} data-cursor="Abrir" aria-label={`Abrir sacola, ${count} ${count === 1 ? 'item' : 'itens'}`}>
        <span>Sacola</span>
        <span className="bag-count">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
    </header>
  )
}
