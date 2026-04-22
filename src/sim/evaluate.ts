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
function targetBoardPin(project: Project, target: string): string | null {
  const board = catalog.getBoard(project.board)
  if (!board) return null
  if (target.startsWith('board.')) {
    const pid = target.split('.')[1]
    return board.pins.find((p) => p.id === pid)?.label ?? null
  }
  const net = project.nets.find((n) => n.endpoints.includes(target))
  if (!net) return null
  const boardEp = net.endpoints.find((e) => e.startsWith('board.'))
  if (!boardEp) return null
  const pid = boardEp.split('.')[1]
  return board.pins.find((p) => p.id === pid)?.label ?? null
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

// Advance the simulation by dtMs starting from (prevTime, prevGpios).
// "boot" triggers fire when prevTime === 0.
export function stepBehaviors(
  project: Project,
  prevTime: number,
  prevGpios: Record<string, boolean>,
  dtMs: number
): SimStep {
  const gpios = { ...prevGpios }
  const logs: string[] = []
  const newTime = prevTime + dtMs

  for (const beh of project.behaviors) {
    if (firesInWindow(beh, prevTime, newTime)) {
      runActions(project, beh.actions, gpios, logs, beh.id)
    }
  }
  return { gpios, logs }
}

function firesInWindow(beh: Behavior, prev: number, next: number): boolean {
  const t = beh.trigger
  switch (t.type) {
    case 'boot':
      return prev === 0
    case 'timer': {
      if (t.period_ms <= 0) return false
      // Fires when a new period boundary has been crossed in (prev, next].
      return Math.floor(next / t.period_ms) > Math.floor(prev / t.period_ms)
    }
    default:
      // gpio_edge / sensor_threshold / mqtt / http / wifi not simulated in v0
      return false
  }
}
