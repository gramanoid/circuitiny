// IR (intermediate representation) — resolved project ready for template assembly.
// Resolves nets into buses, maps component pins to board GPIOs, collects includes/cmake deps.

import type { Project } from '../project/schema'
import type { PinType } from '../project/schema'
import { catalog } from '../catalog'
import { resolvePin } from '../project/pins'
import { projectWithPhysicalNets, type PhysicalLayout } from '../physical/breadboard'

export interface IrComponent {
  instance: string
  componentId: string
  driverIncludes: string[]
  cmakeRequires: string[]
  pins: Array<{ id: string; type: PinType; boardPin: string | null; boardGpioNum: number | null }>
}

export interface IrBus {
  kind: 'i2c' | 'spi' | 'uart'
  id: string
  pins: Record<string, string | null>   // e.g. { sda: "GPIO21", scl: "GPIO22" }
  members: string[]                     // component instances on this bus
}

export interface Ir {
  target: string
  board: string
  connectivityProject: Project
  components: IrComponent[]
  buses: IrBus[]
  app: { wifi: boolean; mqtt: boolean; httpClient: boolean; httpServer: boolean; logLevel: string }
  issues: string[]                      // unresolved pins, etc. (non-fatal generator notes)
}

export function buildIr(project: Project, options: { physicalMode?: boolean; physicalLayout?: PhysicalLayout } = {}): Ir {
  // Physical-net derivation is centralized here so simulation/codegen callers
  // share the same schematic-compatible connectivity table.
  // Providing a physicalLayout means callers want physical-net connectivity unless they explicitly opt out.
  let sourceProject = project
  if (options.physicalLayout) {
    sourceProject = projectWithPhysicalNets(project, options.physicalLayout, options.physicalMode ?? true)
  }
  const issues: string[] = []
  const board = catalog.getBoard(sourceProject.board)

  // Build a quick lookup: "instance.pinId" -> board pin label (e.g. "4")
  const assignments = new Map<string, string>()
  for (const net of sourceProject.nets) {
    const boardEndpoints = net.endpoints.filter((e) => e.startsWith('board.'))
    const nonBoardEndpoints = net.endpoints.filter((e) => !e.startsWith('board.'))
    if (boardEndpoints.length === 0) continue
    const boardPinId = boardEndpoints[0].split('.')[1]
    const boardPin = board?.pins.find((p) => p.id === boardPinId)
    if (!boardPin) continue
    for (const other of nonBoardEndpoints) {
      assignments.set(other, boardPin.label)
    }
  }

  const components: IrComponent[] = sourceProject.components.map((c) => {
    const def = catalog.getComponent(c.componentId)
    return {
      instance: c.instance,
      componentId: c.componentId,
      driverIncludes: def?.driver?.includes ?? [],
      cmakeRequires: def?.driver?.cmakeRequires ?? [],
      pins: (def?.pins ?? []).map((p) => {
        const label = assignments.get(`${c.instance}.${p.id}`) ?? null
        return {
          id: p.id,
          type: p.type,
          boardPin: label,
          boardGpioNum: label && /^\d+$/.test(label) ? parseInt(label, 10) : null
        }
      })
    }
  })

  for (const c of components) {
    for (const p of c.pins) {
      if (p.type === 'ground' || p.type === 'power_in' || p.type === 'power_out') continue
      if (p.type === 'nc') continue
      if (p.boardPin === null) {
        issues.push(`${c.instance}.${p.id} not wired to any board pin`)
      }
    }
  }

  const buses = inferBuses(components)

  return {
    target: sourceProject.target,
    board: sourceProject.board,
    connectivityProject: sourceProject,
    components,
    buses,
    app: {
      wifi: sourceProject.app.wifi.enabled,
      mqtt: sourceProject.app.mqtt?.enabled ?? false,
      httpClient: sourceProject.app.http?.client ?? false,
      httpServer: sourceProject.app.http?.server ?? false,
      logLevel: sourceProject.app.log_level
    },
    issues
  }
}

function inferBuses(components: IrComponent[]): IrBus[] {
  const buses: IrBus[] = []
  const i2cSda = new Map<string, string[]>()   // gpio -> instances
  const i2cScl = new Map<string, string[]>()
  for (const c of components) {
    for (const p of c.pins) {
      if (p.boardPin === null) continue
      const key = p.boardPin
      if (p.type === 'i2c_sda') (i2cSda.get(key) ?? i2cSda.set(key, []).get(key)!).push(c.instance)
      if (p.type === 'i2c_scl') (i2cScl.get(key) ?? i2cScl.set(key, []).get(key)!).push(c.instance)
    }
  }
  // pair SDA+SCL pins by co-occurring instances
  const sdaEntries = [...i2cSda.entries()]
  const sclEntries = [...i2cScl.entries()]
  if (sdaEntries.length === 1 && sclEntries.length === 1) {
    const [sdaPin, sdaInsts] = sdaEntries[0]
    const [sclPin, sclInsts] = sclEntries[0]
    const members = Array.from(new Set([...sdaInsts, ...sclInsts]))
    buses.push({ kind: 'i2c', id: 'i2c0', pins: { sda: `GPIO${sdaPin}`, scl: `GPIO${sclPin}` }, members })
  }
  return buses
}
