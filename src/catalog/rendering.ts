import type { CatalogMeta, ComponentDef, SchematicSymbol } from '../project/component'
import { resolveSchematicSymbol } from '../project/component'

export type PrimitiveRenderKind =
  | 'led'
  | 'resistor'
  | 'button'
  | 'display'
  | 'sensor'
  | 'relay'
  | 'speaker'
  | 'potentiometer'
  | 'motor'
  | 'microphone'
  | 'ledstrip'
  | 'generic-block'

export interface CatalogRenderInfo {
  strategy: NonNullable<CatalogMeta['renderStrategy']>
  primitiveKind: PrimitiveRenderKind
  confidence: NonNullable<CatalogMeta['confidence']>
  trust: CatalogMeta['trust']
  warnings: string[]
}

const PRIMITIVE_BY_SYMBOL: Record<SchematicSymbol, PrimitiveRenderKind> = {
  led: 'led',
  resistor: 'resistor',
  button: 'button',
  display: 'display',
  sensor: 'sensor',
  relay: 'relay',
  speaker: 'speaker',
  potentiometer: 'potentiometer',
  motor: 'motor',
  microphone: 'microphone',
  ledstrip: 'ledstrip',
  capacitor: 'generic-block',
  ic: 'generic-block',
  'generic-rect': 'generic-block',
}

export const PRIMITIVE_ID_PATTERNS: Array<{ kind: PrimitiveRenderKind; patterns: RegExp[] }> = [
  // Match component-id family words such as soil-moisture-sensor, dht22, oled-display, or relay_1.
  // The regexes use (^|[-_])...([-_]|$) style boundaries so PrimitiveRenderKind matches stay token-aware.
  { kind: 'ledstrip', patterns: [/(^|[-_])(ws2812|neopixel|ledstrip|rgb[-_]?strip|rgbw[-_]?strip)([-_]|$)/] },
  { kind: 'led', patterns: [/(^|[-_])led([-_]|$)/] },
  { kind: 'resistor', patterns: [/(^|[-_])resistor([-_]|$)/] },
  { kind: 'button', patterns: [/(^|[-_])(button|push[-_]?button|tactile[-_]?button|btn)([-_]|$)/] },
  { kind: 'sensor', patterns: [/(^|[-_])(soil|moisture|pir)([-_]|$)/, /(^|[-_])dht\d*([-_]|$)/] },
  { kind: 'display', patterns: [/(^|[-_])(oled|display)([-_]|$)/] },
  { kind: 'relay', patterns: [/(^|[-_])relay([-_]|$)/] },
  { kind: 'speaker', patterns: [/(^|[-_])(speaker|buzzer)([-_]|$)/] },
  { kind: 'potentiometer', patterns: [/(^|[-_])(potentiometer|pot)([-_]|$)/] },
  { kind: 'motor', patterns: [/(^|[-_])(servo|motor)([-_]|$)/] },
  { kind: 'microphone', patterns: [/(^|[-_])(microphone|mic|inmp441)([-_]|$)/] },
]

export function primitiveKindForComponent(def: ComponentDef | undefined): PrimitiveRenderKind {
  if (!def) return 'generic-block'
  const id = def.id.toLowerCase()
  for (const matcher of PRIMITIVE_ID_PATTERNS) {
    if (matcher.patterns.some((pattern) => pattern.test(id))) return matcher.kind
  }
  return PRIMITIVE_BY_SYMBOL[resolveSchematicSymbol(def.schematic)] ?? 'generic-block'
}

export function resolveCatalogRender(def: ComponentDef | undefined, hasGlb: boolean): CatalogRenderInfo {
  const meta = def?.catalogMeta
  const confidence = meta?.confidence ?? 'medium'
  const trust = meta?.trust ?? 'user-installed'
  const primitiveKind = primitiveKindForComponent(def)
  const strategy = hasGlb
    ? (meta?.renderStrategy === 'draft-glb' ? 'draft-glb' : 'catalog-glb')
    : (meta?.renderStrategy === 'generic-block' ? 'generic-block' : 'primitive')
  const warnings = catalogReviewWarnings(def, hasGlb)
  return { strategy, primitiveKind, confidence, trust, warnings }
}

export function catalogReviewWarnings(def: ComponentDef | undefined, hasGlb = false): string[] {
  if (!def) return ['Unknown catalog part. Check the component id before using it.']
  const warnings: string[] = []
  const meta = def.catalogMeta
  if (meta?.trust === 'ai-draft') warnings.push('AI draft: review pins, voltage, and behavior before wiring hardware.')
  if ((meta?.confidence ?? 'medium') === 'low') warnings.push('Low confidence metadata: verify the datasheet or source before using this part.')
  if (!hasGlb) {
    warnings.push(meta?.renderStrategy === 'generic-block'
      ? 'No GLB or family renderer found: this part will render as a generic block.'
      : 'No GLB model found: Circuitiny will use a primitive 3D fallback.')
  }
  if (meta?.trust !== 'builtin' && (!meta?.sourceUrls || meta.sourceUrls.length === 0)) warnings.push('No source link recorded for this catalog entry.')
  if (def.pins.length === 0) warnings.push('No pins are defined, so the part cannot be wired yet.')
  return warnings
}

export function promoteCatalogMeta(meta: CatalogMeta | undefined, hasGlb: boolean): CatalogMeta {
  const renderStrategy = hasGlb
    ? 'catalog-glb'
    : (meta?.renderStrategy === 'generic-block' ? 'generic-block' : 'primitive')
  const notes = new Set([
    ...(meta?.reviewNotes ?? []),
    'Reviewed in Circuitiny Catalog Editor.',
    ...(meta?.trust ? [`Promoted from: ${meta.trust}`] : []),
  ])
  return {
    trust: 'reviewed',
    confidence: meta?.confidence === 'low' ? 'medium' : (meta?.confidence ?? 'medium'),
    sourceUrls: meta?.sourceUrls ?? [],
    retrievedAt: meta?.retrievedAt,
    renderStrategy,
    reviewNotes: Array.from(notes),
  }
}

export function catalogStatusLabel(meta: CatalogMeta | undefined): string {
  if (!meta) return 'user-installed'
  if (meta.trust === 'ai-draft') return 'AI draft'
  if (meta.trust === 'reviewed') return 'reviewed'
  if (meta.trust === 'builtin') return 'built in'
  return 'user-installed'
}
