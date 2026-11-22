import { createBrowserRouter } from 'react-router-dom'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Dashboard } from './pages/Dashboard'
import { Lots } from './pages/Lots'
import { LotDetail } from './pages/LotDetail'
import { Estoque } from './pages/Estoque'
import { CatalogoPendente } from './pages/CatalogoPendente'
import { Relatorios } from './pages/Relatorios'
import { NuvemshopVinculos } from './pages/NuvemshopVinculos'
import { Usuarios } from './pages/Usuarios'
import { Fechamentos } from './pages/Fechamentos'
import { Financeiro } from './pages/Financeiro'
import { Pdv } from './pages/Pdv'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'

function ProtectedShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  {
    path: '/',
    element: (
      <ProtectedShell>
        <Dashboard />
      </ProtectedShell>
    ),
  },
  {
    path: '/lotes',
    element: (
      <ProtectedShell>
        <Lots />
      </ProtectedShell>
    ),
  },
  {
    path: '/lotes/:id',
    element: (
      <ProtectedShell>
        <LotDetail />
      </ProtectedShell>
    ),
  },
  {
    path: '/estoque',
    element: (
      <ProtectedShell>
        <Estoque />
      </ProtectedShell>
    ),
  },
  {
    path: '/catalogo-pendente',
    element: (
      <ProtectedShell>
        <CatalogoPendente />
      </ProtectedShell>
    ),
  },
  {
    path: '/pdv',
    element: (
      <ProtectedShell>
        <Pdv />
      </ProtectedShell>
    ),
  },
  {
    path: '/relatorios',
    element: (
      <ProtectedShell>
        <Relatorios />
      </ProtectedShell>
    ),
  },
  {
    path: '/relatorios/nuvemshop',
    element: (
      <ProtectedShell>
        <NuvemshopVinculos />
      </ProtectedShell>
    ),
  },
  {
    path: '/usuarios',
    element: (
      <ProtectedShell>
        <Usuarios />
      </ProtectedShell>
    ),
  },
  {
    path: '/fechamentos',
    element: (
      <ProtectedShell>
        <Fechamentos />
      </ProtectedShell>
    ),
  },
  {
    path: '/financeiro',
    element: (
      <ProtectedShell>
        <Financeiro />
      </ProtectedShell>
    ),
  },
])
