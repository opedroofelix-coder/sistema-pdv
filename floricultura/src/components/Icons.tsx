// Ícones de traço fino (24×24, stroke = currentColor).
import type { SVGProps } from 'react'

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
type P = SVGProps<SVGSVGElement>

export const IconArrow = (p: P) => (
  <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const IconBag = (p: P) => (
  <svg {...base} {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
)
export const IconHeart = (p: P) => (
  <svg {...base} {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
)
export const IconShield = (p: P) => (
  <svg {...base} {...p}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
)
export const IconTruck = (p: P) => (
  <svg {...base} {...p}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg>
)
export const IconCamera = (p: P) => (
  <svg {...base} {...p}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
)
export const IconGift = (p: P) => (
  <svg {...base} {...p}><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13" /><path d="M12 7c-2-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3-2-5 1Z" /></svg>
)
export const IconChat = (p: P) => (
  <svg {...base} {...p}><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 10h8M8 13h5" /></svg>
)
export const IconFlower = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="9" r="2" /><path d="M12 7c0-3 3-3 3-1s-1 3-3 3M12 7c0-3-3-3-3-1s1 3 3 3M14 9c3 0 3 3 1 3s-3-1-3-3M10 9c-3 0-3 3-1 3s3-1 3-3" /><path d="M12 11v10M12 17c-2-2-4-2-5-1M12 18c2-2 4-2 5-1" /></svg>
)
export const IconWrap = (p: P) => (
  <svg {...base} {...p}><path d="M6 4l6 17 6-17" /><path d="M6 4c2 2 10 2 12 0" /></svg>
)
export const IconRibbon = (p: P) => (
  <svg {...base} {...p}><path d="M12 11c-3-4-7-4-7-1s4 2 7 1Zm0 0c3-4 7-4 7-1s-4 2-7 1Z" /><path d="m11 12-3 8 3-2 1 2 1-8" /></svg>
)
export const IconSpark = (p: P) => (
  <svg {...base} {...p}><path d="M12 3c.8 4.5 3.5 7.2 8 8-4.5.8-7.2 3.5-8 8-.8-4.5-3.5-7.2-8-8 4.5-.8 7.2-3.5 8-8Z" /></svg>
)
export const IconCard = (p: P) => (
  <svg {...base} {...p}><path d="M3 6h18v12H3z" /><path d="m3 7 9 6 9-6" /></svg>
)
export const IconPlay = (p: P) => (
  <svg {...base} {...p}><path d="M9 7v10l8-5-8-5Z" /></svg>
)
export const IconClose = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const IconWhats = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path
      fill="currentColor"
      d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"
    />
  </svg>
)
