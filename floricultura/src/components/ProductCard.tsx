import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import type { Product } from '../data/products'
import { useCart } from '../lib/cart'
import { flyToCart } from '../lib/fly'
import { brl } from '../lib/format'
import { photo } from '../lib/photos'
import { IconBag, IconHeart } from './Icons'

const FAV_KEY = 'floricultura:favoritos'
function readFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function ProductCard({ product }: { product: Product }) {
  const { qtyOf, add, setQty } = useCart()
  const qty = qtyOf(product.id)
  const [fav, setFav] = useState(() => readFavs().includes(product.id))
  const imgRef = useRef<HTMLImageElement>(null)
  const src = photo(product.photo)

  const onAdd = () => {
    add(product.id)
    flyToCart(imgRef.current, src)
  }

  const toggleFav = () => {
    const next = !fav
    setFav(next)
    try {
      const set = new Set(readFavs())
      if (next) set.add(product.id)
      else set.delete(product.id)
      localStorage.setItem(FAV_KEY, JSON.stringify([...set]))
    } catch {
      /* ignora */
    }
  }

  return (
    <article className="pcard">
      <div className="pcard-media" onClick={onAdd} data-cursor={qty ? `${qty} na sacola` : 'Adicionar'}>
        <img ref={imgRef} src={src} alt={product.name} loading="lazy" />
        {product.tag ? <span className="pcard-tag">{product.tag}</span> : null}
        <motion.button
          className={`pcard-fav${fav ? ' is-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleFav()
          }}
          whileTap={{ scale: 0.8 }}
          animate={fav ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          aria-pressed={fav}
          aria-label={fav ? `Tirar ${product.name} dos favoritos` : `Favoritar ${product.name}`}
        >
          <IconHeart />
        </motion.button>
      </div>
      <div className="pcard-body">
        <div>
          <h3 className="pcard-name">{product.name}</h3>
          <p className="pcard-desc">{product.description}</p>
          <p className="pcard-price">{brl(product.price)}</p>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {qty === 0 ? (
            <motion.button
              key="add"
              className="pcard-add"
              onClick={onAdd}
              aria-label={`Adicionar ${product.name} à sacola`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <IconBag />
            </motion.button>
          ) : (
            <motion.div
              key="qty"
              className="mini-stepper"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button onClick={() => setQty(product.id, qty - 1)} aria-label={`Diminuir ${product.name}`}>−</button>
              <span aria-live="polite">{qty}</span>
              <button onClick={onAdd} aria-label={`Aumentar ${product.name}`}>+</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </article>
  )
}
