import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { CATEGORIES, OCCASIONS, PRODUCTS, type Category, type Occasion } from '../data/products'
import { ScrollTrigger } from '../lib/gsap'
import { ProductCard } from './ProductCard'
import { SplitWords } from './SplitWords'

interface Props {
  category: Category | 'todos'
  occasion: Occasion | null
  onCategory: (c: Category | 'todos') => void
  onOccasion: (o: Occasion | null) => void
}

export function Catalog({ category, occasion, onCategory, onOccasion }: Props) {
  const list = useMemo(
    () => PRODUCTS.filter((p) => (category === 'todos' || p.category === category) && (!occasion || p.occasions.includes(occasion))),
    [category, occasion],
  )

  // a altura da seção muda com o filtro: recalcula os gatilhos de rolagem
  useEffect(() => {
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 650)
    return () => window.clearTimeout(t)
  }, [list])

  const occ = OCCASIONS.find((o) => o.id === occasion)

  return (
    <section className="catalog" id="catalogo" aria-labelledby="cat-title">
      <div className="catalog-head">
        <div>
          <p className="eyebrow">Catálogo · {PRODUCTS.length} itens</p>
          <h2 id="cat-title" className="section-title">
            <SplitWords text="Feito hoje, para hoje." italic={['hoje.']} />
          </h2>
        </div>
        <div className="filters" role="toolbar" aria-label="Filtrar catálogo">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`chip${category === c.id ? ' is-on' : ''}`} aria-pressed={category === c.id} onClick={() => onCategory(c.id)}>
              {category === c.id ? <motion.span layoutId="chip-bg" className="chip-bg" transition={{ type: 'spring', stiffness: 400, damping: 34 }} /> : null}
              <span className="chip-label">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {occ ? (
          <motion.div
            className="occ-filter"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span>
              Mostrando sugestões para <strong>{occ.label}</strong>
            </span>
            <button onClick={() => onOccasion(null)}>Limpar ✕</button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div layout className="grid">
        <AnimatePresence mode="popLayout">
          {list.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.25 } }}
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
          <button className="btn btn-ghost" onClick={() => { onCategory('todos'); onOccasion(null) }}>
            Ver tudo
          </button>
        </div>
      ) : null}
    </section>
  )
}
