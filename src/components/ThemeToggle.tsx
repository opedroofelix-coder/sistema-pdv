import { Moon, Sun, MonitorSmartphone } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { ThemePreference } from '../contexts/AuthContext'

const OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Claro' },
  { value: 'dark', icon: Moon, label: 'Escuro' },
  { value: 'system', icon: MonitorSmartphone, label: 'Automático' },
]

/** Seletor de tema no formato do SegmentedControl (decisão #71), com ícone e
 * rótulo -- vive dentro do menu do usuário. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div role="group" aria-label="Tema" className="grid grid-cols-3 gap-0.5 rounded-full bg-border p-1">
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors ${
              active
                ? 'bg-surface-raised font-bold text-primary shadow-md shadow-ink/10'
                : 'font-semibold text-ink-secondary hover:text-ink'
            }`}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
