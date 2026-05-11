import { describe, expect, it } from 'vitest'
import { identityCodegenMetadata, identityDrcMetadata } from '../src/identity/integration'
import { identifyPartWithStarterSources, starterDatasheetSources } from '../src/identity/sourceAdapters'
import type { PartIdentity } from '../src/identity/datasheets'

describe('starter datasheet source adapters', () => {
  it('returns fixture-backed sources for starter catalog parts and aliases', () => {
    const ledSources = starterDatasheetSources('red LED')
    const shortLedSources = starterDatasheetSources('led')
    const displaySources = starterDatasheetSources('i2c display')

    expect(ledSources[0]).toMatchObject({
      url: 'fixture://starter/led-5mm-red',
      vendor: 'Circuitiny fixture',
      retrievedAt: '2026-05-09T00:00:00.000Z',
    })
    expect(shortLedSources[0]?.url).toBe('fixture://starter/led-5mm-red')
    expect(displaySources[0]?.text).toContain('SDA SCL')
  })

  it('keeps fixture-derived fields draft until explicitly reviewed', () => {
    const identity = identifyPartWithStarterSources('red LED')

    expect(identity.sources[0]?.url).toBe('fixture://starter/led-5mm-red')
    expect(identity.extraction.pins.map((pin) => pin.label)).toEqual(['anode', 'cathode'])
    expect(identity.extraction.companionParts).toContain('series resistor')
    expect(identity.reviewRequired).toBe(true)
  })

  it('does not fabricate datasheet sources for unknown parts', () => {
    expect(starterDatasheetSources('mystery quantum sensor')).toEqual([])
  })

  it('supports vague request to datasheet-backed review to trusted metadata use', () => {
    const draft = identifyPartWithStarterSources('blink a red LED')
    const reviewed = markReviewed(draft)

    expect(draft.reviewRequired).toBe(true)
    expect(reviewed.reviewRequired).toBe(false)
    expect(identityDrcMetadata(reviewed)).toMatchObject({
      trusted: true,
      pins: expect.arrayContaining([{ id: 'anode', label: 'anode', type: 'digital_io' }]),
    })
    expect(identityCodegenMetadata(reviewed).trusted).toBe(true)
  })
})

function markReviewed(identity: PartIdentity): PartIdentity {
  return {
    ...identity,
    reviewRequired: false,
    extraction: {
      ...identity.extraction,
      pins: identity.extraction.pins.map((pin) => ({ ...pin, state: 'reviewed' as const })),
      voltageRange: identity.extraction.voltageRange ? { ...identity.extraction.voltageRange, state: 'reviewed' as const } : undefined,
      currentMa: identity.extraction.currentMa ? { ...identity.extraction.currentMa, state: 'reviewed' as const } : undefined,
      protocol: identity.extraction.protocol ? { ...identity.extraction.protocol, state: 'reviewed' as const } : undefined,
    },
  }
}
