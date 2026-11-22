import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, OCCASIONS, PRODUCTS, type Category, type Occasion } from '../data/products'
import { ScrollTrigger } from '../lib/gsap'
import { ProductCard } from './ProductCard'
import { ProductIndex } from './ProductIndex'
import { SplitWords } from './SplitWords'

interface Props {
  category: Category | 'todos'
  occasion: Occasion | null
  onCategory: (c: Category | 'todos') => void
  onOccasion: (o: Occasion | null) => void
}

type View = 'grade' | 'indice'

export function Catalog({ category, occasion, onCategory, onOccasion }: Props) {
  const [view, setView] = useState<View>('grade')
  const list = useMemo(
    () => PRODUCTS.filter((p) => (category === 'todos' || p.category === category) && (!occasion || p.occasions.includes(occasion))),
    [category, occasion],
  )

  useEffect(() => {
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 700)
    return () => window.clearTimeout(t)
  }, [list, view])

  const occ = OCCASIONS.find((o) => o.id === occasion)

  return (
    <section className="catalog" id="catalogo" data-bg="#f3f1ec" data-fg="#141414" aria-labelledby="cat-title">
      <div className="catalog-head">
        <p className="eyebrow">(02) — Catálogo</p>
        <h2 id="cat-title" className="display">
          <SplitWords text="Feito hoje," />
          <br />
          <span className="display-serif">
            <SplitWords text="para hoje." />
          </span>
          <sup className="display-count">({list.length})</sup>
        </h2>
        <p className="catalog-lede">
          Toque numa flor para colocar na sacola. No fim, você revisa o pedido e envia direto para o nosso WhatsApp.
        </p>
      </div>

      <div className="catalog-bar">
        <div className="filters" role="toolbar" aria-label="Filtrar por tipo">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`chip${category === c.id ? ' is-on' : ''}`} aria-pressed={category === c.id} onClick={() => onCategory(c.id)}>
              {category === c.id ? <motion.span layoutId="chip-bg" className="chip-bg" transition={{ type: 'spring', stiffness: 400, damping: 34 }} /> : null}
              <span className="chip-label">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="view-toggle" role="group" aria-label="Modo de exibição">
          {(['grade', 'indice'] as const).map((v) => (
            <button key={v} className={view === v ? 'is-on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'grade' ? 'Grade' : 'Índice'}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {occ ? (
          <motion.div className="occ-filter" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <span>
              Sugestões para <em>{occ.label}</em>
            </span>
            <button onClick={() => onOccasion(null)}>Limpar ✕</button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {view === 'indice' ? (
        <ProductIndex list={list} />
      ) : (
        <motion.div layout className="grid">
          <AnimatePresence mode="popLayout">
            {list.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                className={`grid-item grid-item-${i % 6}`}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
              >
                <ProductCard product={p} index={PRODUCTS.indexOf(p)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {list.length === 0 ? (
        <div className="empty">
          <p>Nada nessa combinação ainda.</p>
          <button className="pill" onClick={() => { onCategory('todos'); onOccasion(null) }}>
            Ver tudo
          </button>
        </div>
      ) : null}
    </section>
  )
}
