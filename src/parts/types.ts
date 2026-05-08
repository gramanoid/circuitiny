import type { CatalogRenderStrategy } from '../project/component'
import type { PinType } from '../project/schema'

export type PartConfidence = 'high' | 'medium' | 'low'
export type PartSourceKind = 'photo' | 'local-catalog' | 'curated-db' | 'exa-web' | 'manual'
export type PartSourceRankKind = 'datasheet' | 'vendor' | 'tutorial' | 'forum' | 'unknown'

export interface PartSourceRank {
  kind: PartSourceRankKind
  score: number
  confidence: PartConfidence
  reason: string
}

export interface PhotoCandidate {
  id: string
  label: string
  quantity: number
  confidence: PartConfidence
  evidence: string
  safetyNotes: string[]
  status: 'candidate' | 'confirmed' | 'ignored'
  source: PartSourceKind
  safetySensitive?: boolean
}

export interface PartCloseMatch {
  componentId: string
  label: string
  confidence: PartConfidence
  reason: string
}

export interface PartPinKnowledge {
  id: string
  label: string
  type: PinType
  why: string
}

export interface CompanionPart {
  componentId: string
  quantity: number
  reason: string
}

export interface PartKnowledgeRecord {
  id: string
  label: string
  family: string
  confidence: PartConfidence
  source: PartSourceKind
  catalogMatchId?: string
  explanation: string
  safetyNotes: string[]
  importantPins: PartPinKnowledge[]
  requiredCompanions: CompanionPart[]
  sourceLinks: string[]
  sourceRanks?: PartSourceRank[]
  retrievedAt?: string
  closeMatches?: PartCloseMatch[]
  renderStrategy: CatalogRenderStrategy
  reviewRequired: boolean
}

export interface InventoryItem {
  id: string
  label: string
  quantity: number
  confidence: PartConfidence
  knowledge: PartKnowledgeRecord
  confirmedAt: string
}

export interface ExaSearchResult {
  title: string
  url: string
  highlights: string[]
  publishedDate?: string
  retrievedAt?: string
}

export interface ProjectRecommendation {
  id: string
  title: string
  difficulty: 'beginner' | 'intermediate'
  fit: 'build-now' | 'missing-parts'
  score: number
  concepts: string[]
  usedParts: string[]
  missingParts: CompanionPart[]
  safetyNotes: string[]
  why: string
  templateId?: string
  firstStep: string
  expectedSimulation: string
}
