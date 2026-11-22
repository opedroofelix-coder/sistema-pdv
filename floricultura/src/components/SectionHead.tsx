import type { ReactNode } from 'react'

export function SectionHead({ eyebrow, title, action, id }: { eyebrow: string; title: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="section-title reveal-title" id={id}>
          {title}
        </h2>
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  )
}
