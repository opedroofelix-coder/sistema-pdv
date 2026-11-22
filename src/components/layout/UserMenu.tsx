import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { ThemeToggle } from '../ThemeToggle'

const ROLE_LABEL: Record<string, string> = {
  dono: 'Dono',
  caixa: 'Caixa',
  estoquista: 'Estoquista',
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/**
 * Menu do usuário (decisão #71): círculo com as iniciais + nome e papel, no
 * canto do cabeçalho de cada tela. Abre um painel com o seletor de tema
 * (antes solto numa faixa no topo) e o Sair.
 */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = profile?.full_name ?? ''
  const role = profile?.role ? (ROLE_LABEL[profile.role] ?? profile.role) : ''

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu do usuário"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-secondary"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.14] text-[13px] font-bold text-primary">
          {initials(name)}
        </span>
        {!compact && (
          <span className="hidden flex-col text-left leading-tight sm:flex">
            <span className="text-[13px] font-bold text-ink">{name || 'Usuário'}</span>
            <span className="text-xs text-ink-soft">{role}</span>
          </span>
        )}
        <ChevronDown size={16} className="text-ink-soft" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-80 rounded-[20px] border border-border bg-surface-raised p-4 shadow-2xl glass-blur"
        >
          <div className="mb-3 flex flex-col">
            <span className="text-sm font-bold text-ink">{name || 'Usuário'}</span>
            <span className="text-xs text-ink-soft">{role}</span>
          </div>
          <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink-secondary">Tema</p>
          <ThemeToggle />
          <div className="my-3 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/[0.08]"
          >
            <LogOut size={17} aria-hidden="true" />
            Sair da conta
          </button>
        </div>
      )}
    </div>
  )
}
