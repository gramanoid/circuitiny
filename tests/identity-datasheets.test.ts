import { describe, expect, it } from 'vitest'
import {
  beginnerIdentitySummary,
  classifyIdentityEvidence,
  extractDatasheetFacts,
  identifyPart,
  normalizeLicenseNote,
  trustedIdentitySummary,
  type DatasheetSource,
} from '../src/identity/datasheets'
import type { PartKnowledgeRecord } from '../src/parts/types'

function source(text: string, url = 'https://example.com/part.pdf', licenseNote = 'fixture'): DatasheetSource {
  return {
    url,
    title: 'Example datasheet',
    vendor: 'Example',
    retrievedAt: '2026-05-09T00:00:00.000Z',
    licenseNote,
    text,
  }
}

function knowledge(id: string, sourceKind: PartKnowledgeRecord['source'], reviewRequired: boolean): PartKnowledgeRecord {
  return {
    id,
    label: id,
    family: id.split('-')[0] ?? id,
    confidence: 'high',
    source: sourceKind,
    explanation: 'fixture',
    safetyNotes: [],
    importantPins: [],
    requiredCompanions: [],
    sourceLinks: ['https://example.com/fixture.pdf'],
    renderStrategy: 'primitive',
    reviewRequired,
  }
}

describe('part identity and datasheets', () => {
  it('extracts beginner-useful pin, voltage, protocol, and companion metadata', () => {
    const datasheetText = 'Pins: VCC GND SDA SCL. Supply voltage 3.3V to 5V. I2C module uses pull-up resistors.'
    const extraction = extractDatasheetFacts(source(datasheetText))

    expect(extraction.pins.map((pin) => pin.id)).toContain('sda')
    expect(extraction.voltageRange).toMatchObject({ min: 3.3, max: 5 })
    expect(extraction.protocol?.value).toBe('i2c')
    expect(extraction.companionParts).toContain('pull-up resistor')
  })

  it('marks local catalog parts as exact but still requires review for draft extraction fields', () => {
    const identity = identifyPart('led-5mm-red', [source('Pins: anode cathode. Use a series resistor for current limit.')], () => ({
      id: 'led-5mm-red',
      label: 'Red LED',
      family: 'led',
      confidence: 'high',
      source: 'local-catalog',
      catalogMatchId: 'led-5mm-red',
      explanation: 'Synthetic local catalog match for the test.',
      safetyNotes: ['Use a resistor.'],
      importantPins: [],
      requiredCompanions: [],
      sourceLinks: ['https://example.com/led.pdf'],
      renderStrategy: 'primitive',
      reviewRequired: false,
    }))

    expect(identity.state).toBe('exact')
    expect(identity.extraction.companionParts).toContain('series resistor')
    expect(identity.reviewRequired).toBe(true)
    expect(trustedIdentitySummary(identity).join(' ')).toContain('Review required')
  })

  it('detects source conflicts before trusted use', () => {
    const identity = identifyPart('mystery sensor', [
      source('Pins: VCC GND DATA. Supply voltage 3.3V.', 'https://example.com/a.pdf'),
      source('Pins: VCC GND DATA. Supply voltage 5V.', 'https://example.com/b.pdf'),
    ])

    expect(identity.state).toBe('conflict')
    expect(identity.reviewRequired).toBe(true)
    expect(identity.extraction.warnings.some((warning) => warning.includes('Voltage range conflict'))).toBe(true)
    expect(classifyIdentityEvidence(identity)).toBe('conflicting')
  })

  it('classifies exact, generic, unknown, local-only, and blocked identity evidence', () => {
    const reviewed = identifyPart('led-5mm-red', [], () => knowledge('led-5mm-red', 'local-catalog', false))
    const generic = identifyPart('led', [], () => knowledge('led-generic', 'curated-db', false))
    const unknown = identifyPart('mystery', [], () => knowledge('unknown', 'manual', true))
    const localOnly = identifyPart('module', [source('Pins: VCC GND.', 'https://example.com/module.pdf', 'local-import-only personal use')], () => knowledge('module', 'local-catalog', false))
    const blocked = identifyPart('paid module', [source('Pins: VCC GND.', 'https://example.com/paid.pdf', 'blocked paid source')], () => knowledge('paid-module', 'local-catalog', false))

    expect(reviewed.state).toBe('exact')
    expect(classifyIdentityEvidence(reviewed)).toBe('reviewed')
    expect(generic.state).toBe('generic-family')
    expect(classifyIdentityEvidence(generic)).toBe('draft')
    expect(unknown.state).toBe('unknown')
    expect(classifyIdentityEvidence(unknown)).toBe('draft')
    expect(classifyIdentityEvidence(localOnly)).toBe('local-only')
    expect(classifyIdentityEvidence(blocked)).toBe('blocked')
    expect(normalizeLicenseNote('Free for personal use only')).toBe('local-only')
    expect(normalizeLicenseNote('Paid/premium source')).toBe('blocked')
  })

  it('builds source-backed beginner summaries for pins, power, companions, and mistakes', () => {
    const identity = identifyPart('i2c display', [
      source('Pins: VCC GND SDA SCL. Supply voltage 3.3V to 5V. I2C module uses pull-up resistors. Absolute maximum ratings apply.'),
    ], () => knowledge('ssd1306-oled-i2c', 'local-catalog', false))

    const summary = beginnerIdentitySummary(identity).join(' ')
    expect(summary).toContain('Sources checked')
    expect(summary).toContain('Pins to look for')
    expect(summary).toContain('Power range found')
    expect(summary).toContain('Usually needs: pull-up resistor')
    expect(summary).toContain('Mistakes to avoid')
    expect(summary).toContain('Review required')
  })

  it('normalizes inverted voltage ranges from datasheets', () => {
    const extraction = extractDatasheetFacts(source('Supply voltage 5V to 3.3V.'))

    expect(extraction.voltageRange).toMatchObject({ min: 3.3, max: 5 })
    expect(extraction.warnings.join(' ')).toContain('Inverted voltage range')
  })

  it('extracts voltage ranges with common electronics unit formats', () => {
    expect(extractDatasheetFacts(source('Supply voltage 3.3V~5V.')).voltageRange).toMatchObject({ min: 3.3, max: 5 })
    expect(extractDatasheetFacts(source('Supply voltage 3.3V through 5V.')).voltageRange).toMatchObject({ min: 3.3, max: 5 })
    expect(extractDatasheetFacts(source('Supply voltage 5 volts DC.')).voltageRange).toMatchObject({ min: 5, max: 5 })
  })

  it('preserves duplicate normalized pin labels with stable generated ids', () => {
    const extraction = extractDatasheetFacts(source('Pins: VCC-1 VCC_1 GND SDA SCL.'))

    expect(extraction.pins.map((pin) => pin.id)).toEqual(['vcc_1', 'vcc_1_2', 'gnd', 'sda', 'scl'])
    expect(extraction.warnings.join(' ')).toContain('Duplicate pin label')
  })

  it('warns when extracted pin labels normalize to an empty id', () => {
    const extraction = extractDatasheetFacts(source('Pins: -- GND SDA.'))

    expect(extraction.pins.map((pin) => pin.id)).toEqual(['gnd', 'sda'])
    expect(extraction.warnings.join(' ')).toContain('normalized to an empty id')
  })

  it('reports pin extraction truncation as a structured warning', () => {
    const labels = Array.from({ length: 14 }, (_, index) => `P${index + 1}`).join(' ')
    const extraction = extractDatasheetFacts(source(`Pins: ${labels}.`))

    expect(extraction.pins).toHaveLength(12)
    expect(extraction.warnings.join(' ')).toContain('kept the first 12 of 14')
  })

  it('handles empty and malformed datasheet text without trusting bad values', () => {
    const empty = extractDatasheetFacts(source('   '))
    expect(empty.pins).toEqual([])
    expect(empty.voltageRange).toBeUndefined()
    expect(empty.warnings).toEqual([])

    const malformed = extractDatasheetFacts(source('Supply voltage 3V–five. VCC 3.3 to.'))
    expect(malformed.voltageRange).toMatchObject({ min: 3, max: 3 })
    expect(malformed.warnings.join(' ')).toContain('Voltage range text is malformed')

    const identity = identifyPart('mystery sensor', [source('Supply voltage 3V–five.')])
    expect(identity.reviewRequired).toBe(true)
    expect(trustedIdentitySummary(identity).join(' ')).toContain('Review required')
  })
})
