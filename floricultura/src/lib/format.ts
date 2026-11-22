const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 1234.5 → "R$ 1.234,50" (com espaço comum, para não quebrar no WhatsApp). */
export function brl(value: number): string {
  return brlFmt.format(value).replace(/ /g, ' ')
}

/** "2026-11-24" → "24/11/2026" */
export function dateBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

/** Máscara de telefone brasileiro enquanto digita. */
export function maskPhone(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
