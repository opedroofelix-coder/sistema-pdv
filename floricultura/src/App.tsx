import { useState } from 'react'
import { CartDrawer } from './components/CartDrawer'
import { Catalog } from './components/Catalog'
import { Cursor } from './components/Cursor'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Manifesto } from './components/Manifesto'
import { Marquee } from './components/Marquee'
import { MobileBar } from './components/MobileBar'
import { Occasions } from './components/Occasions'
import { Preloader } from './components/Preloader'
import { SmoothScroll, useScrollTo } from './components/SmoothScroll'
import { Steps } from './components/Steps'
import type { Category, Occasion } from './data/products'
import { CartProvider } from './lib/cart'
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from './lib/gsap'

export default function App() {
  return (
    <CartProvider>
      <SmoothScroll>
        <Page />
      </SmoothScroll>
    </CartProvider>
  )
}

function Page() {
  const [category, setCategory] = useState<Category | 'todos'>('todos')
  const [occasion, setOccasion] = useState<Occasion | null>(null)
  const [ready, setReady] = useState(() => prefersReducedMotion())
  const scrollTo = useScrollTo()

  useGSAP(() => {
    const root = document.documentElement
    // o fundo da página muda de cor conforme a seção que está no meio da tela
    const sections = gsap.utils.toArray<HTMLElement>('[data-bg]')
    const paint = (el: HTMLElement) =>
      gsap.to(root, { '--bg': el.dataset.bg, '--fg': el.dataset.fg, duration: prefersReducedMotion() ? 0 : 0.8, ease: 'power2.out', overwrite: 'auto' })
    sections.forEach((el, i) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 55%',
        end: 'bottom 55%',
        onEnter: () => paint(el),
        onEnterBack: () => paint(el),
        onLeaveBack: () => i === 0 && paint(el),
      })
    })

    if (prefersReducedMotion()) return
    // títulos grandes sobem palavra por palavra
    gsap.utils.toArray<HTMLElement>('main .display').forEach((title) => {
      const words = title.querySelectorAll('.sw-i')
      if (!words.length) {
        gsap.from(title, { yPercent: 30, autoAlpha: 0, duration: 1.2, ease: 'power4.out', scrollTrigger: { trigger: title, start: 'top 90%', once: true } })
        return
      }
      gsap.from(words, { yPercent: 115, rotate: 3, duration: 1.2, ease: 'power4.out', stagger: 0.08, scrollTrigger: { trigger: title, start: 'top 90%', once: true } })
    })
  })

  return (
    <>
      {!ready ? <Preloader onDone={() => setReady(true)} /> : null}
      <a className="skip" href="#catalogo">Pular para o catálogo</a>
      <Header />
      <main className="main">
        <Hero ready={ready} />
        <Manifesto />
        <Marquee />
        <Catalog category={category} occasion={occasion} onCategory={setCategory} onOccasion={setOccasion} />
        <Occasions
          onPick={(o) => {
            setOccasion(o)
            setCategory('todos')
            scrollTo('catalogo')
          }}
        />
        <Steps />
      </main>
      <Footer />
      <CartDrawer />
      <MobileBar />
      <Cursor />
    </>
  )
}
