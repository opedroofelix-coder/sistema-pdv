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

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navItems = NAV_ITEMS.filter(
    (item) => !DONO_ONLY_ROUTES.has(item.to) || profile?.role === 'dono',
  )

  return (
    <div className="flex min-h-screen">
      {/* Espaçador que reserva a largura do trilho colapsado (item 9): a
          sidebar de verdade é fixa e expande SOBRE o conteúdo no hover, então
          o conteúdo nunca desloca (sem reflow ao passar o mouse). */}
      <div className="hidden w-[76px] shrink-0 md:block" aria-hidden="true" />
      {/* `group` + `w-[76px] hover:w-60`: só ícones por padrão, menu completo
          (com rótulos) no hover -- ou no foco por teclado (`focus-within`).
          Trilho Safira (decisão #71): cada item é uma casa de 48px com cantos
          de 14px, centrada nos 76px do trilho (14 + 48 + 14); o ativo fica
          azul com brilho. A casa não muda de tamanho ao expandir, então o
          ícone não anda (decisão #54). */}
      <aside className="group fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col overflow-hidden glass glass-blur border-y-0 border-l-0 py-4 transition-[width] duration-200 ease-out hover:w-60 hover:shadow-2xl focus-within:w-60 focus-within:shadow-2xl md:flex">
        <div className="flex h-11 items-center">
          <span className="flex w-[76px] shrink-0 items-center justify-center">
            <Logo className="w-11" fit="width" />
          </span>
          <span className="whitespace-nowrap text-[15px] font-bold text-ink opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            Sistema PDV
          </span>
        </div>

        <div className="mx-4 mb-3 mt-3 h-px bg-border" />

        <nav className="flex flex-1 flex-col gap-1.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `mx-3.5 flex h-12 items-center overflow-hidden rounded-[14px] text-sm transition-colors ${
                  isActive
                    ? 'bg-primary font-bold text-primary-content shadow-lg shadow-primary/30'
                    : 'font-semibold text-ink-secondary hover:bg-surface-secondary hover:text-ink'
                }`
              }
            >
              <span className="flex w-12 shrink-0 items-center justify-center">
                <Icon size={20} />
              </span>
              <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="mx-4 my-3 h-px bg-border" />

        <button
          type="button"
          onClick={signOut}
          title="Sair"
          className="mx-3.5 flex h-12 items-center overflow-hidden rounded-[14px] text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-secondary hover:text-ink"
        >
          <span className="flex w-12 shrink-0 items-center justify-center">
            <LogOut size={20} />
          </span>
          <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            Sair
          </span>
        </button>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Barra do topo só no celular (decisão #71): logo + menu do usuário.
            No desktop o menu do usuário vive no cabeçalho de cada tela
            (PageHeader), e a faixa que só mostrava o nome saiu. */}
        <header className="flex items-center justify-between glass glass-blur border-x-0 border-t-0 shadow-none px-4 py-2 md:hidden">
          <Logo className="h-5" />
          <UserMenu compact />
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:px-7 md:py-6">
          {children}
        </main>

        {/* Rola de lado quando não cabe (decisão #70): o dono tem 8 itens, e em
            390px eles se sobrepunham. Cada item tem largura mínima de 72px. */}
        <nav className="fixed inset-x-0 bottom-0 flex overflow-x-auto glass glass-blur border-x-0 border-b-0 shadow-none md:hidden">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-w-[72px] flex-1 shrink-0 flex-col items-center gap-0.5 py-2 text-xs whitespace-nowrap transition-colors ${
                  isActive ? 'font-bold text-primary' : 'font-medium text-ink-soft'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`inline-flex h-8 w-12 items-center justify-center rounded-full ${
                      isActive ? 'bg-primary/[0.14]' : ''
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
