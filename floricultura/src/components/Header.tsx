import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import { STORE } from '../config'
import { useCart } from '../lib/cart'
import { ScrollTrigger, useGSAP } from '../lib/gsap'
import { whatsappUrl } from '../lib/order'
import { IconBag, IconWhats } from './Icons'
import { useScrollTo } from './SmoothScroll'

const LINKS = [
  { id: 'ocasioes', label: 'Ocasiões' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'monte', label: 'Monte seu buquê' },
  { id: 'sobre', label: 'Sobre' },
  { id: 'contato', label: 'Contato' },
]

export function Header() {
  const { count, setOpen } = useCart()
  const ref = useRef<HTMLElement>(null)
  const scrollTo = useScrollTo()

  useGSAP(() => {
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        const el = ref.current
        if (!el) return
        el.classList.toggle('is-scrolled', self.scroll() > 30)
        el.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 400)
      },
    })
    return () => st.kill()
  })

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    scrollTo(id)
  }

  return (
    <header ref={ref} className="header">
      <a href="#topo" className="brand" onClick={go('topo')}>
        <span className="brand-name">{STORE.shortName}</span>
        <span className="brand-sub">das flores</span>
      </a>
      <nav className="nav" aria-label="Seções">
        {LINKS.map((l) => (
          <a key={l.id} href={`#${l.id}`} onClick={go(l.id)}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        <a className="header-whats" href={whatsappUrl(STORE.whatsapp, `Olá! Vim pelo site da ${STORE.name}.`)} target="_blank" rel="noreferrer">
          <IconWhats />
          <span>{STORE.whatsappDisplay}</span>
        </a>
        <button className="cart-btn" data-cart-target onClick={() => setOpen(true)} aria-label={`Abrir sacola, ${count} ${count === 1 ? 'item' : 'itens'}`}>
          <IconBag />
          <AnimatePresence initial={false}>
            {count > 0 ? (
              <motion.span
                key={count}
                className="cart-count"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              >
                {count}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>
      </div>
    </header>
  )
}
