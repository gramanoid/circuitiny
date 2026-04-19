// Design Rule Check engine. Runs all rules over a project; returns violations.
// Rule severity: 'error' blocks flash; 'warning' is informational.

import type { Project, Net, PinType } from '../project/schema'
import { resolvePin } from '../project/pins'
import { catalog } from '../catalog'

export type Severity = 'error' | 'warning'

export interface Violation {
  id: string                 // rule id, e.g. "esp32.gpio.input_only"
  severity: Severity
  message: string
  involves: string[]         // pin refs / net ids
  fixHint?: { action: string; [k: string]: unknown }
}

type Rule = (project: Project) => Violation[]

const rules: Rule[] = [
  ruleInputOnlyOutput,
  ruleFlashPinUsed,
  ruleVoltageMismatch,
  rulePowerToGroundShort,
  ruleNetSize,
  ruleStrappingPin
]

export function runDrc(project: Project): { errors: Violation[]; warnings: Violation[] } {
  const out = rules.flatMap((r) => r(project))
    .filter((v) => !project.drcOverrides?.includes(v.id))
  return {
    errors: out.filter((v) => v.severity === 'error'),
    warnings: out.filter((v) => v.severity === 'warning')
  }
}

// Helper: which board pin label is this pin ref attached to (via a net)?
function netBoardPin(net: Net): string | null {
  const ep = net.endpoints.find((e) => e.startsWith('board.'))
  return ep ? ep.split('.')[1] : null
}

function netTypes(project: Project, net: Net): PinType[] {
  return net.endpoints.map((e) => resolvePin(project, e)?.type).filter((t): t is PinType => !!t)
}

// ---------------- rules ----------------

function ruleInputOnlyOutput(project: Project): Violation[] {
  const board = catalog.getBoard(project.board)
  if (!board) return []
  const out: Violation[] = []
  for (const net of project.nets) {
    const bp = netBoardPin(net)
    if (!bp) continue
    const types = netTypes(project, net)
    const drives = types.includes('digital_out') || types.includes('analog_out') || types.includes('pwm')
    const boardPinLabel = board.pins.find((p) => p.id === bp)?.label
    const isInputOnly = boardPinLabel && board.inputOnlyPins.includes('GPIO' + boardPinLabel)
    if (drives && isInputOnly) {
      out.push({
        id: 'esp32.gpio.input_only',
        severity: 'error',
        message: `GPIO${boardPinLabel} is input-only on ${board.name} but is driven as output`,
        involves: net.endpoints,
        fixHint: { action: 'reassign_pin', from: bp }
      })
    }
  }
  return out
}

function ruleFlashPinUsed(project: Project): Violation[] {
  const board = catalog.getBoard(project.board)
  if (!board) return []
  const out: Violation[] = []
  for (const net of project.nets) {
    const bp = netBoardPin(net)
    if (!bp) continue
    const label = board.pins.find((p) => p.id === bp)?.label
    if (label && board.flashPins.includes('GPIO' + label)) {
      out.push({
        id: 'esp32.gpio.flash_pin',
        severity: 'error',
        message: `GPIO${label} is reserved for SPI flash — using it externally will brick the board`,
        involves: net.endpoints
      })
    }
  }
  return out
}

function ruleVoltageMismatch(project: Project): Violation[] {
  const out: Violation[] = []
  for (const net of project.nets) {
    const resolved = net.endpoints.map((e) => resolvePin(project, e)).filter((r): r is NonNullable<typeof r> => !!r)
    // crude: if any 5V power source on a net containing a 3.3V-only pin
    const hasFiveV = resolved.some((r) => r.ref === 'board.vin')
    const hasThreeThreeOnly = resolved.some((r) => r.ref.includes('.gpio') || r.type === 'digital_io' || r.type === 'analog_in')
    if (hasFiveV && hasThreeThreeOnly) {
      out.push({
        id: 'electrical.voltage_mismatch',
        severity: 'error',
        message: 'VIN (5V) connected to a 3.3V-only signal pin',
        involves: net.endpoints
      })
    }
  }
  return out
}

function rulePowerToGroundShort(project: Project): Violation[] {
  const out: Violation[] = []
  for (const net of project.nets) {
    const types = netTypes(project, net)
    const hasPower = types.includes('power_in') || types.includes('power_out')
    const hasGnd = types.includes('ground')
    if (hasPower && hasGnd) {
      out.push({
        id: 'electrical.short',
        severity: 'error',
        message: 'Net shorts power directly to ground',
        involves: net.endpoints
      })
    }
  }
  return out
}

function ruleNetSize(project: Project): Violation[] {
  const out: Violation[] = []
  for (const net of project.nets) {
    if (net.endpoints.length < 2) {
      out.push({
        id: 'wiring.dangling',
        severity: 'warning',
        message: `Net ${net.id} has only one endpoint`,
        involves: net.endpoints
      })
    }
  }
  return out
}

function ruleStrappingPin(project: Project): Violation[] {
  const board = catalog.getBoard(project.board)
  if (!board) return []
  const out: Violation[] = []
  for (const net of project.nets) {
    const bp = netBoardPin(net)
    if (!bp) continue
    const label = board.pins.find((p) => p.id === bp)?.label
    if (label && board.strappingPins.includes('GPIO' + label)) {
      out.push({
        id: 'esp32.gpio.strapping',
        severity: 'warning',
        message: `GPIO${label} is a boot strapping pin — driving it at boot can prevent the chip from starting`,
        involves: net.endpoints
      })
    }
  }
  return out
}
