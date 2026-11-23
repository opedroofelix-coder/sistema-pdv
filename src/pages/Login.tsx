import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Logo } from '../components/ui/Logo'

export function Login() {
  const { session, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <Logo className="mb-5" />
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-ink">Entrar</h1>
        <p className="mb-6 text-sm text-ink-soft">Sistema PDV</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="email"
            type="email"
            label="E-mail"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            id="password"
            type="password"
            label="Senha"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-soft">
          Ainda não tem conta?{' '}
          <Link to="/signup" className="font-bold text-primary hover:underline">
            Criar conta
          </Link>
        </p>
      </Card>
    </div>
  )
}
