// Resolve "instance.pinId" or "board.pinId" to world position + electrical type.

import type { Project } from './schema'
import type { PinDef } from './component'
import type { PinType } from './schema'
import { catalog } from '../catalog'

export interface ResolvedPin {
  ref: string
  position: [number, number, number]
  normal: [number, number, number]
  type: PinType
  ownerLabel: string
  pinLabel: string
}

export function resolvePin(project: Project, ref: string): ResolvedPin | null {
  const [owner, pinId] = ref.split('.')
  if (!owner || !pinId) return null

  if (owner === 'board') {
    const board = catalog.getBoard(project.board)
    if (!board) return null
    const p = board.pins.find((x) => x.id === pinId)
    if (!p) return null
    return packPin(ref, p, p.position, board.name, p.label)
  }

  const inst = project.components.find((c) => c.instance === owner)
  if (!inst) return null
  const def = catalog.getComponent(inst.componentId)
  if (!def) return null
  const p = def.pins.find((x) => x.id === pinId)
  if (!p) return null
  const offset = inst.position ?? [0, 0, 0]
  return packPin(
    ref, p,
    [offset[0] + p.position[0], offset[1] + p.position[1], offset[2] + p.position[2]],
    inst.instance, p.label
  )
}

function packPin(ref: string, p: PinDef, position: [number, number, number],
                 ownerLabel: string, pinLabel: string): ResolvedPin {
  return { ref, position, normal: p.normal, type: p.type, ownerLabel, pinLabel }
}

export function netColor(types: PinType[]): string {
  if (types.includes('power_in') || types.includes('power_out')) return '#ff3b30'
  if (types.includes('ground')) return '#888'
  if (types.includes('i2c_sda') || types.includes('i2c_scl')) return '#ffcc00'
  if (types.some((t) => t.startsWith('spi_'))) return '#af52de'
  if (types.includes('analog_in') || types.includes('analog_out')) return '#34c759'
  return '#5ac8fa'
}
