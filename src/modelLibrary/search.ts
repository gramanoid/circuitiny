import type { ModelAssetCandidate, ModelLicenseUse, ModelSearchFilters, ModelSearchResult } from './types'
import { MODEL_LIBRARY_ASSETS, STARTER_MODEL_ASSETS } from './manifest'

const LICENSE_RANK: Record<ModelLicenseUse, number> = {
  'bundled-ok': 0,
  'local-import-only': 1,
  blocked: 2,
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokens(value: string): string[] {
  return normalize(value).split(/\s+/).filter(Boolean)
}

function candidateHaystack(candidate: ModelAssetCandidate): string {
  return [
    candidate.id,
    candidate.label,
    candidate.description,
    candidate.family,
    candidate.componentId,
    candidate.componentName,
    candidate.sourceId,
    candidate.format,
    candidate.exactness,
    ...candidate.keywords,
  ].join(' ')
}

function scoreCandidate(candidate: ModelAssetCandidate, query: string): number {
  const q = normalize(query)
  if (!q) return 1
  const haystack = normalize(candidateHaystack(candidate))
  let score = 0
  if (haystack.includes(q)) score += 20
  if (normalize(candidate.label).includes(q)) score += 12
  if (normalize(candidate.componentId).includes(q)) score += 8
  for (const token of tokens(query)) {
    if (candidate.keywords.some((keyword) => normalize(keyword).includes(token))) score += 5
    if (haystack.includes(token)) score += 2
  }
  if (candidate.licenseUse === 'bundled-ok') score += 2
  if (candidate.format === 'gltf' || candidate.format === 'glb') score += 1
  if (candidate.exactness === 'exact') score += 1
  return score
}

function passesFilters(candidate: ModelAssetCandidate, filters: ModelSearchFilters): boolean {
  if (!filters.licenseUse?.length && candidate.licenseUse === 'blocked') return false
  if (filters.sourceIds?.length && !filters.sourceIds.includes(candidate.sourceId)) return false
  if (filters.formats?.length && !filters.formats.includes(candidate.format)) return false
  if (filters.licenseUse?.length && !filters.licenseUse.includes(candidate.licenseUse)) return false
  if (filters.starterOnly && !STARTER_MODEL_ASSETS.some((asset) => asset.id === candidate.id)) return false
  return true
}

export function searchModelAssets(query: string, filters: ModelSearchFilters = {}): ModelSearchResult {
  const filtered = MODEL_LIBRARY_ASSETS.filter((candidate) => passesFilters(candidate, filters))
  const scored = filtered
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, query) }))
    .filter((entry) => !query.trim() || entry.score > 0)
    .sort((a, b) => (
      b.score - a.score ||
      LICENSE_RANK[a.candidate.licenseUse] - LICENSE_RANK[b.candidate.licenseUse] ||
      a.candidate.label.localeCompare(b.candidate.label)
    ))
    .map((entry) => entry.candidate)

  return {
    query,
    candidates: scored,
    counts: {
      total: filtered.length,
      bundledOk: filtered.filter((candidate) => candidate.licenseUse === 'bundled-ok').length,
      localImportOnly: filtered.filter((candidate) => candidate.licenseUse === 'local-import-only').length,
      blocked: filtered.filter((candidate) => candidate.licenseUse === 'blocked').length,
    },
  }
}

export function modelAssetById(id: string): ModelAssetCandidate | undefined {
  return MODEL_LIBRARY_ASSETS.find((candidate) => candidate.id === id)
}

export function conversionStatusFor(candidate: ModelAssetCandidate) {
  return candidate.format === 'glb' || candidate.format === 'gltf' ? 'not-needed' : 'needed'
}
