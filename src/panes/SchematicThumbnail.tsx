// Compact read-only schematic thumbnail for template cards.
// Lays out components horizontally: [Board]---[Comp1]---[Comp2]...
// Does not pan/zoom or handle interaction.

import { useMemo } from 'react'
import { catalog } from '../catalog'
import { resolveSchematicSymbol } from '../project/component'
import { SchematicSymbolGlyph } from './schematicSymbols'
import type { Project } from '../project/schema'

const BOARD_W = 34
const BOARD_H = 60
const COMP_W = 58
const COMP_H = 54
const WIRE_LEN = 20
const PAD = 8

export default function SchematicThumbnail({ project }: { project: Project }) {
  const comps = useMemo(() => {
    return project.components
      .map((inst) => ({ inst, def: catalog.getComponent(inst.componentId) }))
      .filter((c): c is typeof c & { def: NonNullable<typeof c.def> } => !!c.def)
  }, [project])

  const n = comps.length
  const svgW = PAD + BOARD_W + WIRE_LEN + n * COMP_W + Math.max(0, n - 1) * WIRE_LEN + PAD
  const svgH = PAD + BOARD_H + PAD

  const boardX = PAD
  const boardY = PAD
  const boardCY = boardY + BOARD_H / 2

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', background: '#0a0a0a' }}
    >
      {/* Board rect */}
      <rect x={boardX} y={boardY} width={BOARD_W} height={BOARD_H}
            fill="#1a2332" stroke="#4a90d9" strokeWidth={1.2} rx={3} />
      <text x={boardX + BOARD_W / 2} y={boardY + BOARD_H / 2 + 4}
            fill="#88aadd" fontSize={7} textAnchor="middle"
            fontFamily="SF Mono, monospace">ESP32</text>

      {/* Wire from board to first component */}
      {n > 0 && (
        <line
          x1={boardX + BOARD_W} y1={boardCY}
          x2={boardX + BOARD_W + WIRE_LEN} y2={boardCY}
          stroke="#5ac8fa" strokeWidth={1.2}
        />
      )}

      {/* Components and inter-component wires */}
      {comps.map(({ inst, def }, i) => {
        const cx = PAD + BOARD_W + WIRE_LEN + i * (COMP_W + WIRE_LEN)
        const cy = boardY + (BOARD_H - COMP_H) / 2
        const symbol = resolveSchematicSymbol(def.schematic)

        return (
          <g key={inst.instance}>
            <SchematicSymbolGlyph
              symbol={symbol}
              instance={inst.instance}
              componentName={def.name}
              x={cx} y={cy} w={COMP_W} h={COMP_H}
            />
            {/* Wire to next component */}
            {i < n - 1 && (
              <line
                x1={cx + COMP_W} y1={cy + COMP_H / 2}
                x2={cx + COMP_W + WIRE_LEN} y2={cy + COMP_H / 2}
                stroke="#5ac8fa" strokeWidth={1.2}
              />
            )}
          </g>
        )
      })}

      {/* Empty state */}
      {n === 0 && (
        <text x={svgW / 2} y={svgH / 2 + 4} fill="#444" fontSize={9}
              textAnchor="middle" fontFamily="SF Mono, monospace">empty</text>
      )}
    </svg>
  )
}
