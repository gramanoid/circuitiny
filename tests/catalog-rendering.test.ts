import { describe, expect, it } from 'vitest'
import { catalogReviewWarnings, primitiveKindForComponent, promoteCatalogMeta, resolveCatalogRender } from '../src/catalog/rendering'
import type { ComponentDef } from '../src/project/component'

const draftSensor: ComponentDef = {
  id: 'capacitive-soil-moisture-sensor',
  name: 'Capacitive Soil Moisture Sensor',
  version: '0.1.0',
  category: 'sensor',
  model: '',
  pins: [
    { id: 'vcc', label: 'VCC', type: 'power_in', position: [-0.003, -0.004, 0], normal: [0, -1, 0] },
    { id: 'gnd', label: 'GND', type: 'ground', position: [0, -0.004, 0], normal: [0, -1, 0] },
    { id: 'ao', label: 'AO', type: 'analog_out', position: [0.003, -0.004, 0], normal: [0, -1, 0] },
  ],
  schematic: { symbol: 'sensor' },
  catalogMeta: {
    trust: 'ai-draft',
    confidence: 'low',
    renderStrategy: 'primitive',
    reviewNotes: ['Created from a beginner goal.'],
  },
}

describe('catalog rendering metadata', () => {
  // hasGlb=false means there is no GLB model available, so primitive fallbacks and review warnings should apply.
  it('uses primitive render fallback for beginner draft sensor families', () => {
    expect(primitiveKindForComponent(draftSensor)).toBe('sensor')
    const render = resolveCatalogRender(draftSensor, false)
    expect(render.strategy).toBe('primitive')
    expect(render.primitiveKind).toBe('sensor')
    expect(render.warnings).toContain('AI draft: review pins, voltage, and behavior before wiring hardware.')
    expect(render.warnings).toContain('No GLB model found: Circuitiny will use a primitive 3D fallback.')
  })

  it('warns when a draft import is missing source metadata', () => {
    expect(catalogReviewWarnings(draftSensor, false)).toContain('No source link recorded for this catalog entry.')
  })

  it('promotes draft catalog metadata to reviewed while preserving review evidence', () => {
    const promoted = promoteCatalogMeta(draftSensor.catalogMeta, /* hasGlb */ false)
    expect(promoted.trust).toBe('reviewed')
    expect(promoted.confidence).toBe('medium')
    expect(promoted.renderStrategy).toBe('primitive')
    expect(promoted.reviewNotes).toContain('Created from a beginner goal.')
    expect(promoted.reviewNotes).toContain('Reviewed in Circuitiny Catalog Editor.')
  })
})
