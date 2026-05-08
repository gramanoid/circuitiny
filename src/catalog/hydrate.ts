// Loads user-added components from ~/.circuitiny/catalog/ into the in-memory catalog.

import { catalog } from './index'
import type { CatalogMeta, ComponentDef, SchematicSymbolSpec, SchematicSymbol, SimDef } from '../project/component'

const CATALOG_TRUST: Array<CatalogMeta['trust']> = ['builtin', 'ai-draft', 'user-installed', 'reviewed']
const CATALOG_CONFIDENCE: Array<NonNullable<CatalogMeta['confidence']>> = ['high', 'medium', 'low']
const CATALOG_RENDER_STRATEGY: Array<NonNullable<CatalogMeta['renderStrategy']>> = ['catalog-glb', 'draft-glb', 'primitive', 'generic-block']
const CATALOG_LICENSE_USE = ['bundled-ok', 'local-import-only', 'blocked']
const CATALOG_MODEL_FORMAT = ['glb', 'gltf', 'step', 'stp', 'wrl']
const CATALOG_MODEL_EXACTNESS = ['exact', 'module', 'package', 'generic']
const CATALOG_CONVERSION_STATUS = ['not-needed', 'needed', 'converter-unavailable', 'failed', 'converted']

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isValidCatalogMeta(meta: unknown): meta is CatalogMeta {
  if (!meta || typeof meta !== 'object') return false
  const m = meta as CatalogMeta
  if (!CATALOG_TRUST.includes(m.trust)) return false
  if (m.confidence !== undefined && !CATALOG_CONFIDENCE.includes(m.confidence)) return false
  if (m.renderStrategy !== undefined && !CATALOG_RENDER_STRATEGY.includes(m.renderStrategy)) return false
  if (m.sourceUrls !== undefined && !isStringArray(m.sourceUrls)) return false
  if (m.retrievedAt !== undefined && typeof m.retrievedAt !== 'string') return false
  if (m.reviewNotes !== undefined && !isStringArray(m.reviewNotes)) return false
  if (m.modelAsset !== undefined && !isValidModelAssetMeta(m.modelAsset)) return false
  return true
}

function isValidModelAssetMeta(asset: unknown): boolean {
  if (!asset || typeof asset !== 'object') return false
  const a = asset as Record<string, unknown>
  if (typeof a.sourceId !== 'string') return false
  if (typeof a.sourceUrl !== 'string') return false
  if (a.assetUrl !== undefined && typeof a.assetUrl !== 'string') return false
  if (typeof a.licenseName !== 'string') return false
  if (typeof a.licenseUrl !== 'string') return false
  if (!CATALOG_LICENSE_USE.includes(String(a.licenseUse))) return false
  if (typeof a.attribution !== 'string') return false
  if (!CATALOG_MODEL_FORMAT.includes(String(a.format))) return false
  if (!CATALOG_MODEL_EXACTNESS.includes(String(a.exactness))) return false
  if (!CATALOG_CONVERSION_STATUS.includes(String(a.conversionStatus))) return false
  if (a.checksum !== undefined && typeof a.checksum !== 'string') return false
  if (a.conversionLog !== undefined && !isStringArray(a.conversionLog)) return false
  return true
}

// Heuristic fallback for user catalog entries whose component.json predates
// the `schematic.symbol` field.
function inferSchematic(id: string): SchematicSymbolSpec {
  const lower = id.toLowerCase()
  const match: [string, SchematicSymbol][] = [
    ['resistor', 'resistor'], ['capacitor', 'capacitor'], ['speaker', 'speaker'],
    ['mic', 'microphone'], ['led-strip', 'ledstrip'], ['ws2812', 'ledstrip'],
    ['led', 'led'], ['button', 'button'], ['switch', 'button'],
    ['pot', 'potentiometer'], ['oled', 'display'], ['display', 'display'],
    ['servo', 'motor'], ['motor', 'motor'], ['relay', 'relay'],
    ['pir', 'sensor'], ['dht', 'sensor'], ['mpu', 'ic'], ['imu', 'ic']
  ]
  for (const [needle, symbol] of match) if (lower.includes(needle)) return { symbol }
  return { symbol: 'generic-rect' }
}

export async function hydrateCatalog(): Promise<number> {
  if (!window.espAI?.listCatalog) return 0
  const entries = await window.espAI.listCatalog()
  let n = 0
  for (const e of entries) {
    const j = e.json
    if (!j?.id || !Array.isArray(j.pins)) continue
    const def: ComponentDef = {
      id: j.id,
      name: j.name ?? j.id,
      version: j.version ?? '0.1.0',
      category: j.category ?? 'misc',
      family: typeof j.family === 'string' ? j.family : undefined,
      model: j.model ?? 'model.glb',
      scale: typeof j.scale === 'number' ? j.scale : 1,
      pins: j.pins.map((p: any) => ({
        id: p.id, label: p.label ?? p.id,
        type: p.type ?? 'digital_io',
        position: p.position, normal: p.normal ?? [0, 1, 0]
      })),
      schematic: j.schematic ?? inferSchematic(j.id),
      catalogMeta: isValidCatalogMeta(j.catalogMeta) ? j.catalogMeta : {
        trust: 'user-installed',
        confidence: 'medium',
        renderStrategy: typeof j.model === 'string' && j.model.trim() ? 'catalog-glb' : 'generic-block',
      },
      ...(j.sim ? { sim: j.sim as SimDef } : {})
    }
    catalog.registerComponent(def, e.glbData)
    n++
  }
  return n
}
