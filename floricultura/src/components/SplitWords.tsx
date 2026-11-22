import { Fragment } from 'react'

/** Quebra o texto em palavras mascaradas (.sw > .sw-i) para revelar com GSAP. */
export function SplitWords({ text, className, italic }: { text: string; className?: string; italic?: string[] }) {
  const words = text.split(' ')
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="sw" aria-hidden>
            <span className={`sw-i${italic?.includes(w) ? ' is-italic' : ''}`}>{w}</span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  )
}
