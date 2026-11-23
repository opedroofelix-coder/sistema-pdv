import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  PackageSearch,
  Boxes,
  ListChecks,
  ShoppingCart,
  Plug,
  Users,
  Wallet,
  Landmark,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { UserMenu } from './UserMenu'
import { Logo } from '../ui/Logo'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/lotes', label: 'Lotes', icon: PackageSearch },
  { to: '/estoque', label: 'Estoque', icon: Boxes },
  { to: '/catalogo-pendente', label: 'Catálogo', icon: ListChecks },
  { to: '/pdv', label: 'PDV', icon: ShoppingCart },
  { to: '/fechamentos', label: 'Fechamentos', icon: Wallet },
  { to: '/financeiro', label: 'Financeiro', icon: Landmark },
  { to: '/relatorios', label: 'Integrações', icon: Plug },
  { to: '/usuarios', label: 'Usuários', icon: Users },
]

// Rotas só do dono (Branch 2, item 6): Dashboard (decisão #14), Integrações
// (a antiga Relatórios -- rota mantida em /relatorios, decisão #49),
// Usuários, Fechamentos de caixa e Financeiro (decisão #72). Os demais papéis não veem o
// item no menu e são redirecionados se tentarem a URL direto (redirect por
// papel dentro de cada tela).
const DONO_ONLY_ROUTES = new Set(['/', '/relatorios', '/usuarios', '/fechamentos', '/financeiro'])

/**
 * Casca do app (tema Pétalas). No computador: menu lateral de vidro d'água
 * flutuando sobre o campo de pétalas, sempre aberto, com o item ativo num
 * chip de vidro e o ícone em rosa. No celular: barra do topo com a marca e o
 * menu do usuário, e um dock de vidro flutuante embaixo (rola de lado quando
 * os itens não cabem).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navItems = NAV_ITEMS.filter(
    (item) => !DONO_ONLY_ROUTES.has(item.to) || profile?.role === 'dono',
  )

  return (
    <div className="min-h-screen md:pl-[272px]">
      <aside className="liquid glass glass-blur fixed bottom-4 left-4 top-4 z-30 hidden w-[240px] flex-col rounded-[28px] px-3.5 py-5 md:flex">
        <div className="px-2 pb-5">
          <Logo />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Menu principal">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] transition-colors ${
                  isActive
                    ? 'glass-chip font-semibold text-ink [&_svg]:text-primary'
                    : 'font-medium text-ink-secondary hover:bg-surface hover:text-ink'
                }`
              }
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={signOut}
          className="mt-3 flex h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium text-ink-secondary transition-colors hover:bg-surface hover:text-ink"
        >
          <LogOut size={20} aria-hidden="true" />
          Sair
        </button>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="glass glass-blur sticky top-0 z-20 flex items-center justify-between rounded-none px-4 py-2.5 md:hidden">
          <Logo size={30} />
          <UserMenu compact />
        </header>

        <main className="flex-1 p-4 pb-28 md:py-6 md:pl-2 md:pr-7">{children}</main>

        <nav
          aria-label="Menu"
          className="liquid glass glass-blur fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-3 right-3 z-30 flex gap-1 overflow-x-auto rounded-[26px] p-2 md:hidden"
        >
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-w-[64px] flex-1 shrink-0 flex-col items-center gap-0.5 rounded-[18px] px-1 py-1.5 text-[11px] whitespace-nowrap transition-colors ${
                  isActive ? 'glass-chip font-semibold text-primary' : 'font-medium text-ink-soft'
                }`
              }
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
