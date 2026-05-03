import { describe, it, expect } from 'vitest'
import { stepBehaviors, initialGpios } from '../src/sim/evaluate'
import { makeProject, makeSeedProject } from './helpers'
import type { Project } from '../src/project/schema'

function seedWithBehaviors(): Project {
  return {
    ...makeSeedProject(),
    behaviors: [
      {
        id: 'on_boot',
        trigger: { type: 'boot' },
        actions: [{ type: 'set_output', target: 'r1.in', value: 'on' }],
      },
      {
        id: 'blink',
        trigger: { type: 'timer', period_ms: 500 },
        actions: [{ type: 'toggle', target: 'r1.in' }],
      },
      {
        id: 'on_press',
        trigger: { type: 'gpio_edge', source: 'btn1.a', edge: 'rising' },
        actions: [{ type: 'set_output', target: 'r1.in', value: 'on' }],
      },
      {
        id: 'on_release',
        trigger: { type: 'gpio_edge', source: 'btn1.a', edge: 'falling' },
        actions: [{ type: 'set_output', target: 'r1.in', value: 'off' }],
      },
    ],
  }
}

describe('initialGpios', () => {
  it('returns a map with all board pin labels set to false', () => {
    const p = makeProject()
    const gpios = initialGpios(p)
    // devkitc has a "16" label pin
    expect(gpios['16']).toBe(false)
    expect(gpios['4']).toBe(false)
  })
})

describe('boot trigger', () => {
  it('fires on the first step (prevTime=0)', () => {
    const p = seedWithBehaviors()
    const gpios = initialGpios(p)
    const { gpios: next } = stepBehaviors(p, 0, gpios, {}, 16)
    // on_boot sets r1.in (GPIO16) to on
    expect(next['16']).toBe(true)
  })

  it('does not fire on subsequent steps', () => {
    const p = seedWithBehaviors()
    const gpios = initialGpios(p)
    // first step fires boot
    const step1 = stepBehaviors(p, 0, gpios, {}, 16)
    // second step should not re-fire boot
    const step2 = stepBehaviors(p, 16, { ...step1.gpios, '16': false }, {}, 16)
    expect(step2.gpios['16']).toBe(false)
  })
})

describe('timer trigger', () => {
  it('fires when period boundary is crossed', () => {
    const p = seedWithBehaviors()
    const gpios = { ...initialGpios(p) }
    // advance past 500ms
    const { gpios: after } = stepBehaviors(p, 490, gpios, {}, 20)
    // toggle on GPIO16 (was false → true)
    expect(after['16']).toBe(true)
  })

  it('does not fire when period boundary is not crossed', () => {
    const p = seedWithBehaviors()
    const gpios = initialGpios(p)
    // 100ms → 200ms: no 500ms boundary crossed
    const { gpios: after } = stepBehaviors(p, 100, gpios, {}, 100)
    expect(after['16']).toBe(false)
  })

  it('fires once per period even with large dt', () => {
    const p = makeProject({
      ...makeSeedProject(),
      behaviors: [{
        id: 'tick',
        trigger: { type: 'timer', period_ms: 100 },
        actions: [{ type: 'toggle', target: 'r1.in' }],
      }],
    })
    const gpios = initialGpios(p)
    // 0 → 150ms crosses one 100ms boundary
    const { gpios: after } = stepBehaviors(p, 0, gpios, {}, 150)
    expect(after['16']).toBe(true)
  })
})

describe('gpio_edge trigger', () => {
  it('fires on a matching rising edge', () => {
    const p = seedWithBehaviors()
    const gpios = initialGpios(p)
    const { gpios: after } = stepBehaviors(p, 100, gpios, {}, 16, [
      { label: '4', type: 'rising' },
    ])
    expect(after['16']).toBe(true)
  })

  it('fires on a matching falling edge', () => {
    const p = seedWithBehaviors()
    const gpios = { ...initialGpios(p), '16': true }
    const { gpios: after } = stepBehaviors(p, 100, gpios, {}, 16, [
      { label: '4', type: 'falling' },
    ])
    expect(after['16']).toBe(false)
  })

  it('does not fire on the wrong edge type', () => {
    const p = seedWithBehaviors()
    const gpios = initialGpios(p)
    // send a falling edge — on_press listens for rising, should not fire
    const { gpios: after } = stepBehaviors(p, 100, gpios, {}, 16, [
      { label: '4', type: 'falling' },
    ])
    expect(after['16']).toBe(false)
  })

  it('does not fire when no edges provided', () => {
    const p = seedWithBehaviors()
    const gpios = initialGpios(p)
    const { gpios: after } = stepBehaviors(p, 100, gpios, {}, 16, [])
    expect(after['16']).toBe(false)
  })

  it('fires once per step even with multiple matching edges in the same tick', () => {
    const p = makeProject({
      ...makeSeedProject(),
      behaviors: [{
        id: 'count',
        trigger: { type: 'gpio_edge', source: 'btn1.a', edge: 'rising' },
        actions: [{ type: 'toggle', target: 'r1.in' }],
      }],
    })
    const gpios = initialGpios(p)
    // Two rising edges in one tick: firesInWindow uses .some() → fires once → toggle true
    const { gpios: after } = stepBehaviors(p, 100, gpios, {}, 16, [
      { label: '4', type: 'rising' },
      { label: '4', type: 'rising' },
    ])
    expect(after['16']).toBe(true)
  })
})

describe('actions', () => {
  it('set_output resolves through passive (led1.anode → r1 → GPIO16)', () => {
    const p = makeProject({
      ...makeSeedProject(),
      behaviors: [{
        id: 'b',
        trigger: { type: 'boot' },
        actions: [{ type: 'set_output', target: 'led1.anode', value: 'on' }],
      }],
    })
    const { gpios } = stepBehaviors(p, 0, initialGpios(p), {}, 16)
    expect(gpios['16']).toBe(true)
  })

  it('toggle flips gpio state', () => {
    const p = makeProject({
      ...makeSeedProject(),
      behaviors: [{
        id: 'b',
        trigger: { type: 'boot' },
        actions: [{ type: 'toggle', target: 'r1.in' }],
      }],
    })
    const gpios = { ...initialGpios(p), '16': true }
    const { gpios: after } = stepBehaviors(p, 0, gpios, {}, 16)
    expect(after['16']).toBe(false)
  })

  it('log action appends to logs', () => {
    const p = makeProject({
      behaviors: [{
        id: 'b',
        trigger: { type: 'boot' },
        actions: [{ type: 'log', level: 'info', message: 'hello' }],
      }],
    })
    const { logs } = stepBehaviors(p, 0, {}, {}, 16)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('hello')
  })

  it('sequence action runs nested actions in order', () => {
    const p = makeProject({
      ...makeSeedProject(),
      behaviors: [{
        id: 'b',
        trigger: { type: 'boot' },
        actions: [{
          type: 'sequence',
          actions: [
            { type: 'set_output', target: 'r1.in', value: 'on' },
            { type: 'set_output', target: 'r1.in', value: 'off' },
          ],
        }],
      }],
    })
    const { gpios } = stepBehaviors(p, 0, initialGpios(p), {}, 16)
    // Last action wins — ends up off
    expect(gpios['16']).toBe(false)
  })

  it('delay in a sequence pauses and resumes on the next tick', () => {
    const p = makeProject({
      ...makeSeedProject(),
      behaviors: [{
        id: 'b',
        trigger: { type: 'boot' },
        actions: [
          { type: 'set_output', target: 'r1.in', value: 'on' },
          { type: 'delay', ms: 200 },
          { type: 'set_output', target: 'r1.in', value: 'off' },
        ],
      }],
    })
    const gpios = initialGpios(p)
    // Boot tick: runs set_output on, hits delay → pauses. GPIO16 is ON.
    const step1 = stepBehaviors(p, 0, gpios, {}, 100)
    expect(step1.gpios['16']).toBe(true)
    expect(step1.pendingSequences).toHaveLength(1)
    // Tick at 100ms: delay not elapsed (resumeAt=200). GPIO stays ON.
    const step2 = stepBehaviors(p, 100, step1.gpios, {}, 100, [], step1.pendingSequences)
    expect(step2.gpios['16']).toBe(true)
    expect(step2.pendingSequences).toHaveLength(1)
    // Tick at 200ms: delay elapsed → resumes, runs set_output off. GPIO is OFF.
    const step3 = stepBehaviors(p, 200, step2.gpios, {}, 100, [], step2.pendingSequences)
    expect(step3.gpios['16']).toBe(false)
    expect(step3.pendingSequences).toHaveLength(0)
  })
})
