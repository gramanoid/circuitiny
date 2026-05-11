import { describe, expect, it } from 'vitest'
import {
  identityCodegenMetadata,
  identityDrcMetadata,
  identityRealityFingerprint,
  identityRenderFingerprint,
} from '../src/identity/integration'
import type { PartIdentity } from '../src/identity/datasheets'

describe('identity integration guards', () => {
  it('feeds only reviewed identity fields into trusted DRC and codegen metadata', () => {
    const identity = makeIdentity(false)

    expect(identityDrcMetadata(identity)).toMatchObject({
      trusted: true,
      voltageRange: { min: 3.3, max: 5 },
      currentMa: { max: 20 },
      pins: [{ id: 'sda', label: 'SDA', type: 'i2c_sda' }],
    })
    expect(identityCodegenMetadata(identity)).toMatchObject({
      trusted: true,
      protocol: 'i2c',
      pins: [{ id: 'sda', label: 'SDA', type: 'i2c_sda' }],
    })
  })

  it('keeps draft identity metadata out of trusted DRC/codegen paths while still describing render and Reality Check fingerprints', () => {
    const identity = makeDraftIdentity()

    expect(identityDrcMetadata(identity)).toMatchObject({ trusted: false, pins: [], warnings: [] })
    expect(identityCodegenMetadata(identity)).toMatchObject({ trusted: false, pins: [] })
    expect(identityRenderFingerprint(identity).detectedPins).toContain('SDA')
    expect(identityRealityFingerprint(identity).caution).toEqual(expect.arrayContaining([expect.stringContaining('Confirm')]))
  })

  it('keeps conflicted identity metadata out of trusted DRC and codegen paths', () => {
    const identity = { ...makeIdentity(false), state: 'conflict' as const }

    expect(identityDrcMetadata(identity).trusted).toBe(false)
    expect(identityCodegenMetadata(identity).trusted).toBe(false)
    expect(identityDrcMetadata(identity).pins).toEqual([])
    expect(identityDrcMetadata(identity).voltageRange).toBeUndefined()
    expect(identityCodegenMetadata(identity).pins).toEqual([])
    expect(identityCodegenMetadata(identity).protocol).toBeUndefined()
  })

  it('uses reviewed pins while omitting draft voltage metadata from trusted paths', () => {
    const identity = makeIdentity(false)
    const partial = {
      ...identity,
      extraction: {
        ...identity.extraction,
        voltageRange: { ...identity.extraction.voltageRange!, state: 'draft' as const },
      },
    }

    expect(identityDrcMetadata(partial)).toMatchObject({
      trusted: true,
      pins: [{ id: 'sda', label: 'SDA', type: 'i2c_sda' }],
    })
    expect(identityDrcMetadata(partial).voltageRange).toBeUndefined()
    expect(identityCodegenMetadata(partial)).toMatchObject({
      trusted: true,
      pins: [{ id: 'sda', label: 'SDA', type: 'i2c_sda' }],
    })
  })
})

function makeDraftIdentity(): PartIdentity {
  return makeIdentity(true, 'draft')
}

function makeIdentity(reviewRequired: boolean, extractionState: 'reviewed' | 'draft' = 'reviewed'): PartIdentity {
  return {
    id: 'ssd1306-oled-i2c',
    query: 'oled',
    state: 'exact',
    reviewRequired,
    confidence: 'high',
    knowledge: {
      id: 'ssd1306-oled-i2c',
      label: 'SSD1306 OLED',
      family: 'display',
      confidence: 'high',
      source: 'local-catalog',
      explanation: 'Small I2C display.',
      safetyNotes: [],
      importantPins: [],
      requiredCompanions: [],
      sourceLinks: [],
      renderStrategy: 'catalog-glb',
      reviewRequired,
    },
    sources: [],
    extraction: {
      pins: [{ id: 'sda', label: 'SDA', type: 'i2c_sda', state: extractionState }],
      voltageRange: { min: 3.3, max: 5, state: extractionState },
      currentMa: { max: 20, state: extractionState },
      protocol: { value: 'i2c', state: extractionState },
      companionParts: [],
      warnings: [],
      hasConflict: false,
    },
  }
}
