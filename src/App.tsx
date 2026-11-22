import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { router } from './router'

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        {/* Acima do roteador: o toast precisa sobreviver à troca de tela
            (excluir lote volta pra /lotes com o aviso já na tela). */}
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}
