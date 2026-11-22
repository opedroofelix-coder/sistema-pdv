import { memo, useMemo, type ReactElement } from 'react'
import type { ArtSpec, FlowerKind, Holder } from '../data/products'

// Ilustração vetorial gerada a partir da especificação do produto.
// Mesmo id → mesmo desenho (gerador com semente). Classes usadas pelas
// animações: .fa-stem (traço que "cresce"), .fa-bloom (flor que abre),
// .fa-sway (balanço no hover).

const W = 400
const H = 500

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const BASE_R: Record<FlowerKind, number> = {
  rose: 30,
  peony: 40,
  sunflower: 38,
  tulip: 26,
  daisy: 24,
  orchid: 20,
  lavender: 0,
  succulent: 34,
}

interface Bloom {
  kind: FlowerKind
  color: string
  x: number
  y: number
  r: number
  rot: number
}

const GATHER: Record<Holder, { x: number; y: number }> = {
  wrap: { x: 200, y: 405 },
  vase: { x: 200, y: 380 },
  box: { x: 200, y: 360 },
  pot: { x: 200, y: 380 },
  basket: { x: 200, y: 370 },
}

function layout(spec: ArtSpec, rand: () => number): Bloom[] {
  const kinds: { kind: FlowerKind; colors: string[] }[] = []
  for (const f of spec.flowers) for (let i = 0; i < f.count; i++) kinds.push({ kind: f.kind, colors: f.colors })
  // mistura determinística para não agrupar por tipo
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
  }
  const n = kinds.length
  const pick = (cs: string[]) => cs[Math.floor(rand() * cs.length)]

  // orquídea: hastes em arco
  if (kinds[0]?.kind === 'orchid') {
    return kinds.map((k, i) => {
      const t = i / Math.max(1, n - 1)
      const x = 150 + t * 150
      const y = 150 + Math.pow(t - 0.25, 2) * 260 + (rand() - 0.5) * 10
      return { kind: k.kind, color: pick(k.colors), x, y, r: BASE_R.orchid * (1.15 - t * 0.35), rot: rand() * 40 - 20 }
    })
  }
  // suculentas: lado a lado na boca do vaso
  if (kinds[0]?.kind === 'succulent') {
    return kinds.map((k, i) => ({
      kind: k.kind,
      color: pick(k.colors),
      x: 200 + (i - (n - 1) / 2) * 62,
      y: 340 - (i % 2) * 18,
      r: BASE_R.succulent * (0.9 + rand() * 0.25),
      rot: rand() * 60,
    }))
  }
  // lavanda: leque de ramos (y = ponta do ramo)
  if (kinds[0]?.kind === 'lavender') {
    return kinds.map((k, i) => {
      const a = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * 1.3 + (rand() - 0.5) * 0.1
      const len = 230 + rand() * 50
      const g = GATHER[spec.holder]
      return { kind: k.kind, color: pick(k.colors), x: g.x + Math.cos(a) * len, y: g.y + Math.sin(a) * len, r: 0, rot: 0 }
    })
  }

  // cúpula de flores (filotaxia)
  const dome =
    spec.holder === 'box'
      ? { cx: 200, cy: 268, rx: 118, ry: 52 }
      : spec.holder === 'basket'
        ? { cx: 200, cy: 262, rx: 112, ry: 58 }
        : { cx: 200, cy: n === 1 ? 210 : 195, rx: 112, ry: 92 }
  const scale = n === 1 ? 1.6 : Math.max(0.72, 1.12 - n / 40)
  const pts = kinds.map((k, i) => {
    const rad = n === 1 ? 0 : Math.sqrt((i + 0.5) / n)
    const th = i * 2.399963 + rand() * 0.3
    return {
      kind: k.kind,
      color: pick(k.colors),
      x: dome.cx + rad * dome.rx * Math.cos(th),
      y: dome.cy + rad * dome.ry * Math.sin(th) * 0.95,
      r: BASE_R[k.kind] * scale * (0.9 + rand() * 0.2),
      rot: rand() * 360,
    }
  })
  return pts.sort((a, b) => a.y - b.y)
}

/* ───────────── flores ───────────── */

function Rose({ b }: { b: Bloom }) {
  const { r, color } = b
  const dark = shade(color, -0.22)
  const light = shade(color, 0.18)
  return (
    <g transform={`rotate(${b.rot})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={0} cy={-r * 0.42} rx={r * 0.55} ry={r * 0.6} fill={color} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.62} fill={dark} />
      <circle r={r * 0.5} cx={r * 0.06} fill={light} />
      <circle r={r * 0.36} cx={-r * 0.05} cy={r * 0.04} fill={color} />
      <path
        d={`M0,0 m${-r * 0.05},0 a${r * 0.08},${r * 0.08} 0 1,1 ${r * 0.16},0 a${r * 0.16},${r * 0.16} 0 1,1 ${-r * 0.3},0 a${r * 0.24},${r * 0.24} 0 1,1 ${r * 0.44},0`}
        fill="none"
        stroke={dark}
        strokeWidth={Math.max(1.2, r * 0.06)}
        strokeLinecap="round"
      />
    </g>
  )
}

function Peony({ b }: { b: Bloom }) {
  const { r, color } = b
  const rings = [
    { n: 9, d: 0.62, s: 0.5, c: shade(color, 0.12) },
    { n: 7, d: 0.4, s: 0.42, c: color },
    { n: 6, d: 0.2, s: 0.34, c: shade(color, -0.1) },
  ]
  return (
    <g transform={`rotate(${b.rot})`}>
      {rings.map((ring, ri) =>
        Array.from({ length: ring.n }, (_, i) => {
          const a = (360 / ring.n) * i + ri * 17
          return (
            <ellipse
              key={`${ri}-${i}`}
              cx={0}
              cy={-r * ring.d}
              rx={r * ring.s}
              ry={r * ring.s * 0.85}
              fill={ring.c}
              stroke={shade(color, -0.18)}
              strokeOpacity={0.35}
              strokeWidth={1}
              transform={`rotate(${a})`}
            />
          )
        }),
      )}
      <circle r={r * 0.16} fill={shade(color, -0.25)} />
    </g>
  )
}

function Sunflower({ b }: { b: Bloom }) {
  const { r, color } = b
  return (
    <g transform={`rotate(${b.rot})`}>
      {Array.from({ length: 18 }, (_, i) => (
        <ellipse
          key={i}
          cx={0}
          cy={-r * 0.66}
          rx={r * 0.17}
          ry={r * 0.42}
          fill={i % 2 ? color : shade(color, -0.08)}
          transform={`rotate(${i * 20})`}
        />
      ))}
      <circle r={r * 0.46} fill="#5a3a1e" />
      <circle r={r * 0.34} fill="#6f4a26" />
      {Array.from({ length: 10 }, (_, i) => (
        <circle
          key={i}
          r={r * 0.04}
          cx={Math.cos(i * 2.4) * r * 0.22 * Math.sqrt(i / 10)}
          cy={Math.sin(i * 2.4) * r * 0.22 * Math.sqrt(i / 10)}
          fill="#3d2612"
        />
      ))}
    </g>
  )
}

function Daisy({ b }: { b: Bloom }) {
  const { r, color } = b
  return (
    <g transform={`rotate(${b.rot})`}>
      {Array.from({ length: 14 }, (_, i) => (
        <ellipse
          key={i}
          cx={0}
          cy={-r * 0.55}
          rx={r * 0.15}
          ry={r * 0.45}
          fill={color}
          stroke="#d9d2c2"
          strokeWidth={0.8}
          transform={`rotate(${(360 / 14) * i})`}
        />
      ))}
      <circle r={r * 0.27} fill="#f2b632" />
      <circle r={r * 0.15} cx={-r * 0.04} cy={-r * 0.04} fill="#f8cf5a" />
    </g>
  )
}

function Tulip({ b }: { b: Bloom }) {
  const { r, color } = b
  const dark = shade(color, -0.2)
  return (
    <g transform={`rotate(${(b.rot % 30) - 15})`}>
      <path
        d={`M${-r * 0.62},${-r * 0.55} Q${-r * 0.78},${r * 0.7} 0,${r * 0.72} Q${r * 0.78},${r * 0.7} ${r * 0.62},${-r * 0.55} L${r * 0.3},${-r * 0.15} L0,${-r * 0.75} L${-r * 0.3},${-r * 0.15} Z`}
        fill={color}
      />
      <path d={`M0,${-r * 0.75} Q${r * 0.35},0 0,${r * 0.72} Q${-r * 0.35},0 0,${-r * 0.75} Z`} fill={dark} opacity={0.55} />
    </g>
  )
}

function Orchid({ b }: { b: Bloom }) {
  const { r, color } = b
  const dark = shade(color, -0.25)
  return (
    <g transform={`rotate(${b.rot})`}>
      {[0, 120, 240].map((a) => (
        <ellipse key={a} cx={0} cy={-r * 0.6} rx={r * 0.3} ry={r * 0.62} fill={shade(color, -0.05)} transform={`rotate(${a})`} />
      ))}
      {[60, 300].map((a) => (
        <ellipse key={a} cx={0} cy={-r * 0.55} rx={r * 0.52} ry={r * 0.55} fill={color} transform={`rotate(${a})`} />
      ))}
      <ellipse cx={0} cy={r * 0.34} rx={r * 0.24} ry={r * 0.3} fill={color === '#fbf8f1' || color === '#ffffff' || color === '#efe9dc' ? '#e8a2b4' : dark} />
      <circle r={r * 0.14} fill="#f3d35c" />
    </g>
  )
}

function Succulent({ b }: { b: Bloom }) {
  const { r, color } = b
  const layers = [
    { n: 9, len: 1, w: 0.26, c: shade(color, -0.12) },
    { n: 7, len: 0.72, w: 0.24, c: color },
    { n: 5, len: 0.45, w: 0.2, c: shade(color, 0.2) },
  ]
  return (
    <g transform={`scale(1 0.62) rotate(${b.rot})`}>
      {layers.map((l, li) =>
        Array.from({ length: l.n }, (_, i) => (
          <path
            key={`${li}-${i}`}
            d={`M0,0 Q${r * l.w},${-r * l.len * 0.5} 0,${-r * l.len} Q${-r * l.w},${-r * l.len * 0.5} 0,0Z`}
            fill={l.c}
            stroke={shade(color, -0.3)}
            strokeOpacity={0.3}
            transform={`rotate(${(360 / l.n) * i + li * 20})`}
          />
        )),
      )}
    </g>
  )
}

function Lavender({ b, g }: { b: Bloom; g: { x: number; y: number } }) {
  const dx = b.x - g.x
  const dy = b.y - g.y
  const buds: ReactElement[] = []
  for (let i = 0; i < 9; i++) {
    const t = 1 - i * 0.045
    const x = g.x + dx * t
    const y = g.y + dy * t
    const s = 1 - i * 0.04
    buds.push(<ellipse key={`l${i}`} cx={x - 4 * s} cy={y} rx={4.5 * s} ry={6.5 * s} fill={b.color} />)
    buds.push(<ellipse key={`r${i}`} cx={x + 4 * s} cy={y + 3} rx={4.5 * s} ry={6.5 * s} fill={shade(b.color, -0.15)} />)
  }
  return (
    <g className="fa-sway fa-sway-base">
      <g className="fa-bloom">{buds}</g>
    </g>
  )
}

function FlowerShape({ b }: { b: Bloom }) {
  switch (b.kind) {
    case 'rose':
      return <Rose b={b} />
    case 'peony':
      return <Peony b={b} />
    case 'sunflower':
      return <Sunflower b={b} />
    case 'daisy':
      return <Daisy b={b} />
    case 'tulip':
      return <Tulip b={b} />
    case 'orchid':
      return <Orchid b={b} />
    case 'succulent':
      return <Succulent b={b} />
    default:
      return null
  }
}

/* ───────────── recipientes ───────────── */

function HolderBack({ holder, color }: { holder: Holder; color: string }) {
  if (holder === 'wrap')
    return <path d="M62,238 L200,478 L338,238 Q200,196 62,238 Z" fill={shade(color, 0.22)} />
  if (holder === 'basket')
    return <path d="M95,330 Q200,120 305,330" fill="none" stroke={shade(color, -0.15)} strokeWidth={12} strokeLinecap="round" />
  return null
}

function HolderFront({ holder, color }: { holder: Holder; color: string }) {
  const dark = shade(color, -0.18)
  switch (holder) {
    case 'wrap':
      return (
        <g>
          <path d="M92,300 L200,480 L308,300 Q256,330 200,312 Q144,330 92,300 Z" fill={color} />
          <path d="M200,312 L200,480" stroke={dark} strokeOpacity={0.35} strokeWidth={1.5} />
          <g transform="translate(200 398)">
            <path d="M0,0 C-30,-22 -46,4 -30,14 C-20,20 -8,8 0,0 Z" fill="#c8553d" />
            <path d="M0,0 C30,-22 46,4 30,14 C20,20 8,8 0,0 Z" fill="#b4472f" />
            <path d="M-2,2 L-16,46 M2,2 L14,48" stroke="#c8553d" strokeWidth={5} strokeLinecap="round" />
            <circle r={6} fill="#a63f29" />
          </g>
        </g>
      )
    case 'vase':
      return (
        <g>
          <path d="M146,326 L254,326 Q280,404 258,478 L142,478 Q120,404 146,326 Z" fill={color} fillOpacity={0.5} stroke="#ffffff" strokeOpacity={0.8} strokeWidth={2} />
          <path d="M138,372 Q200,380 262,372" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={2} fill="none" />
          <path d="M162,340 Q154,400 164,462" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={5} fill="none" strokeLinecap="round" />
        </g>
      )
    case 'box':
      return (
        <g>
          <rect x={98} y={300} width={204} height={176} rx={10} fill={color} />
          <ellipse cx={200} cy={300} rx={102} ry={14} fill={shade(color, 0.12)} />
          <rect x={98} y={330} width={204} height={14} fill="#c8553d" />
        </g>
      )
    case 'pot':
      return (
        <g>
          <path d="M138,370 L262,370 L248,478 L152,478 Z" fill={color} />
          <rect x={128} y={352} width={144} height={26} rx={6} fill={shade(color, 0.1)} />
          <path d="M150,400 L250,400" stroke={dark} strokeOpacity={0.25} strokeWidth={2} />
        </g>
      )
    case 'basket':
      return (
        <g>
          <path d="M84,318 L316,318 L290,470 Q200,486 110,470 Z" fill={color} />
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${90 + i * 2},${340 + i * 22} L${310 - i * 2},${340 + i * 22}`} stroke={dark} strokeOpacity={0.45} strokeWidth={3} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <path key={`v${i}`} d={`M${100 + i * 25},322 L${112 + i * 22},472`} stroke={dark} strokeOpacity={0.25} strokeWidth={2} />
          ))}
          <rect x={80} y={310} width={240} height={16} rx={8} fill={shade(color, -0.08)} />
        </g>
      )
  }
}

function Leaf({ x, y, rot, size, color }: { x: number; y: number; rot: number; size: number; color: string }) {
  return (
    <path
      className="fa-bloom"
      d={`M0,0 Q${size * 0.5},${-size * 0.32} ${size},0 Q${size * 0.5},${size * 0.32} 0,0Z`}
      fill={color}
      transform={`translate(${x} ${y}) rotate(${rot})`}
    />
  )
}

interface Props {
  spec: ArtSpec
  seed: string
  className?: string
  title?: string
}

function FlowerArtImpl({ spec, seed, className, title }: Props) {
  const content = useMemo(() => {
    const rand = rng(hash(seed))
    const blooms = layout(spec, rand)
    const g = GATHER[spec.holder]
    const kind0 = spec.flowers[0]?.kind
    const showStems = spec.holder !== 'box' && kind0 !== 'succulent'
    const greens = ['#5f8a5c', '#78a072', '#4b7350', '#8fb487']

    const orchidSpike =
      kind0 === 'orchid' && blooms.length
        ? [
            <path
              key="spike"
              className="fa-stem"
              pathLength={1}
              d={`M200,372 Q150,270 ${blooms[0].x},${blooms[0].y} ${blooms
                .slice(1)
                .map((b) => `T${b.x.toFixed(1)},${b.y.toFixed(1)}`)
                .join(' ')}`}
              stroke="#5e6b44"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
            />,
          ]
        : null
    const stems = orchidSpike
      ? orchidSpike
      : showStems
      ? blooms.map((b, i) => {
          const cx = (b.x + g.x) / 2 + (b.x - g.x) * 0.15
          const cy = (b.y + g.y) / 2
          return (
            <path
              key={`s${i}`}
              className="fa-stem"
              pathLength={1}
              d={`M${g.x + (rand() - 0.5) * 14},${g.y + 40} Q${cx},${cy} ${b.x},${b.y}`}
              stroke={kind0 === 'orchid' ? '#5e6b44' : greens[i % 2]}
              strokeWidth={kind0 === 'lavender' ? 2.2 : 3.4}
              fill="none"
              strokeLinecap="round"
            />
          )
        })
      : []

    // folhagem atrás da cúpula
    const foliage: ReactElement[] = []
    if (kind0 !== 'lavender' && kind0 !== 'succulent') {
      const count = kind0 === 'orchid' ? 5 : 11
      for (let i = 0; i < count; i++) {
        if (kind0 === 'orchid') {
          const side = i % 2 ? 1 : -1
          foliage.push(
            <Leaf key={`f${i}`} x={200} y={360 - i * 4} rot={side > 0 ? -20 - i * 6 : 200 + i * 6} size={90 - i * 6} color={greens[i % greens.length]} />,
          )
          continue
        }
        const a = Math.PI + (i / (count - 1)) * Math.PI + (rand() - 0.5) * 0.3
        const base = blooms.length === 1 ? { x: 200, y: 230, rx: 60, ry: 60 } : { x: 200, y: spec.holder === 'box' ? 280 : 205, rx: 128, ry: 100 }
        const x = base.x + Math.cos(a) * base.rx * 0.95
        const y = base.y + Math.sin(a) * base.ry * 0.95
        foliage.push(<Leaf key={`f${i}`} x={x} y={y} rot={(a * 180) / Math.PI + (rand() - 0.5) * 30} size={52 + rand() * 26} color={greens[i % greens.length]} />)
      }
    }

    return { blooms, stems, foliage, g }
  }, [spec, seed])

  const { blooms, stems, foliage, g } = content

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
      {title ? <title>{title}</title> : null}
      <HolderBack holder={spec.holder} color={spec.holderColor} />
      <g>{stems}</g>
      <g>{foliage}</g>
      {spec.holder === 'pot' || spec.holder === 'box' ? <HolderFront holder={spec.holder} color={spec.holderColor} /> : null}
      <g>
        {blooms.map((b, i) =>
          b.kind === 'lavender' ? (
            <Lavender key={i} b={b} g={g} />
          ) : (
            <g key={i} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`}>
              <g className="fa-sway" style={{ ['--i' as string]: i }}>
                <g className="fa-bloom">
                  <FlowerShape b={b} />
                </g>
              </g>
            </g>
          ),
        )}
      </g>
      {spec.holder !== 'pot' && spec.holder !== 'box' ? <HolderFront holder={spec.holder} color={spec.holderColor} /> : null}
    </svg>
  )
}

export const FlowerArt = memo(FlowerArtImpl)
