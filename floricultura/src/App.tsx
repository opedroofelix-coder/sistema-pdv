import { useState } from 'react'
import { Builder } from './components/Builder'
import { CartDrawer } from './components/CartDrawer'
import { Catalog } from './components/Catalog'
import { Contact } from './components/Contact'
import { Cursor } from './components/Cursor'
import { Features } from './components/Features'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { MobileBar } from './components/MobileBar'
import { Occasions } from './components/Occasions'
import { Preloader } from './components/Preloader'
import { SmoothScroll, useScrollTo } from './components/SmoothScroll'
import { WhyUs } from './components/WhyUs'
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
  const [ready, setReady] = useState(() => prefersReducedMotion())
  const scrollTo = useScrollTo()

  // títulos de seção sobem de trás de uma máscara
  useGSAP(() => {
    if (prefersReducedMotion()) return
    gsap.utils.toArray<HTMLElement>('main .section-head').forEach((head) => {
      gsap.from(head.children, {
        y: 40,
        autoAlpha: 0,
        duration: 1.1,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: { trigger: head, start: 'top 88%', once: true },
      })
    })
  })

  return (
    <>
      {!ready ? <Preloader onDone={() => setReady(true)} /> : null}
      <a className="skip" href="#catalogo">Pular para o catálogo</a>
      <Header />
      <main>
        <Hero ready={ready} />
        <Features />
        <Occasions
          onPick={(o) => {
            setOccasion(o)
            setCategory('todos')
            scrollTo('catalogo')
          }}
        />
        <Catalog category={category} occasion={occasion} onCategory={setCategory} onOccasion={setOccasion} />
        <Builder />
        <WhyUs />
        <Contact />
      </main>
      <Footer />
      <CartDrawer />
      <MobileBar />
      <Cursor />
    </>
  )
}
