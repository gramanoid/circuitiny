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
  ruleStrappingPin,
  ruleLedWithoutResistor,
  ruleLedResistorTooLow,
  ruleI2sDirectionMismatch,
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
      || types.includes('i2s_bclk') || types.includes('i2s_lrclk') || types.includes('i2s_dout')
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

// Suggest a safe replacement board pin id for a given net's current board endpoint.
// "Safe" = digital_io, not input-only, not strapping, not flash, not already in use by another net.
export function suggestSafePin(project: Project, netId: string): string | null {
  const board = catalog.getBoard(project.board)
  if (!board) return null
  const net = project.nets.find((n) => n.id === netId)
  if (!net) return null
  const inUse = new Set(
    project.nets.flatMap((n) => n.id === netId ? [] : n.endpoints)
      .filter((e) => e.startsWith('board.'))
      .map((e) => e.split('.')[1])
  )
  const bad = new Set<string>([
    ...board.inputOnlyPins, ...board.strappingPins, ...board.flashPins
  ])
  const candidate = board.pins.find((p) => {
    if (p.type !== 'digital_io') return false
    const gpio = 'GPIO' + p.label
    if (bad.has(gpio)) return false
    if (inUse.has(p.id)) return false
    return true
  })
  return candidate?.id ?? null
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

// ── LED safety rules ──────────────────────────────────────────────────────

// Trace from a pin ref through 2-pin passives toward the board GPIO.
// Returns the board pin id found (or null) and whether a resistor was crossed.
function traceToBoard(
  project: Project,
  pinRef: string,
  visited = new Set<string>()
): { boardPinId: string | null; seriesOhms: number } {
  if (visited.has(pinRef)) return { boardPinId: null, seriesOhms: 0 }
  visited.add(pinRef)
  const net = project.nets.find((n) => n.endpoints.includes(pinRef))
  if (!net) return { boardPinId: null, seriesOhms: 0 }
  for (const ep of net.endpoints) {
    if (ep === pinRef) continue
    if (ep.startsWith('board.')) return { boardPinId: ep.split('.')[1], seriesOhms: 0 }
    const [inst] = ep.split('.')
    const comp = project.components.find((c) => c.instance === inst)
    if (!comp) continue
    const def = catalog.getComponent(comp.componentId)
    if (!def || def.pins.length !== 2) continue
    const ohms = parseResistorOhms(comp.componentId)
    for (const p of def.pins) {
      const other = `${inst}.${p.id}`
      if (other === ep) continue
      const result = traceToBoard(project, other, visited)
      if (result.boardPinId !== null) {
        return { boardPinId: result.boardPinId, seriesOhms: ohms + result.seriesOhms }
      }
    }
  }
  return { boardPinId: null, seriesOhms: 0 }
}

// Parse resistance from catalog IDs like "resistor-220r", "resistor-4k7", "resistor-10k".
function parseResistorOhms(componentId: string): number {
  const m = componentId.match(/resistor-(\d+(?:\.\d+)?)(r|k|m)/i)
  if (!m) return 0
  const val = parseFloat(m[1])
  switch (m[2].toLowerCase()) {
    case 'r': return val
    case 'k': return val * 1000
    case 'm': return val * 1_000_000
    default: return 0
  }
}

function ruleLedWithoutResistor(project: Project): Violation[] {
  const out: Violation[] = []
  for (const c of project.components) {
    const def = catalog.getComponent(c.componentId)
    if (!def || !def.pins.some((p) => p.id === 'anode')) continue
    const { boardPinId, seriesOhms } = traceToBoard(project, `${c.instance}.anode`)
    if (boardPinId !== null && seriesOhms === 0) {
      out.push({
        id: 'electronics.led_no_resistor',
        severity: 'warning',
        message: `${c.instance} is wired directly to a GPIO with no series resistor — the LED will likely burn out at 3.3 V`,
        involves: [`${c.instance}.anode`],
        fixHint: { action: 'add_component', componentId: 'resistor-220r' }
      })
    }
  }
  return out
}

// For a 3.3 V GPIO: I = (3.3 − Vf) / R. Typical Vf 2.0 V (red/yellow) or 3.0 V (blue/white).
// Flag if calculated current exceeds 30 mA (absolute max for most LEDs).
const VCC = 3.3
const VF_TYPICAL = 2.0   // conservative Vf assumption
const MAX_CURRENT_MA = 30

// I2S: a single net cannot carry both a data-in (to MCU) and a data-out (from MCU);
// those are opposite-direction signals and must stay on separate wires.
function ruleI2sDirectionMismatch(project: Project): Violation[] {
  const out: Violation[] = []
  for (const net of project.nets) {
    const types = netTypes(project, net)
    if (types.includes('i2s_din') && types.includes('i2s_dout')) {
      out.push({
        id: 'i2s.direction_mismatch',
        severity: 'error',
        message: 'I2S data-in and data-out tied on the same net — these are opposite-direction signals',
        involves: net.endpoints
      })
    }
  }
  return out
}

function ruleLedResistorTooLow(project: Project): Violation[] {
  const out: Violation[] = []
  for (const c of project.components) {
    const def = catalog.getComponent(c.componentId)
    if (!def || !def.pins.some((p) => p.id === 'anode')) continue
    const { boardPinId, seriesOhms } = traceToBoard(project, `${c.instance}.anode`)
    if (boardPinId === null || seriesOhms === 0) continue
    const currentMa = ((VCC - VF_TYPICAL) / seriesOhms) * 1000
    if (currentMa > MAX_CURRENT_MA) {
      out.push({
        id: 'electronics.led_resistor_too_low',
        severity: 'warning',
        message: `${c.instance}: series resistance ${seriesOhms} Ω gives ~${currentMa.toFixed(0)} mA at 3.3 V — exceeds 30 mA max. Use ≥ 43 Ω (recommended 220 Ω)`,
        involves: [`${c.instance}.anode`],
        fixHint: { action: 'replace_component', componentId: 'resistor-220r' }
      })
    }
  }
  return out
}
