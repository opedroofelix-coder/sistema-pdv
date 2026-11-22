import { createPortal } from 'react-dom'
import { useEffect, useRef, type ReactNode } from 'react'

interface PrintPortalProps {
  children: ReactNode
}

const PRINT_PAGE_BUFFER_MM = 4

/** Duplica o conteúdo de impressão (cupom do PDV, etiquetas do lote) como
 * filho direto de <body>, fora da árvore de #root. Em tela fica com
 * `display: none` (.print-portal, src/index.css) -- não contribui pra altura
 * do documento. Em `@media print`, vira `display: block` e é a única coisa
 * visível na página, já que `#root` inteiro some -- evita depender de
 * `visibility: hidden` em ancestrais, que ainda ocupam altura no fluxo e
 * cortava o cupom em várias folhas em branco.
 *
 * `@page { size: 80mm auto }` (src/index.css) reduziu pra 1 página, mas na
 * térmica de verdade (driver POS-80, configurado como rolo "80 x 3276mm")
 * sobrava ~10cm de papel em branco antes do corte -- o driver não recorta o
 * "auto" rente ao conteúdo. Como o driver também aceita tamanho de papel
 * customizado exato, aqui a altura real do cupom é medida em `beforeprint`
 * (quando o CSS de impressão já está ativo, `.print-portal` já virou
 * `display: block` e tem altura real) e injetada como `@page` com altura
 * fixa em mm -- isso tira do driver a decisão de "auto", que era a fonte da
 * folga. Pequena folga (`PRINT_PAGE_BUFFER_MM`) evita cortar a última linha
 * por arredondamento entre px e mm. */
export function PrintPortal({ children }: PrintPortalProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const style = document.createElement('style')
    document.head.appendChild(style)

    const updatePageSize = () => {
      const heightPx = contentRef.current?.getBoundingClientRect().height ?? 0
      if (heightPx <= 0) return
      const heightMm = (heightPx * 25.4) / 96 + PRINT_PAGE_BUFFER_MM
      style.textContent = `@page { size: 80mm ${heightMm.toFixed(1)}mm; margin: 0; }`
    }

    window.addEventListener('beforeprint', updatePageSize)
    return () => {
      window.removeEventListener('beforeprint', updatePageSize)
      style.remove()
    }
  }, [])

  return createPortal(
    <div className="print-portal" ref={contentRef}>
      {children}
    </div>,
    document.body,
  )
}
