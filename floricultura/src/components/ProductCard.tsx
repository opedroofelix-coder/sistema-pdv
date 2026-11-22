import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import type { Product } from '../data/products'
import { useCart } from '../lib/cart'
import { brl } from '../lib/format'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'

export function ProductCard({ product }: { product: Product }) {
  const { qtyOf, add, setQty } = useCart()
  const qty = qtyOf(product.id)
  const root = useRef<HTMLElement>(null)

  // as flores "abrem" quando o card entra na tela
  useGSAP(
    () => {
      if (prefersReducedMotion() || product.image) return
      const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 85%', once: true } })
      tl.fromTo('.fa-stem', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.015 })
      tl.from('.fa-bloom', { scale: 0, transformOrigin: '50% 50%', duration: 0.8, ease: 'back.out(1.7)', stagger: { each: 0.03, from: 'random' } }, 0.25)
    },
    { scope: root },
  )

  const onAdd = () => {
    add(product.id)
    // pulso na arte para confirmar
    if (!prefersReducedMotion()) gsap.fromTo(root.current!.querySelector('.card-art'), { scale: 0.97 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' })
  }

  return (
    <article ref={root} className="card">
      <div className="card-art" style={{ background: product.art.bg }} data-cursor={qty ? 'Na sacola' : 'Adicionar'} onClick={onAdd}>
        {product.tag ? <span className="card-tag">{product.tag}</span> : null}
        {product.image ? (
          <img src={product.image} alt={product.name} loading="lazy" />
        ) : (
          <FlowerArt spec={product.art} seed={product.id} title={product.name} className="card-svg" />
        )}
      </div>
      <div className="card-body">
        <div className="card-row">
          <h3 className="card-name">{product.name}</h3>
          <p className="card-price">{brl(product.price)}</p>
        </div>
        <p className="card-desc">{product.description}</p>
        <div className="card-cta">
          <AnimatePresence mode="wait" initial={false}>
            {qty === 0 ? (
              <motion.button
                key="add"
                className="btn btn-primary btn-block"
                onClick={onAdd}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                Adicionar à sacola
              </motion.button>
            ) : (
              <motion.div
                key="qty"
                className="stepper"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <button onClick={() => setQty(product.id, qty - 1)} aria-label={`Diminuir ${product.name}`}>−</button>
                <span aria-live="polite">
                  {qty} na sacola
                </span>
                <button onClick={() => setQty(product.id, qty + 1)} aria-label={`Aumentar ${product.name}`}>+</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </article>
  )
}
