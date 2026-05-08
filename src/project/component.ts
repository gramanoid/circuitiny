// Catalog component definition (component.json sidecar to a .glb).

import type { PinType } from './schema'

export interface PinDef {
  id: string
  label: string
  type: PinType
  protocol?: '1wire' | 'i2c' | 'spi' | 'uart'
  voltage?: { min: number; max: number; nominal: number }
  pull?: 'none' | 'up_required' | 'down_required'
  position: [number, number, number]   // meters, in GLB local frame
  normal: [number, number, number]     // wire exit direction
}

export interface DriverDef {
  language: 'c'
  idfComponent?: string
  defaultPinAssignments?: Record<string, string>
  initSnippet?: string                  // template path
  readSnippet?: string
  includes?: string[]
  cmakeRequires?: string[]
}

// Schematic symbol vocabulary. `generic-rect` is the fallback used when a
// component doesn't declare a dedicated symbol — it renders as the plain
// labeled rectangle Schematic.tsx draws today.
export type SchematicSymbol =
  | 'resistor'
  | 'capacitor'
  | 'led'
  | 'button'
  | 'potentiometer'
  | 'display'
  | 'ic'
  | 'sensor'
  | 'motor'
  | 'relay'
  | 'speaker'
  | 'microphone'
  | 'ledstrip'
  | 'generic-rect'

export type SchematicPinSide = 'left' | 'right' | 'top' | 'bottom'

export interface SchematicSymbolSpec {
  symbol?: SchematicSymbol
  pinAnchors?: Record<string, { side: SchematicPinSide; offset: number }>
  labelPosition?: 'top' | 'bottom'
  // Legacy fields — kept so existing component.json files keep loading.
  // Prefer `symbol` for new entries.
  autoGenerate?: boolean
  shape?: 'rectangle' | 'circle'
}

// Resolve a component's symbol, honoring both the new `symbol` field and the
// legacy `autoGenerate`/`shape` pair. Centralized here so the renderer and
// any other consumers stay in sync.
export function resolveSchematicSymbol(spec: SchematicSymbolSpec | undefined): SchematicSymbol {
  if (spec?.symbol) return spec.symbol
  return 'generic-rect'
}

export type SimRole = 'led' | 'button' | 'buzzer' | 'servo' | 'display' | 'generic_output' | 'generic_input' | 'ledstrip'

export interface SimDef {
  role: SimRole
  /** Pin id whose GPIO state drives this component's visual (e.g. 'anode' for an LED). */
  outputPin?: string
  /** Pin id that generates a rising gpio_edge when the user clicks this component (e.g. 'a' for a button). */
  inputPin?: string
}

export type CatalogTrustState = 'builtin' | 'user-installed' | 'ai-draft' | 'reviewed'
export type CatalogRenderStrategy = 'catalog-glb' | 'primitive' | 'draft-glb' | 'generic-block'
export type CatalogLicenseUse = 'bundled-ok' | 'local-import-only' | 'blocked'
export type CatalogModelFormat = 'glb' | 'gltf' | 'step' | 'stp' | 'wrl'
export type CatalogModelExactness = 'exact' | 'module' | 'package' | 'generic'
export type CatalogConversionStatus = 'not-needed' | 'needed' | 'converter-unavailable' | 'failed' | 'converted'

export interface CatalogModelAssetMeta {
  sourceId: string
  sourceUrl: string
  assetUrl?: string
  licenseName: string
  licenseUrl: string
  licenseUse: CatalogLicenseUse
  attribution: string
  format: CatalogModelFormat
  exactness: CatalogModelExactness
  conversionStatus: CatalogConversionStatus
  checksum?: string
  dimensionsMm?: { x: number; y: number; z: number }
  conversionLog?: string[]
}

export interface CatalogMeta {
  trust: CatalogTrustState
  confidence?: 'high' | 'medium' | 'low'
  sourceUrls?: string[]
  retrievedAt?: string
  renderStrategy?: CatalogRenderStrategy
  reviewNotes?: string[]
  modelAsset?: CatalogModelAssetMeta
}

export interface ComponentDef {
  id: string
  name: string
  version: string
  category: 'sensor' | 'actuator' | 'display' | 'input' | 'power' | 'misc'
  family?: string
  model: string                         // .glb path relative to component dir
  scale?: number
  anchor?: [number, number, number]
  pins: PinDef[]
  power?: { current_ma: number; rail: '3v3' | '5v' | 'vin' }
  driver?: DriverDef
  schematic?: SchematicSymbolSpec
  sim?: SimDef
  docs?: { datasheetUrl?: string; notes?: string }
  idfVersion?: string                   // e.g. ">=5.0"
  catalogMeta?: CatalogMeta
}

// Boards are components with extra MCU metadata.
export interface BoardDef extends ComponentDef {
  target: 'esp32' | 'esp32s2' | 'esp32s3' | 'esp32c3' | 'esp32c6' | 'esp32h2'
  boardVersion?: string
  features?: string[]                      // human-readable feature tags shown in board picker
  inputOnlyPins: string[]
  strappingPins: string[]
  flashPins: string[]
  usbPins: string[]
  adc1Pins: string[]
  adc2Pins: string[]
  pwmCapablePins?: string[]
  railBudgetMa: { '3v3': number; '5v'?: number }
}
