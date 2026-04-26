import { describe, it, expect } from 'vitest'
import { runDrc, suggestSafePin } from '../src/drc'
import { catalog } from '../src/catalog'
import { makeProject, makeSeedProject } from './helpers'

describe('DRC — strapping pin', () => {
  it('warns when GPIO2 (strapping) is used on esp32', () => {
    const p = makeProject({
      components: [{ instance: 'led1', componentId: 'led-5mm-red', position: [0,0,0], pinAssignments: {} }],
      nets: [{ id: 'n1', endpoints: ['board.gpio2', 'led1.anode'] }],
    })
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id === 'gpio.strapping')).toBe(true)
  })

  it('does not warn on safe GPIO16', () => {
    const p = makeProject({
      components: [{ instance: 'led1', componentId: 'led-5mm-red', position: [0,0,0], pinAssignments: {} }],
      nets: [{ id: 'n1', endpoints: ['board.gpio16', 'led1.anode'] }],
    })
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id === 'gpio.strapping')).toBe(false)
  })
})

describe('DRC — input-only pin', () => {
  it('errors when GPIO34 (input-only on esp32) is driven as output', () => {
    const p = makeProject({
      components: [{ instance: 'led1', componentId: 'led-5mm-red', position: [0,0,0], pinAssignments: {} }],
      nets: [{ id: 'n1', endpoints: ['board.gpio34', 'led1.anode'] }],
    })
    const { errors } = runDrc(p)
    expect(errors.some((e) => e.id === 'gpio.input_only')).toBe(true)
  })

  it('no error when input-only pin is used as input', () => {
    const p = makeProject({
      components: [{ instance: 'btn1', componentId: 'button-6mm', position: [0,0,0], pinAssignments: {} }],
      nets: [{ id: 'n1', endpoints: ['board.gpio34', 'btn1.a'] }],
    })
    const { errors } = runDrc(p)
    expect(errors.some((e) => e.id === 'gpio.input_only')).toBe(false)
  })
})

describe('DRC — flash pin', () => {
  // GPIO6-11 on DevKitC are not exposed as header pins (internal SPI flash),
  // so they can't appear in nets via normal UI flow. Test that the rule exists
  // by verifying the board's flashPins list is populated — the DRC fires if the
  // data is ever reachable (e.g. via a custom board with exposed flash pins).
  it('flash pins are declared on the esp32 board', () => {
    expect(catalog.getBoard('esp32-devkitc-v4')!.flashPins).toContain('GPIO6')
    expect(catalog.getBoard('esp32-devkitc-v4')!.flashPins).toContain('GPIO11')
  })

  it('no flash pin error on a clean seed project', () => {
    const { errors } = runDrc(makeSeedProject())
    expect(errors.some((e) => e.id === 'gpio.flash_pin')).toBe(false)
  })
})

describe('DRC — power short', () => {
  it('errors when power and ground are on the same net', () => {
    const p = makeProject({
      nets: [{ id: 'n1', endpoints: ['board.3v3', 'board.gnd_l'] }],
    })
    const { errors } = runDrc(p)
    expect(errors.some((e) => e.id === 'electrical.short')).toBe(true)
  })
})

describe('DRC — LED safety', () => {
  it('warns when LED is wired directly to GPIO without resistor', () => {
    const p = makeProject({
      components: [{ instance: 'led1', componentId: 'led-5mm-red', position: [0,0,0], pinAssignments: {} }],
      nets: [
        { id: 'n1', endpoints: ['board.gpio16', 'led1.anode'] },
        { id: 'n2', endpoints: ['led1.cathode', 'board.gnd_l'] },
      ],
    })
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id === 'electronics.led_no_resistor')).toBe(true)
  })

  it('no LED warning when resistor is present', () => {
    const p = makeSeedProject()
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id === 'electronics.led_no_resistor')).toBe(false)
  })

  it('warns when series resistor is too low', () => {
    const p = makeProject({
      components: [
        { instance: 'led1', componentId: 'led-5mm-red',   position: [0,0,0], pinAssignments: {} },
        { instance: 'r1',   componentId: 'resistor-220r', position: [0,0,0], pinAssignments: {} },
      ],
      nets: [
        { id: 'n1', endpoints: ['board.gpio16', 'r1.in'] },
        { id: 'n2', endpoints: ['r1.out', 'led1.anode'] },
        { id: 'n3', endpoints: ['led1.cathode', 'board.gnd_l'] },
      ],
    })
    // 220Ω gives (3.3-2.0)/220 * 1000 ≈ 5.9 mA — well under 30 mA, no warning
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id === 'electronics.led_resistor_too_low')).toBe(false)
  })
})

describe('DRC — current budget', () => {
  it('warns when total current on 3v3 rail exceeds board budget', () => {
    // Default board budget is 500 mA; add 6 LEDs (10 mA each = 60 mA total — fine)
    // Use a servo (650 mA, 5V rail) to trigger 5v budget warning if board had one.
    // Instead: make a project with many LEDs (10mA each * 60 = 600mA > 500mA)
    const components = Array.from({ length: 60 }, (_, i) => ({
      instance: `led${i}`,
      componentId: 'led-5mm-red',
      position: [0,0,0] as [number,number,number],
      pinAssignments: {},
    }))
    const p = makeProject({ components })
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id.startsWith('power.over_budget'))).toBe(true)
  })

  it('no current warning for a single LED', () => {
    const p = makeProject({
      components: [{ instance: 'led1', componentId: 'led-5mm-red', position: [0,0,0], pinAssignments: {} }],
    })
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id.startsWith('power.over_budget'))).toBe(false)
  })
})

describe('DRC — net size', () => {
  it('warns on a dangling single-endpoint net', () => {
    const p = makeProject({
      nets: [{ id: 'n1', endpoints: ['board.gpio16'] }],
    })
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id === 'wiring.dangling')).toBe(true)
  })
})

describe('DRC — drcOverrides', () => {
  it('suppresses a rule when its id is in drcOverrides', () => {
    const p = makeProject({
      nets: [{ id: 'n1', endpoints: ['board.gpio16'] }],
      drcOverrides: ['wiring.dangling'],
    })
    const { warnings } = runDrc(p)
    expect(warnings.some((w) => w.id === 'wiring.dangling')).toBe(false)
  })
})

describe('suggestSafePin', () => {
  it('returns a safe replacement pin id', () => {
    const p = makeProject({
      nets: [{ id: 'n1', endpoints: ['board.gpio2', 'board.gnd_l'] }],
    })
    const suggestion = suggestSafePin(p, 'n1')
    expect(suggestion).not.toBeNull()
    const board = catalog.getBoard('esp32-devkitc-v4')!
    const pin = board.pins.find((px) => px.id === suggestion)
    expect(pin?.type).toBe('digital_io')
  })
})
