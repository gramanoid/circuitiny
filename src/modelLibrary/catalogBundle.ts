import type { ComponentDef, CatalogMeta } from '../project/component'
import type { ModelAssetCandidate } from './types'

export function componentFromModelAsset(candidate: ModelAssetCandidate): ComponentDef {
  const catalogMeta: CatalogMeta = {
    trust: 'user-installed',
    confidence: candidate.exactness === 'exact' ? 'medium' : 'low',
    sourceUrls: [candidate.assetUrl ?? candidate.sourceUrl],
    retrievedAt: new Date().toISOString(),
    renderStrategy: candidate.format === 'glb' || candidate.format === 'gltf' ? 'draft-glb' : 'generic-block',
    reviewNotes: [
      `Model source: ${candidate.sourceId}`,
      `License: ${candidate.licenseName}`,
      `License use: ${candidate.licenseUse}`,
      `Model format: ${candidate.format}`,
      `Exactness: ${candidate.exactness}`,
      ...candidate.beginnerNotes,
      ...candidate.reviewWarnings,
    ],
    modelAsset: {
      sourceId: candidate.sourceId,
      sourceUrl: candidate.sourceUrl,
      assetUrl: candidate.assetUrl,
      licenseName: candidate.licenseName,
      licenseUrl: candidate.licenseUrl,
      licenseUse: candidate.licenseUse,
      attribution: candidate.attribution,
      format: candidate.format,
      exactness: candidate.exactness,
      conversionStatus: candidate.format === 'glb' || candidate.format === 'gltf' ? 'not-needed' : 'needed',
      dimensionsMm: candidate.dimensionsMm,
    },
  }

  return {
    id: candidate.componentId,
    name: candidate.componentName,
    version: '0.1.0',
    category: candidate.category,
    family: candidate.family,
    model: candidate.format === 'glb' || candidate.format === 'gltf' ? candidate.modelFileName : '',
    scale: candidate.suggestedScale ?? 1,
    pins: candidate.defaultPins,
    schematic: { symbol: candidate.schematicSymbol },
    catalogMeta,
    docs: {
      notes: [
        candidate.description,
        ...candidate.beginnerNotes,
      ].join(' '),
    },
  }
}
