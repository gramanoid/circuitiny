import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { catalog, pinColor } from '../catalog'
import { netColor } from '../project/pins'
import type { PinType } from '../project/schema'

const PIN_PITCH = 20
const BOARD_W = 180
const COMP_W = 120
const COMP_GAP = 28
const BOARD_X = 220
const BOARD_Y = 30
const COMP_X = BOARD_X + BOARD_W + 160

type PinNode = {
  ref: string
  x: number
  y: number
  side: 'left' | 'right'
  type: PinType
  label: string
}

export default function Schematic() {
  const project = useStore((s) => s.project)
  const pending = useStore((s) => s.pendingPin)
  const clickPin = useStore((s) => s.clickPin)
  const removeNet = useStore((s) => s.removeNet)
  const catalogVersion = useStore((s) => s.catalogVersion)

  const layout = useMemo(() => computeLayout(project), [project, catalogVersion])

  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 })
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  if (!layout) {
    return <div style={{ color: '#666', padding: 10 }}>No board loaded.</div>
  }

  const { pins, board, comps, viewW, viewH } = layout

  const toSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const { x: cx, y: cy } = toSvg(e.clientX, e.clientY)
    const factor = Math.exp(-e.deltaY * 0.0015)
    setView((v) => {
      const k = Math.min(8, Math.max(0.2, v.k * factor))
      const actual = k / v.k
      return { k, tx: cx - (cx - v.tx) * actual, ty: cy - (cy - v.ty) * actual }
    })
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 1 && !(e.button === 0 && (e.shiftKey || e.target === svgRef.current))) return
    const { x, y } = toSvg(e.clientX, e.clientY)
    panRef.current = { x, y, tx: view.tx, ty: view.ty }
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!panRef.current) return
    const p = panRef.current
    const { x, y } = toSvg(e.clientX, e.clientY)
    setView((v) => ({ ...v, tx: p.tx + (x - p.x), ty: p.ty + (y - p.y) }))
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    panRef.current = null
    svgRef.current?.releasePointerCapture(e.pointerId)
  }
  const resetView = () => setView({ tx: 0, ty: 0, k: 1 })

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={resetView}
      style={{ width: '100%', height: '100%', background: '#0e0e0e', display: 'block',
               cursor: panRef.current ? 'grabbing' : 'default', touchAction: 'none' }}
    >
      <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
      {/* Board body */}
      <rect x={board.x} y={board.y} width={board.w} height={board.h}
            fill="#1a2332" stroke="#4a90d9" strokeWidth={1.5} rx={4} />
      <text x={board.x + board.w / 2} y={board.y + 16} fill="#88aadd" fontSize={11}
            textAnchor="middle" fontFamily="SF Mono, monospace">{board.label}</text>

      {/* Component bodies */}
      {comps.map((c) => (
        <g key={c.instance}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h}
                fill="#2a1f1a" stroke="#d98b4a" strokeWidth={1.5} rx={4} />
          <text x={c.x + c.w / 2} y={c.y + 14} fill="#ddb088" fontSize={10}
                textAnchor="middle" fontFamily="SF Mono, monospace">{c.instance}</text>
          <text x={c.x + c.w / 2} y={c.y + 26} fill="#886655" fontSize={8}
                textAnchor="middle" fontFamily="SF Mono, monospace">{c.componentName}</text>
        </g>
      ))}

      {/* Nets */}
      {project.nets.map((net) => {
        const pts = net.endpoints
          .map((ref) => pins.get(ref))
          .filter((p): p is PinNode => !!p)
        if (pts.length < 2) return null
        const types = pts.map((p) => p.type)
        const color = netColor(types)
        const highlighted = pending && net.endpoints.includes(pending)
        return (
          <g key={net.id} style={{ cursor: 'pointer' }}
             onClick={(e) => { e.stopPropagation(); removeNet(net.id) }}>
            {pts.slice(1).map((p, i) => {
              const a = pts[i]
              const path = orthoPath(a, p)
              return (
                <path key={i} d={path} stroke={color} strokeWidth={highlighted ? 2.5 : 1.8}
                      fill="none" opacity={0.9} />
              )
            })}
          </g>
        )
      })}

      {/* Pin anchors */}
      {[...pins.values()].map((p) => {
        const stub = p.side === 'left' ? -10 : 10
        const textX = p.side === 'left' ? p.x - 16 : p.x + 16
        const anchor = p.side === 'left' ? 'end' : 'start'
        const isPending = pending === p.ref
        return (
          <g key={p.ref}>
            <line x1={p.x} y1={p.y} x2={p.x + stub} y2={p.y}
                  stroke={pinColor(p.type)} strokeWidth={1.5} />
            <circle cx={p.x + stub} cy={p.y} r={isPending ? 5 : 3.5}
                    fill={pinColor(p.type)}
                    stroke={isPending ? '#fff' : 'transparent'} strokeWidth={1.5}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); clickPin(p.ref) }} />
            <text x={textX} y={p.y + 3} fontSize={9} fill="#aaa"
                  textAnchor={anchor} fontFamily="SF Mono, monospace"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>{p.label}</text>
          </g>
        )
      })}
      </g>
    </svg>
  )
}

interface Layout {
  pins: Map<string, PinNode>
  board: { x: number; y: number; w: number; h: number; label: string }
  comps: { instance: string; componentName: string; x: number; y: number; w: number; h: number }[]
  viewW: number
  viewH: number
}

function computeLayout(project: ReturnType<typeof useStore.getState>['project']): Layout | null {
  const board = catalog.getBoard(project.board)
  if (!board) return null

  const left = board.pins.filter((p) => p.position[2] >= 0)
  const right = board.pins.filter((p) => p.position[2] < 0)
  const leftSorted = [...left].sort((a, b) => a.position[0] - b.position[0])
  const rightSorted = [...right].sort((a, b) => a.position[0] - b.position[0])

  const boardPinRows = Math.max(leftSorted.length, rightSorted.length)
  const boardH = boardPinRows * PIN_PITCH + 30

  const pins = new Map<string, PinNode>()
  leftSorted.forEach((p, i) => {
    pins.set(`board.${p.id}`, {
      ref: `board.${p.id}`, x: BOARD_X, y: BOARD_Y + 24 + i * PIN_PITCH,
      side: 'left', type: p.type, label: p.label
    })
  })
  rightSorted.forEach((p, i) => {
    pins.set(`board.${p.id}`, {
      ref: `board.${p.id}`, x: BOARD_X + BOARD_W, y: BOARD_Y + 24 + i * PIN_PITCH,
      side: 'right', type: p.type, label: p.label
    })
  })

  const comps: Layout['comps'] = []
  let cy = BOARD_Y
  for (const inst of project.components) {
    const def = catalog.getComponent(inst.componentId)
    if (!def) continue
    const h = def.pins.length * PIN_PITCH + 34
    comps.push({
      instance: inst.instance, componentName: def.name,
      x: COMP_X, y: cy, w: COMP_W, h
    })
    def.pins.forEach((p, i) => {
      pins.set(`${inst.instance}.${p.id}`, {
        ref: `${inst.instance}.${p.id}`,
        x: COMP_X,
        y: cy + 34 + i * PIN_PITCH,
        side: 'left', type: p.type, label: p.label
      })
    })
    cy += h + COMP_GAP
  }

  const viewW = COMP_X + COMP_W + 80
  const viewH = Math.max(BOARD_Y + boardH + 40, cy + 20)

  return {
    pins,
    board: { x: BOARD_X, y: BOARD_Y, w: BOARD_W, h: boardH, label: board.name },
    comps, viewW, viewH
  }
}

function orthoPath(a: { x: number; y: number; side: 'left' | 'right' },
                   b: { x: number; y: number; side: 'left' | 'right' }): string {
  const ax = a.side === 'left' ? a.x - 10 : a.x + 10
  const bx = b.side === 'left' ? b.x - 10 : b.x + 10
  const midX = (ax + bx) / 2
  return `M ${ax} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${bx} ${b.y}`
}
