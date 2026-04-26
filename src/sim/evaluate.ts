// Lightweight behavior evaluator for the in-app simulator.
// Advances virtual time by dtMs, fires triggers that cross a period boundary,
// and applies actions to a GPIO state map keyed by board pin label (e.g. "2", "16").

import type { Project, Behavior, Action } from '../project/schema'
import { catalog } from '../catalog'

export interface SimStep {
  gpios: Record<string, boolean>
  logs: string[]
}

export function initialGpios(project: Project): Record<string, boolean> {
  const board = catalog.getBoard(project.board)
  if (!board) return {}
  const out: Record<string, boolean> = {}
  for (const p of board.pins) out[p.label] = false
  return out
}

// Map a target reference ("instance.pin") to its bound board pin label, or null.
// Walks through passive components (2-pin, e.g. resistors) transparently.
function targetBoardPin(
  project: Project,
  target: string,
  visited = new Set<string>()
): string | null {
  if (visited.has(target)) return null
  visited.add(target)
  const board = catalog.getBoard(project.board)
  if (!board) return null
  if (target.startsWith('board.')) {
    const pid = target.split('.')[1]
    return board.pins.find((p) => p.id === pid)?.label ?? null
  }
  const net = project.nets.find((n) => n.endpoints.includes(target))
  if (!net) return null
  for (const ep of net.endpoints) {
    if (ep === target) continue
    if (ep.startsWith('board.')) {
      const pid = ep.split('.')[1]
      return board.pins.find((p) => p.id === pid)?.label ?? null
    }
    // Cross through passive components (exactly 2 pins, e.g. resistors)
    const [inst] = ep.split('.')
    const comp = project.components.find((c) => c.instance === inst)
    if (!comp) continue
    const def = catalog.getComponent(comp.componentId)
    if (!def || def.pins.length !== 2) continue
    for (const p of def.pins) {
      const other = `${inst}.${p.id}`
      if (other !== ep) {
        const result = targetBoardPin(project, other, visited)
        if (result) return result
      }
    }
  }
  return null
}

function runActions(
  project: Project,
  actions: Action[],
  gpios: Record<string, boolean>,
  logs: string[],
  behId: string
) {
  for (const a of actions) {
    switch (a.type) {
      case 'set_output': {
        const pin = targetBoardPin(project, a.target)
        if (pin) gpios[pin] = a.value === 'on'
        break
      }
      case 'toggle': {
        const pin = targetBoardPin(project, a.target)
        if (pin) gpios[pin] = !gpios[pin]
        break
      }
      case 'log':
        logs.push(`[${behId}] ${a.level}: ${a.message}`)
        break
      case 'delay':
        // Ignored in v0 simulator — delays don't block the event loop here.
        break
      case 'sequence':
        runActions(project, a.actions, gpios, logs, behId)
        break
      default:
        // mqtt / http / read_sensor / if / call_user_fn not simulated in v0
        break
    }
  }
}

export interface GpioEdge {
  label: string
  type: 'rising' | 'falling'
}

// Advance the simulation by dtMs starting from (prevTime, prevGpios).
// "boot" triggers fire when prevTime === 0.
// externalEdges: typed edge events this tick (from UI button press/release).
export function stepBehaviors(
  project: Project,
  prevTime: number,
  prevGpios: Record<string, boolean>,
  dtMs: number,
  externalEdges: GpioEdge[] = []
): SimStep {
  const gpios = { ...prevGpios }
  const logs: string[] = []
  const newTime = prevTime + dtMs

  for (const beh of project.behaviors) {
    if (firesInWindow(beh, prevTime, newTime, project, externalEdges)) {
      runActions(project, beh.actions, gpios, logs, beh.id)
    }
  }
  return { gpios, logs }
}

function firesInWindow(
  beh: Behavior,
  prev: number,
  next: number,
  project: Project,
  edges: GpioEdge[]
): boolean {
  const t = beh.trigger
  switch (t.type) {
    case 'boot':
      return prev === 0
    case 'timer': {
      if (t.period_ms <= 0) return false
      return Math.floor(next / t.period_ms) > Math.floor(prev / t.period_ms)
    }
    case 'gpio_edge': {
      if (edges.length === 0) return false
      const boardPin = targetBoardPin(project, t.source)
      if (!boardPin) return false
      // Fire once per matching edge entry (not deduplicated — each press counts).
      return edges.some((e) => e.label === boardPin && e.type === (t.edge ?? 'rising'))
    }
    default:
      return false
  }
}
