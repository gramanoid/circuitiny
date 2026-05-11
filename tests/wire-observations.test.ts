import { describe, expect, it } from 'vitest'
import { parseWireObservations } from '../src/parsers/wireObservations'

describe('wire observation parser', () => {
  it('returns no observations for empty input', () => {
    expect(parseWireObservations('')).toEqual([])
  })

  it('parses valid wire endpoints', () => {
    expect(parseWireObservations('r1.out -> led1.anode')[0]).toMatchObject({
      kind: 'wire',
      endpoints: ['r1.out', 'led1.anode'],
      confidence: 'high',
    })
  })

  it('parses reversed polarity observations', () => {
    expect(parseWireObservations('polarity led1 reversed')[0]).toMatchObject({
      kind: 'polarity',
      componentInstance: 'led1',
      polarityReversed: true,
      confidence: 'high',
    })

    expect(parseWireObservations('polarity led1.anode wrong')[0]).toMatchObject({
      kind: 'polarity',
      componentInstance: 'led1',
      polarityReversed: true,
      confidence: 'high',
    })

    expect(parseWireObservations('polarity led1 backwards')[0]).toMatchObject({
      kind: 'polarity',
      componentInstance: 'led1',
      polarityReversed: true,
      confidence: 'high',
    })
  })

  it('explains delimiter-only and malformed lines', () => {
    expect(parseWireObservations('->')[0].notes).toContain('only delimiters')
    const malformed = parseWireObservations('r1.out')[0]
    expect(malformed.confidence).toBe('low')
    expect(malformed.notes).toContain('Expected "from -> to"')
    expect(malformed.notes).toContain('r1.out')
  })

  it('preserves original line numbers and rejects mixed delimiters', () => {
    expect(parseWireObservations('\n\nr1.out -> led1.anode')[0].id).toBe('manual-wire-3')
    expect(parseWireObservations('r1.out -> led1.anode, btn1.a')[0].notes).toContain('Mixed delimiters')
    expect(parseWireObservations('sensor,v2.out -> led1.anode')[0]).toMatchObject({
      endpoints: ['sensor,v2.out', 'led1.anode'],
      confidence: 'high',
    })
  })

  it('handles multiple arrows in one line', () => {
    const [observation] = parseWireObservations('r1.out -> led1.anode -> gnd')

    expect(observation.confidence).toBe('low')
    expect(observation.notes).toContain('Multiple arrows')
  })

  it('sanitizes and truncates malformed endpoint notes', () => {
    const longEndpoint = `bad${'x'.repeat(260)}`
    const [longObservation] = parseWireObservations(`${longEndpoint} -> led1`)

    expect(longObservation.notes).toContain('...')
    expect(longObservation.notes).not.toContain(longEndpoint)

    const [controlObservation] = parseWireObservations('bad\tpin -> led1')
    expect(controlObservation.notes).toContain('"bad pin"')
    expect(controlObservation.notes).not.toContain('\t')
  })

  it('handles whitespace variations', () => {
    expect(parseWireObservations('r1.out->led1.anode')[0]).toMatchObject({
      endpoints: ['r1.out', 'led1.anode'],
      confidence: 'high',
    })
    expect(parseWireObservations('r1.out  ->  led1.anode')[0].endpoints).toEqual(['r1.out', 'led1.anode'])
    expect(parseWireObservations('R1.OUT  ->  LED1.ANODE')[0].endpoints).toEqual(['r1.out', 'led1.anode'])
  })

  it('handles special characters in instance names', () => {
    expect(parseWireObservations('led_1.anode -> btn-2.out')[0].endpoints).toEqual(['led_1.anode', 'btn-2.out'])
  })

  it('rejects malformed endpoint references and preserves trimmed valid endpoints', () => {
    expect(parseWireObservations('.instance.pin -> led1.anode')[0]).toMatchObject({ confidence: 'low' })
    expect(parseWireObservations('instance.pin. -> led1.anode')[0]).toMatchObject({ confidence: 'low' })
    expect(parseWireObservations('instance..pin -> led1.anode')[0]).toMatchObject({ confidence: 'low' })
    expect(parseWireObservations(' instance.pin  ->  led1.anode ')[0].endpoints).toEqual(['instance.pin', 'led1.anode'])
  })
})
