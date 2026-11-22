import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import type { Product } from '../data/products'
import { useCart } from '../lib/cart'
import { brl } from '../lib/format'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { qtyOf, add, setQty } = useCart()
  const qty = qtyOf(product.id)
  const root = useRef<HTMLElement>(null)

  useGSAP(
    (_, contextSafe) => {
      if (prefersReducedMotion() || !contextSafe) return
      // revelação: a moldura abre de baixo, as flores desabrocham
      const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 88%', once: true } })
      tl.fromTo('.card-art', { clipPath: 'inset(100% 0% 0% 0% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 1.1, ease: 'power4.inOut' })
        .from('.card-svg', { scale: 1.3, duration: 1.4, ease: 'power3.out' }, 0)
        .fromTo('.fa-stem', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.01 }, 0.3)
        .from('.fa-bloom', { scale: 0, transformOrigin: '50% 50%', duration: 0.8, ease: 'back.out(1.8)', stagger: { each: 0.025, from: 'random' } }, 0.55)
        .from('.card-body > *', { y: 24, autoAlpha: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06 }, 0.5)

      // inclinação 3D com o ponteiro
      if (!window.matchMedia('(pointer: fine)').matches) return
      const art = root.current!.querySelector<HTMLElement>('.card-art')!
      const svg = root.current!.querySelector<HTMLElement>('.card-svg')
      const rx = gsap.quickTo(art, 'rotateX', { duration: 0.6, ease: 'power3.out' })
      const ry = gsap.quickTo(art, 'rotateY', { duration: 0.6, ease: 'power3.out' })
      const sx = svg ? gsap.quickTo(svg, 'x', { duration: 0.8, ease: 'power3.out' }) : null
      const sy = svg ? gsap.quickTo(svg, 'y', { duration: 0.8, ease: 'power3.out' }) : null
      const move = contextSafe((e: PointerEvent) => {
        const r = art.getBoundingClientRect()
        const nx = (e.clientX - r.left) / r.width - 0.5
        const ny = (e.clientY - r.top) / r.height - 0.5
        ry(nx * 12)
        rx(ny * -12)
        sx?.(nx * 18)
        sy?.(ny * 18)
      })
      const leave = contextSafe(() => {
        rx(0)
        ry(0)
        sx?.(0)
        sy?.(0)
      })
      art.addEventListener('pointermove', move)
      art.addEventListener('pointerleave', leave)
      return () => {
        art.removeEventListener('pointermove', move)
        art.removeEventListener('pointerleave', leave)
      }
    },
    { scope: root },
  )

  const onAdd = () => {
    add(product.id)
    if (!prefersReducedMotion()) {
      gsap.fromTo(root.current!.querySelectorAll('.fa-bloom'), { scale: 0.6 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)', stagger: 0.01, transformOrigin: '50% 50%' })
    }
  }

  return (
    <article ref={root} className="card">
      <div className="card-art" style={{ background: product.art.bg }} data-cursor={qty ? `${qty} na sacola` : 'Adicionar'} onClick={onAdd}>
        <span className="card-num">({String(index + 1).padStart(2, '0')})</span>
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
                className="pill pill-solid"
                onClick={onAdd}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <span className="pill-roll" data-text="Adicionar à sacola">Adicionar à sacola</span>
              </motion.button>
            ) : (
              <motion.div
                key="qty"
                className="stepper"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <button onClick={() => setQty(product.id, qty - 1)} aria-label={`Diminuir ${product.name}`}>−</button>
                <span aria-live="polite">{qty} na sacola</span>
                <button onClick={() => setQty(product.id, qty + 1)} aria-label={`Aumentar ${product.name}`}>+</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </article>
  )
}
