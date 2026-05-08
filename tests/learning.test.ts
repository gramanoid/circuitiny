import { describe, expect, it } from 'vitest'
import { explainViolation } from '../src/learning/drcExplanations'
import { recommendParts } from '../src/learning/partRecommendations'
import type { Violation } from '../src/drc'

describe('beginner DRC explanations', () => {
  it('explains dangerous voltage mismatch in beginner language', () => {
    const explanation = explainViolation({
      id: 'electrical.voltage_mismatch',
      severity: 'error',
      message: '5V connected to GPIO',
      involves: ['board.vin', 'board.gpio4'],
    })

    expect(explanation.title).toContain('5V')
    expect(explanation.physicalRisk).toContain('damage')
    expect(explanation.nextAction).toContain('Remove')
  })

  it('falls back for unknown DRC rules without losing the original message', () => {
    const violation: Violation = {
      id: 'custom.rule',
      severity: 'warning',
      message: 'Custom warning',
      involves: ['x.y'],
    }
    const explanation = explainViolation(violation)
    expect(explanation.meaning).toBe('Custom warning')
    expect(explanation.nextAction.length).toBeGreaterThan(10)
  })
})

describe('part recommendations', () => {
  it('prefers local catalog parts for obvious LED goals', () => {
    const recs = recommendParts('blink a light when the device starts')
    expect(recs[0]?.source).toBe('local-catalog')
    expect(recs[0]?.catalogMatchId).toBe('led-5mm-red')
    expect(recs[0]?.requiredCompanions.some((p) => p.componentId === 'resistor-220r')).toBe(true)
  })

  it('returns reviewed draft suggestions for non-local beginner goals', () => {
    const recs = recommendParts('tell me when my plant needs water')
    expect(recs[0]?.source).toBe('draft-suggestion')
    expect(recs[0]?.id).toContain('soil')
    expect(recs[0]?.reviewRequired).toBe(true)
    expect(recs[0]?.importantPins.some((p) => p.type === 'analog_out')).toBe(true)
  })

  it('adds I2C companion guidance for display-style parts', () => {
    const recs = recommendParts('show text on a small oled screen')
    expect(recs[0]?.requiredCompanions.some((p) => p.componentId === 'resistor-4k7')).toBe(true)
  })

  it('falls back to beginner-safe starter parts for empty or unknown goals', () => {
    for (const goal of ['', '   ', 'invent a puzzling project with no known keywords']) {
      const ids = recommendParts(goal).map((rec) => rec.catalogMatchId ?? rec.id)
      expect(ids).toContain('led-5mm-red')
      expect(ids).toContain('button-6mm')
    }
  })

  it('handles regex metacharacters in unknown goals without throwing', () => {
    const ids = recommendParts('build something for $100 (budget)').map((rec) => rec.catalogMatchId ?? rec.id)
    expect(ids).toContain('led-5mm-red')
    expect(ids).toContain('button-6mm')
  })

  it('returns multiple matches for mixed beginner goals', () => {
    const ids = recommendParts('blink a button').map((rec) => rec.catalogMatchId ?? rec.id)
    expect(ids).toContain('led-5mm-red')
    expect(ids).toContain('button-6mm')
  })
})
