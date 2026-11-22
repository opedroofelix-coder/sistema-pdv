import { useEffect, useRef } from 'react'

const COLORS = ['#ef5b4c', '#f8a5b1', '#ffd166', '#fbfaf6', '#c9bdf2', '#ff8a7a']

interface Petal {
  x: number
  y: number
  r: number
  rot: number
  vr: number
  vy: number
  phase: number
  color: string
  flip: number
}

/** Pétalas caindo em canvas; o ponteiro empurra, a rolagem dá um sopro. */
export function PetalField({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')!
    let w = 0
    let h = 0
    let raf = 0
    let visible = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mouse = { x: -9999, y: -9999 }
    let lastScroll = window.scrollY
    let gust = 0

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const count = Math.round((w < 700 ? 16 : 34) * density)
    const make = (top = false): Petal => ({
      x: Math.random() * w,
      y: top ? -20 - Math.random() * 80 : Math.random() * h,
      r: 7 + Math.random() * 11,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.03,
      vy: 0.35 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      flip: Math.random() * Math.PI * 2,
    })
    const petals = Array.from({ length: count }, () => make())

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = e.clientX - r.left
      mouse.y = e.clientY - r.top
    }
    const onLeave = () => {
      mouse.x = mouse.y = -9999
    }
    const onScroll = () => {
      const d = window.scrollY - lastScroll
      lastScroll = window.scrollY
      gust = Math.max(-8, Math.min(8, gust + d * 0.04))
    }

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (!visible) return
      ctx.clearRect(0, 0, w, h)
      gust *= 0.94
      for (const p of petals) {
        p.phase += 0.012
        p.flip += 0.03
        p.y += p.vy - gust * 0.6
        p.x += Math.sin(p.phase) * 0.6 + gust * 0.15
        p.rot += p.vr
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < 140 * 140) {
          const f = (1 - Math.sqrt(d2) / 140) * 4
          const d = Math.sqrt(d2) || 1
          p.x += (dx / d) * f
          p.y += (dy / d) * f
          p.vr += (Math.random() - 0.5) * 0.004
        }
        if (p.y > h + 30) Object.assign(p, make(true))
        if (p.y < -120) p.y = h + 20
        if (p.x < -30) p.x = w + 30
        if (p.x > w + 30) p.x = -30

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.scale(1, 0.45 + Math.abs(Math.sin(p.flip)) * 0.55)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.moveTo(0, -p.r)
        ctx.bezierCurveTo(p.r * 0.9, -p.r * 0.6, p.r * 0.7, p.r * 0.8, 0, p.r)
        ctx.bezierCurveTo(-p.r * 0.7, p.r * 0.8, -p.r * 0.9, -p.r * 0.6, 0, -p.r)
        ctx.fill()
        ctx.restore()
      }
      void t
    }
    raf = requestAnimationFrame(draw)

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(canvas)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll)
    }
  }, [density])

  return <canvas ref={ref} className="petals" aria-hidden />
}
