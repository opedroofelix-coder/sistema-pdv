import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth, type ThemePreference } from './AuthContext'

const STORAGE_KEY = 'theme-preference'

interface ThemeContextValue {
  theme: ThemePreference
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyThemeClass(theme: ThemePreference) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  const root = document.documentElement
  if (root.classList.contains('dark') === (resolved === 'dark')) return resolved
  const apply = () => root.classList.toggle('dark', resolved === 'dark')
  // Revelação circular a partir do centro (Animated Theme Toggler, Magic UI)
  // onde o navegador tem View Transitions; nos outros, troca direto.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> }
  }
  if (!doc.startViewTransition || reduce || !root.dataset.themeReady) {
    apply()
  } else {
    const x = window.innerWidth / 2
    const y = window.innerHeight / 2
    const r = Math.hypot(x, y)
    doc
      .startViewTransition(apply)
      .ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 550, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' },
        )
      })
      .catch(() => {})
  }
  return resolved
}

// Vidro d'água: só o Chromium aplica filtro SVG (`url()`) no backdrop-filter.
// Nos outros navegadores fica o vidro fosco (ver `.water .liquid` no CSS).
function detectWaterGlass() {
  const isChromium = 'chrome' in window || /Chrome\//.test(navigator.userAgent)
  if (isChromium && CSS.supports('backdrop-filter', 'url(#water)')) {
    document.documentElement.classList.add('water')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session, profile, refreshProfile } = useAuth()
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    // Tema claro é o padrão (tema Pétalas); escuro e automático continuam
    // disponíveis no menu do usuário.
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'light'
  })
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (profile?.theme_preference) {
      setThemeState(profile.theme_preference)
    }
  }, [profile?.theme_preference])

  useEffect(() => {
    detectWaterGlass()
  }, [])

  useEffect(() => {
    setResolvedTheme(applyThemeClass(theme))
    // A primeira aplicação (carga da página) é instantânea; só as trocas
    // feitas pelo usuário depois disso ganham a transição.
    document.documentElement.dataset.themeReady = '1'

    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => setResolvedTheme(applyThemeClass('system'))
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])

  async function setTheme(next: ThemePreference) {
    setThemeState(next)
    localStorage.setItem(STORAGE_KEY, next)

    if (session) {
      await supabase
        .from('profiles')
        .update({ theme_preference: next })
        .eq('id', session.user.id)
      await refreshProfile()
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return ctx
}
