import { gsap, prefersReducedMotion } from './gsap'

/** Bolinha com a foto do produto voa do botão até a sacola. */
export function flyToCart(from: Element | null, img: string) {
  const target = document.querySelector('[data-cart-target]:not([hidden])') as HTMLElement | null
  if (!from || !target || prefersReducedMotion()) return
  // se o cabeçalho estiver escondido, ele volta; o destino é a posição final dele
  const header = target.closest('.header')
  const shift = header ? -header.getBoundingClientRect().top : 0
  header?.classList.remove('is-hidden')
  const a = from.getBoundingClientRect()
  const r = target.getBoundingClientRect()
  const b = { left: r.left, top: r.top + shift, width: r.width, height: r.height }
  if (b.width === 0) return
  const dot = document.createElement('div')
  dot.className = 'fly-dot'
  if (img) dot.style.backgroundImage = `url("${img}")`
  document.body.appendChild(dot)
  const sx = a.left + a.width / 2
  const sy = a.top + a.height / 2
  const ex = b.left + b.width / 2
  const ey = b.top + b.height / 2
  gsap.set(dot, { x: sx, y: sy, xPercent: -50, yPercent: -50, scale: 0.2 })
  const tl = gsap.timeline({ onComplete: () => dot.remove() })
  tl.to(dot, { scale: 1, duration: 0.25, ease: 'back.out(2)' })
    .to(dot, { x: ex, duration: 0.75, ease: 'power2.inOut' }, 0.2)
    .to(dot, { y: Math.min(sy, ey) - 120, duration: 0.35, ease: 'power2.out' }, 0.2)
    .to(dot, { y: ey, duration: 0.4, ease: 'power2.in' }, 0.55)
    .to(dot, { scale: 0.2, autoAlpha: 0, duration: 0.2 }, 0.8)
    .fromTo(target, { scale: 1 }, { scale: 1.18, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out' }, 0.88)
}
