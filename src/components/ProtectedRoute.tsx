import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    // DESIGN.md: "skeleton nos cards, nunca spinner de tela cheia" -- a tela
    // não pode "sumir" enquanto sessão/perfil carregam (é nesse intervalo que
    // decisões por papel, como o redirecionamento do Dashboard, precisam
    // esperar antes de decidir pra onde mandar o usuário).
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-[76px] flex-col items-center gap-1.5 glass glass-blur border-y-0 border-l-0 py-4 md:flex">
          <div className="mb-6 h-6 w-11 animate-pulse rounded bg-surface-secondary" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 w-12 animate-pulse rounded-[14px] bg-surface-secondary" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <div className="mb-6 h-8 w-48 animate-pulse rounded bg-surface-secondary" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-panel bg-surface-secondary" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
