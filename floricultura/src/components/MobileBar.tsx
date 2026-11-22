import { AnimatePresence, motion } from 'motion/react'
import { useCart } from '../lib/cart'
import { brl } from '../lib/format'

/** Atalho fixo para a sacola no celular. */
export function MobileBar() {
  const { count, subtotal, open, setOpen } = useCart()
  return (
    <AnimatePresence>
      {count > 0 && !open ? (
        <motion.button
          className="mobile-bar"
          onClick={() => setOpen(true)}
          initial={{ y: 120 }}
          animate={{ y: 0 }}
          exit={{ y: 120 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        >
          <span className="mobile-bar-count">{count}</span>
          <span>Ver sacola</span>
          <strong>{brl(subtotal)}</strong>
        </motion.button>
      ) : null}
    </AnimatePresence>
  )
}
