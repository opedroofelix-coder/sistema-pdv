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
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  return resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session, profile, refreshProfile } = useAuth()
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system'
  })
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (profile?.theme_preference) {
      setThemeState(profile.theme_preference)
    }
  }, [profile?.theme_preference])

  useEffect(() => {
    setResolvedTheme(applyThemeClass(theme))

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
