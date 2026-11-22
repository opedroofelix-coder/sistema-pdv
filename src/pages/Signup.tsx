import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Logo } from '../components/ui/Logo'

export function Signup() {
  const { session, signUp } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signUp(email, password, fullName)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSuccess(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <Logo className="mb-4 h-10" />
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-ink">Criar conta</h1>
        <p className="mb-6 text-sm text-ink-soft">Sistema PDV</p>

        {success ? (
          <p className="text-sm text-ink-secondary">
            Conta criada. Verifique seu e-mail para confirmar o cadastro (no
            ambiente local, veja o Mailpit) e depois{' '}
            <Link to="/login" className="font-bold text-primary hover:underline">
              faça login
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="fullName"
              type="text"
              label="Nome completo"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? 'Criando…' : 'Criar conta'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          Já tem conta?{' '}
          <Link to="/login" className="font-bold text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </Card>
    </div>
  )
}
