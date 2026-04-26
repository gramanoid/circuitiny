// SVG symbol renderer for the schematic view. Each symbol draws inside a
// box (x, y, w, h) and exposes named pin anchor points. When a component's
// symbol doesn't know about a given pin id, the caller should fall back to
// the default left-edge stack layout.

import type { SchematicSymbol } from '../project/component'

export interface SymbolBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SymbolPinAnchor {
  x: number
  y: number
  side: 'left' | 'right'
}

// Pin-id heuristics — a symbol often doesn't care about the exact id string,
// it cares about role. "anode/a/+" → positive, "cathode/k/-" → negative, etc.
const POS_IDS = /^(anode|a|plus|\+|vcc|vdd|vin|pwr|in|1)$/i
const NEG_IDS = /^(cathode|k|minus|-|gnd|ground|out|2)$/i

function pickPin(ids: string[], rx: RegExp): string | null {
  return ids.find((id) => rx.test(id)) ?? null
}

// For a symbol + box + ordered list of pin ids, return anchor points for pins
// the symbol knows how to place. Unknown pins are left out and the caller
// falls back to default layout.
export function symbolPinAnchors(
  symbol: SchematicSymbol,
  box: SymbolBox,
  pinIds: string[]
): Map<string, SymbolPinAnchor> {
  const out = new Map<string, SymbolPinAnchor>()
  const { x, y, w, h } = box
  const midY = y + h / 2

  switch (symbol) {
    case 'resistor':
    case 'capacitor':
    case 'led':
    case 'button':
    case 'speaker':
    case 'relay': {
      // Two-terminal: one pin on each horizontal side.
      const pos = pickPin(pinIds, POS_IDS) ?? pinIds[0]
      const neg = pickPin(pinIds, NEG_IDS) ?? pinIds.find((id) => id !== pos) ?? pinIds[1]
      if (pos) out.set(pos, { x,       y: midY, side: 'left' })
      if (neg) out.set(neg, { x: x + w, y: midY, side: 'right' })
      return out
    }
    case 'potentiometer': {
      // Three-terminal: two on the sides, wiper on top.
      const [a, wiper, b] = pinIds
      if (a)     out.set(a,     { x,       y: midY, side: 'left' })
      if (b)     out.set(b,     { x: x + w, y: midY, side: 'right' })
      if (wiper) out.set(wiper, { x: x + w / 2, y,   side: 'right' })
      return out
    }
    case 'microphone':
    case 'motor':
    case 'ledstrip':
    case 'sensor':
    case 'display':
    case 'ic': {
      // Multi-pin: distribute along left edge (default). Returning empty map
      // makes caller use the default stack layout, which is what we want.
      return out
    }
    case 'generic-rect':
    default:
      return out
  }
}

interface SymbolProps extends SymbolBox {
  instance: string
  componentName: string
}

// Default rectangle used as fallback and as the base shape for most symbols.
function rectBody(box: SymbolBox, fill = '#2a1f1a', stroke = '#d98b4a') {
  return (
    <rect x={box.x} y={box.y} width={box.w} height={box.h}
          fill={fill} stroke={stroke} strokeWidth={1.5} rx={4} />
  )
}

function labels(p: SymbolProps, dy1 = 14, dy2 = 26, fill1 = '#ddb088', fill2 = '#886655') {
  return (
    <>
      <text x={p.x + p.w / 2} y={p.y + dy1} fill={fill1} fontSize={10}
            textAnchor="middle" fontFamily="SF Mono, monospace">{p.instance}</text>
      <text x={p.x + p.w / 2} y={p.y + dy2} fill={fill2} fontSize={8}
            textAnchor="middle" fontFamily="SF Mono, monospace">{p.componentName}</text>
    </>
  )
}

// Reserve the top of each box for the instance + component name labels so the
// glyph never draws through the text.
const LABEL_ZONE = 32

export function SchematicSymbolGlyph(props: SymbolProps & { symbol: SchematicSymbol }) {
  const { symbol } = props
  const { x, y, w, h } = props
  const cx = x + w / 2
  // Glyph area starts below the label zone; cy is that area's vertical midpoint.
  const glyphTop = y + LABEL_ZONE
  const cy = (glyphTop + (y + h)) / 2

  switch (symbol) {
    case 'resistor': {
      // Zigzag in the middle.
      const zx = x + w * 0.25, zw = w * 0.5, zy = cy
      const steps = 6
      const dx = zw / steps
      let d = `M ${zx} ${zy}`
      for (let i = 1; i <= steps; i++) {
        const yy = zy + (i % 2 === 0 ? -6 : 6)
        d += ` L ${zx + i * dx} ${yy}`
      }
      d += ` L ${zx + zw} ${zy}`
      return (
        <>
          {rectBody(props, '#2a1f1a', '#d98b4a')}
          <path d={d} stroke="#e0c090" strokeWidth={1.8} fill="none" />
          {labels(props)}
        </>
      )
    }
    case 'capacitor': {
      const gap = 4
      return (
        <>
          {rectBody(props)}
          <line x1={cx - gap} y1={cy - 12} x2={cx - gap} y2={cy + 12} stroke="#e0c090" strokeWidth={2} />
          <line x1={cx + gap} y1={cy - 12} x2={cx + gap} y2={cy + 12} stroke="#e0c090" strokeWidth={2} />
          {labels(props)}
        </>
      )
    }
    case 'led': {
      // Triangle pointing right + cathode bar, with arrows.
      const tri = `M ${cx - 8} ${cy - 8} L ${cx + 6} ${cy} L ${cx - 8} ${cy + 8} Z`
      return (
        <>
          {rectBody(props)}
          <path d={tri} fill="#e0c090" stroke="#e0c090" strokeWidth={1.2} />
          <line x1={cx + 8} y1={cy - 8} x2={cx + 8} y2={cy + 8} stroke="#e0c090" strokeWidth={2} />
          <path d={`M ${cx + 2} ${cy - 14} l 6 -6 M ${cx + 8} ${cy - 20} l -4 0 M ${cx + 8} ${cy - 20} l 0 4`}
                stroke="#ffdd66" strokeWidth={1.2} fill="none" />
          {labels(props)}
        </>
      )
    }
    case 'button': {
      // Two short leads with a bar pushed above.
      return (
        <>
          {rectBody(props)}
          <line x1={cx - 14} y1={cy + 2} x2={cx - 4} y2={cy + 2} stroke="#e0c090" strokeWidth={1.8} />
          <line x1={cx + 4}  y1={cy + 2} x2={cx + 14} y2={cy + 2} stroke="#e0c090" strokeWidth={1.8} />
          <line x1={cx - 10} y1={cy - 8} x2={cx + 10} y2={cy - 8} stroke="#e0c090" strokeWidth={1.8} />
          <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 2} stroke="#e0c090" strokeWidth={1} />
          {labels(props)}
        </>
      )
    }
    case 'potentiometer': {
      return (
        <>
          {rectBody(props)}
          <rect x={cx - 18} y={cy - 6} width={36} height={12} fill="none" stroke="#e0c090" strokeWidth={1.8} />
          <path d={`M ${cx} ${glyphTop - 2} L ${cx - 4} ${cy - 6} M ${cx} ${glyphTop - 2} L ${cx + 4} ${cy - 6}`}
                stroke="#ffdd66" strokeWidth={1.5} fill="none" />
          {labels(props)}
        </>
      )
    }
    case 'speaker': {
      const sx = cx - 10
      return (
        <>
          {rectBody(props)}
          <rect x={sx - 4} y={cy - 6} width={6} height={12} fill="#e0c090" />
          <path d={`M ${sx + 2} ${cy - 6} L ${sx + 14} ${cy - 14} L ${sx + 14} ${cy + 14} L ${sx + 2} ${cy + 6} Z`}
                fill="#e0c090" stroke="#e0c090" strokeWidth={1} />
          {labels(props)}
        </>
      )
    }
    case 'microphone': {
      return (
        <>
          {rectBody(props)}
          <circle cx={cx} cy={cy} r={10} fill="none" stroke="#e0c090" strokeWidth={1.8} />
          <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} stroke="#e0c090" strokeWidth={1.2} />
          <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} stroke="#e0c090" strokeWidth={1.2} />
          {labels(props)}
        </>
      )
    }
    case 'relay': {
      // Coil + switch.
      return (
        <>
          {rectBody(props)}
          <rect x={cx - 18} y={cy - 6} width={14} height={12} fill="none" stroke="#e0c090" strokeWidth={1.5} />
          <line x1={cx - 4} y1={cy} x2={cx + 12} y2={cy - 8} stroke="#e0c090" strokeWidth={1.8} />
          <circle cx={cx - 4} cy={cy} r={1.8} fill="#e0c090" />
          <circle cx={cx + 14} cy={cy} r={1.8} fill="#e0c090" />
          {labels(props)}
        </>
      )
    }
    case 'motor': {
      return (
        <>
          {rectBody(props)}
          <circle cx={cx} cy={cy} r={12} fill="none" stroke="#e0c090" strokeWidth={1.8} />
          <text x={cx} y={cy + 4} fill="#e0c090" fontSize={11} textAnchor="middle"
                fontFamily="SF Mono, monospace" fontWeight="bold">M</text>
          {labels(props)}
        </>
      )
    }
    case 'ledstrip': {
      const n = 5
      const step = (w - 20) / (n - 1)
      return (
        <>
          {rectBody(props)}
          <rect x={x + 6} y={cy - 4} width={w - 12} height={8} fill="none" stroke="#e0c090" strokeWidth={1.2} />
          {Array.from({ length: n }).map((_, i) => (
            <circle key={i} cx={x + 10 + i * step} cy={cy} r={2.2} fill="#ffdd66" />
          ))}
          {labels(props)}
        </>
      )
    }
    case 'display': {
      return (
        <>
          {rectBody(props, '#1a2230', '#6aa8e0')}
          <rect x={x + 8} y={cy - 10} width={w - 16} height={20} fill="#0e1a26" stroke="#6aa8e0" strokeWidth={1} />
          <line x1={x + 12} y1={cy - 4} x2={x + w - 12} y2={cy - 4} stroke="#6aa8e0" strokeWidth={0.8} opacity={0.5} />
          <line x1={x + 12} y1={cy + 2} x2={x + w - 16} y2={cy + 2} stroke="#6aa8e0" strokeWidth={0.8} opacity={0.5} />
          {labels(props, 14, 26, '#a8c8e8', '#557799')}
        </>
      )
    }
    case 'sensor':
    case 'ic': {
      // Chip-style body with a pin-1 notch.
      return (
        <>
          {rectBody(props, '#1e1e26', '#8888aa')}
          <circle cx={x + 8} cy={glyphTop + 4} r={2.5} fill="none" stroke="#8888aa" strokeWidth={1} />
          {labels(props, 14, 26, '#aaaacc', '#666688')}
        </>
      )
    }
    case 'generic-rect':
    default:
      return (
        <>
          {rectBody(props)}
          {labels(props)}
        </>
      )
  }
}
