import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'
import { CATEGORIES, OCCASIONS, PRODUCTS, type Category, type Occasion } from '../data/products'
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { ProductCard } from './ProductCard'
import { SectionHead } from './SectionHead'

interface Props {
  category: Category | 'todos'
  occasion: Occasion | null
  onCategory: (c: Category | 'todos') => void
  onOccasion: (o: Occasion | null) => void
}

export function Catalog({ category, occasion, onCategory, onOccasion }: Props) {
  const root = useRef<HTMLElement>(null)
  const list = useMemo(
    () => PRODUCTS.filter((p) => (category === 'todos' || p.category === category) && (!occasion || p.occasions.includes(occasion))),
    [category, occasion],
  )

  useEffect(() => {
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 700)
    return () => window.clearTimeout(t)
  }, [list])

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      ScrollTrigger.batch('.pcard', {
        start: 'top 90%',
        once: true,
        onEnter: (els) => gsap.from(els, { y: 60, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: 0.08 }),
      })
    },
    { scope: root },
  )

  const occ = OCCASIONS.find((o) => o.id === occasion)

  return (
    <section ref={root} className="section catalog" id="catalogo" aria-labelledby="cat-title">
      <SectionHead
        id="cat-title"
        eyebrow="Mais pedidos"
        title={
          <>
            Buquês e arranjos
            <br />
            feitos à mão, hoje
          </>
        }
        action={
          <div className="chips" role="toolbar" aria-label="Filtrar por tipo">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={`chip${category === c.id ? ' is-on' : ''}`} aria-pressed={category === c.id} onClick={() => onCategory(c.id)}>
                {category === c.id ? <motion.span layoutId="chip-bg" className="chip-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} /> : null}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        }
      />

      <AnimatePresence>
        {occ ? (
          <motion.div className="occ-filter" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <span>
              Sugestões para <em>{occ.label}</em>
            </span>
            <button onClick={() => onOccasion(null)}>Limpar filtro ✕</button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div layout className="grid">
        <AnimatePresence mode="popLayout">
          {list.map((p) => (
            <motion.div
              key={p.id}
              layout
              className="grid-cell"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            >
              <ProductCard product={p} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {list.length === 0 ? (
        <div className="empty">
          <p>Nada nessa combinação ainda.</p>
          <button className="btn-soft" onClick={() => { onCategory('todos'); onOccasion(null) }}>
            Ver tudo
          </button>
        </div>
      ) : null}
    </section>
  )
}
