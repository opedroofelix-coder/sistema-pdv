import { useState } from 'react'
import { CartDrawer } from './components/CartDrawer'
import { Catalog } from './components/Catalog'
import { Cursor } from './components/Cursor'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { Marquee } from './components/Marquee'
import { MobileBar } from './components/MobileBar'
import { Occasions } from './components/Occasions'
import { SmoothScroll, useScrollTo } from './components/SmoothScroll'
import type { Category, Occasion } from './data/products'
import { CartProvider } from './lib/cart'
import { gsap, useGSAP, prefersReducedMotion } from './lib/gsap'

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
  const scrollTo = useScrollTo()

  // títulos de seção (fora do hero) sobem palavra por palavra
  useGSAP(() => {
    if (prefersReducedMotion()) return
    gsap.utils.toArray<HTMLElement>('main .section-title').forEach((title) => {
      if (title.closest('.hero')) return
      const words = title.querySelectorAll('.sw-i')
      gsap.from(words.length ? words : title, {
        yPercent: words.length ? 110 : 0,
        y: words.length ? 0 : 40,
        autoAlpha: words.length ? 1 : 0,
        duration: 1.1,
        ease: 'power4.out',
        stagger: 0.07,
        scrollTrigger: { trigger: title, start: 'top 88%', once: true },
      })
    })
  })

  return (
    <>
      <a className="skip" href="#catalogo">Pular para o catálogo</a>
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Catalog category={category} occasion={occasion} onCategory={setCategory} onOccasion={setOccasion} />
        <Occasions
          onPick={(o) => {
            setOccasion(o)
            setCategory('todos')
            scrollTo('catalogo')
          }}
        />
        <HowItWorks />
      </main>
      <Footer />
      <CartDrawer />
      <MobileBar />
      <Cursor />
    </>
  )
}
