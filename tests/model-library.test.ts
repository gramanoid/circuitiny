import { describe, expect, it } from 'vitest'
import {
  componentFromModelAsset,
  conversionStatusFor,
  getModelSource,
  modelAssetById,
  MODEL_SOURCE_STATS,
  searchModelAssets,
  STARTER_MODEL_ASSETS,
} from '../src/modelLibrary'

describe('free/open model library source inventory', () => {
  it('classifies primary open sources as bundled-ok', () => {
    expect(getModelSource('kicad-packages3d')?.licenseUse).toBe('bundled-ok')
    expect(getModelSource('antmicro-hardware-components')?.licenseUse).toBe('bundled-ok')
    expect(getModelSource('sparkfun-kicad-libraries')?.licenseUse).toBe('bundled-ok')
  })

  it('classifies free-but-restricted sources as local-import-only', () => {
    expect(getModelSource('snapmagic')?.licenseUse).toBe('local-import-only')
    expect(getModelSource('ultra-librarian')?.licenseUse).toBe('local-import-only')
    expect(getModelSource('sketchfab-cc')?.licenseUse).toBe('local-import-only')
  })

  it('keeps verified source inventory counts visible to the app', () => {
    expect(MODEL_SOURCE_STATS.find((stat) => stat.sourceId === 'kicad-packages3d')?.knownAssetCount).toBeGreaterThan(10_000)
    expect(MODEL_SOURCE_STATS.find((stat) => stat.sourceId === 'antmicro-hardware-components')?.knownAssetCount).toBeGreaterThan(700)
    expect(MODEL_SOURCE_STATS.find((stat) => stat.sourceId === 'sparkfun-kicad-libraries')?.knownAssetCount).toBeGreaterThan(300)
  })

  it('searches beginner terms across the starter model manifest', () => {
    const led = searchModelAssets('5mm led')
    expect(led.candidates[0].keywords).toContain('led')
    expect(led.candidates.some((candidate) => candidate.label.toLowerCase().includes('led'))).toBe(true)

    const oled = searchModelAssets('oled display')
    expect(oled.candidates.some((candidate) => candidate.componentId.includes('oled'))).toBe(true)
  })

  it('excludes paid or blocked assets from default search', () => {
    const result = searchModelAssets('paid premium subscription marketplace')
    expect(result.candidates.some((candidate) => candidate.licenseUse === 'blocked')).toBe(false)

    const explicit = searchModelAssets('paid premium subscription marketplace', { licenseUse: ['blocked'] })
    expect(explicit.candidates[0].licenseUse).toBe('blocked')
  })

  it('can restrict results to native glTF/GLB assets', () => {
    const result = searchModelAssets('switch connector usb', { formats: ['gltf', 'glb'] })
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.candidates.every((candidate) => candidate.format === 'gltf' || candidate.format === 'glb')).toBe(true)
  })

  it('distinguishes native installs from CAD assets that need conversion', () => {
    expect(conversionStatusFor(modelAssetById('antmicro-slide-switch-eg1218')!)).toBe('not-needed')
    expect(conversionStatusFor(modelAssetById('kicad-tactile-button-6mm')!)).toBe('needed')
  })

  it('turns a model candidate into draft catalog metadata', () => {
    const candidate = modelAssetById('antmicro-slide-switch-eg1218')!
    const component = componentFromModelAsset(candidate)
    expect(component.id).toBe('model-slide-switch-eg1218-antmicro')
    expect(component.model).toBe('model-slide-switch-eg1218-antmicro.gltf')
    expect(component.catalogMeta?.renderStrategy).toBe('draft-glb')
    expect(component.catalogMeta?.modelAsset?.licenseUse).toBe('bundled-ok')
    expect(component.catalogMeta?.modelAsset?.format).toBe('gltf')
    expect(component.scale).toBe(0.001)
  })

  it('ships a starter manifest broad enough for common beginner families', () => {
    const families = new Set(STARTER_MODEL_ASSETS.map((candidate) => candidate.family))
    for (const family of ['indicator', 'resistor', 'capacitor', 'input', 'display', 'sensor', 'connector', 'power']) {
      expect(families.has(family), `missing family ${family}`).toBe(true)
    }
  })
})
