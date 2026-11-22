import { useRef, useState } from 'react'
import type { Product } from '../data/products'
import { useCart } from '../lib/cart'
import { brl } from '../lib/format'
import { gsap, useGSAP } from '../lib/gsap'
import { FlowerArt } from './FlowerArt'

const CAT: Record<Product['category'], string> = { buques: 'Buquê', arranjos: 'Arranjo', plantas: 'Planta', presentes: 'Presente' }

/** Lista em tipografia grande; a prévia da flor segue o ponteiro. */
export function ProductIndex({ list }: { list: Product[] }) {
  const root = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Product | null>(null)
  const { add, qtyOf } = useCart()

  useGSAP(
    (_, contextSafe) => {
      const el = preview.current
      const box = root.current
      if (!el || !box || !contextSafe) return
      const xTo = gsap.quickTo(el, 'x', { duration: 0.7, ease: 'power3.out' })
      const yTo = gsap.quickTo(el, 'y', { duration: 0.7, ease: 'power3.out' })
      const rTo = gsap.quickTo(el, 'rotate', { duration: 0.9, ease: 'power3.out' })
      let lastX = 0
      const move = contextSafe((e: PointerEvent) => {
        const r = box.getBoundingClientRect()
        xTo(e.clientX - r.left)
        yTo(e.clientY - r.top)
        rTo(gsap.utils.clamp(-14, 14, (e.clientX - lastX) * 0.6))
        lastX = e.clientX
      })
      box.addEventListener('pointermove', move)
      return () => box.removeEventListener('pointermove', move)
    },
    { scope: root },
  )

  useGSAP(
    () => {
      gsap.to(preview.current, { scale: active ? 1 : 0, autoAlpha: active ? 1 : 0, duration: 0.5, ease: active ? 'back.out(1.6)' : 'power3.in' })
    },
    { dependencies: [active], scope: root },
  )

  return (
    <div ref={root} className="pindex" onPointerLeave={() => setActive(null)}>
      <div ref={preview} className="pindex-preview" aria-hidden>
        {active ? (
          <div className="pindex-preview-art" style={{ background: active.art.bg }}>
            <FlowerArt key={active.id} spec={active.art} seed={active.id} />
          </div>
        ) : null}
      </div>
      <ol className="pindex-list">
        {list.map((p, i) => {
          const qty = qtyOf(p.id)
          return (
            <li key={p.id} className="pindex-row" onPointerEnter={() => setActive(p)}>
              <span className="pindex-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="pindex-name">
                <span className="pindex-name-inner" data-text={p.name}>
                  {p.name}
                </span>
              </span>
              <span className="pindex-cat">{CAT[p.category]}</span>
              <span className="pindex-price">{brl(p.price)}</span>
              <button className={`pindex-add${qty ? ' is-in' : ''}`} onClick={() => add(p.id)} data-cursor="Adicionar" aria-label={`Adicionar ${p.name} à sacola`}>
                {qty ? `${qty} na sacola` : 'Adicionar'}
                <span aria-hidden>+</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
