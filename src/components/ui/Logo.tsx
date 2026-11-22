import logoColor from '../../assets/logo-cor.png'
import logoWhite from '../../assets/logo-branco.png'

/**
 * Logo do Sistema PDV. O arquivo original é branco com fundo transparente --
 * some no tema claro, por isso troca pra uma variante escura (gerada por
 * `npm run generate:icons`) nesse tema. A troca é só CSS
 * (`dark:`), sem JS: as duas imagens ficam no DOM e o navegador decide qual
 * mostrar, então não há flash trocando de tema.
 */
export function Logo({
  className = 'h-7',
  fit = 'height',
}: {
  className?: string
  /**
   * Qual dimensão o `className` define. A logo é bem larga (proporção ~2,9:1),
   * então presa pela altura ela estoura o espaço em lugares estreitos -- é o
   * que cortava a marca no trilho do menu fechado (64px). `fit="width"` inverte:
   * o `className` manda na largura e a altura acompanha (decisão #54).
   */
  fit?: 'height' | 'width'
}) {
  const imgClass = fit === 'width' ? 'block h-auto w-full' : 'block h-full w-auto'
  return (
    <span className={`inline-flex items-center ${className}`}>
      <img src={logoColor} alt="Sistema PDV" className={`${imgClass} dark:hidden`} />
      <img src={logoWhite} alt="Sistema PDV" className={`${imgClass} hidden dark:block`} />
    </span>
  )
}
