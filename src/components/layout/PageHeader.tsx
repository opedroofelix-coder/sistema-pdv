import type { ReactNode } from 'react'
import { UserMenu } from './UserMenu'

/**
 * Cabeçalho padrão de tela (decisão #71): título à esquerda (com um
 * complemento opcional ao lado, ex.: status do caixa), ações à direita e o
 * menu do usuário no canto -- no lugar da faixa do topo que só mostrava o
 * nome. No celular o menu do usuário fica na barra do topo (AppShell).
 */
export function PageHeader({
  title,
  leading,
  meta,
  actions,
}: {
  title: ReactNode
  /** Antes do título (ex.: botão de voltar). */
  leading?: ReactNode
  /** Logo abaixo/ao lado do título (subtítulo, contador, status). */
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex items-start gap-4">
      {/* Título e ações dividem a área da esquerda: quando as ações não cabem
          na linha do título, descem pra linha de baixo (alinhadas à direita)
          -- o menu do usuário fica sempre no canto, fora dessa quebra. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <h1 className="text-[26px] font-bold tracking-tight text-ink md:text-[30px]">{title}</h1>
            {meta}
          </div>
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      <div className="hidden shrink-0 items-center md:flex">
        <span className="mx-3 h-7 w-px bg-border" aria-hidden="true" />
        <UserMenu />
      </div>
    </header>
  )
}
