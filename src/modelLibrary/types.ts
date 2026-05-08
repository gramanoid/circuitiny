import type { ComponentDef, PinDef, SchematicSymbol } from '../project/component'

export type ModelAssetFormat = 'glb' | 'gltf' | 'step' | 'stp' | 'wrl'
export type ModelLicenseUse = 'bundled-ok' | 'local-import-only' | 'blocked'
export type ModelExactness = 'exact' | 'module' | 'package' | 'generic'
export type ModelConversionStatus = 'not-needed' | 'needed' | 'converter-unavailable' | 'failed' | 'converted'

export interface ModelLibrarySource {
  id: string
  name: string
  url: string
  licenseName: string
  licenseUrl: string
  licenseUse: ModelLicenseUse
  formats: ModelAssetFormat[]
  attribution: string
  notes: string[]
}

export interface ModelAssetCandidate {
  id: string
  label: string
  description: string
  family: string
  keywords: string[]
  sourceId: string
  sourceUrl: string
  assetUrl?: string
  licenseName: string
  licenseUrl: string
  licenseUse: ModelLicenseUse
  attribution: string
  format: ModelAssetFormat
  exactness: ModelExactness
  category: ComponentDef['category']
  schematicSymbol: SchematicSymbol
  componentId: string
  componentName: string
  modelFileName: string
  defaultPins: PinDef[]
  suggestedScale?: number
  dimensionsMm?: { x: number; y: number; z: number }
  beginnerNotes: string[]
  reviewWarnings: string[]
}

export interface ModelSearchFilters {
  sourceIds?: string[]
  formats?: ModelAssetFormat[]
  licenseUse?: ModelLicenseUse[]
  starterOnly?: boolean
}

export interface ModelSearchResult {
  query: string
  candidates: ModelAssetCandidate[]
  counts: {
    total: number
    bundledOk: number
    localImportOnly: number
    blocked: number
  }
}

export interface ModelInstallRequest {
  asset: ModelAssetCandidate
  componentJson: string
  approved: boolean
}

export interface ModelInstallResult {
  ok: boolean
  componentJson?: string
  component?: ComponentDef
  modelName?: string
  modelData?: Uint8Array
  savedTo?: string
  conversionStatus?: ModelConversionStatus
  conversionLog?: string[]
  error?: string
}

export interface ModelSourceStats {
  sourceId: string
  knownAssetCount: number
  indexedCount?: number
  lastVerifiedAt: string
}
