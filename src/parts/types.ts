import type { CatalogRenderStrategy } from '../project/component'
import type { PinType } from '../project/schema'

export type PartConfidence = 'high' | 'medium' | 'low'
export type PartSourceKind = 'photo' | 'local-catalog' | 'curated-db' | 'exa-web' | 'manual'
export type PartSourceRankKind = 'datasheet' | 'vendor' | 'tutorial' | 'forum' | 'unknown'
export type SafetyReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Safety review metadata is pending until a reviewer approves or rejects it;
 * an undefined safety_review_status is treated the same as pending.
 * Only approved/rejected records must include reviewer_id and review_timestamp
 * so beginner-facing guidance can distinguish reviewed evidence from draft notes.
 */
export interface SafetyReviewMetadata {
  safety_review_status?: SafetyReviewStatus
  reviewer_id?: string
  review_timestamp?: string
  review_notes?: string
}

export function validateSafetyReviewMetadata(metadata: SafetyReviewMetadata): ValidationResult {
  const errors: string[] = []
  const status = metadata.safety_review_status
  if (status !== undefined && status !== 'pending' && status !== 'approved' && status !== 'rejected') {
    errors.push('safety_review_status must be pending, approved, rejected, or undefined.')
  }
  const hasReviewer = typeof metadata.reviewer_id === 'string' && metadata.reviewer_id.trim().length > 0
  const hasTimestamp = isIsoTimestamp(metadata.review_timestamp)
  // validateSafetyReviewMetadata treats status asymmetrically: approved/rejected need hasTimestamp,
  // while pending/undefined must omit metadata.review_timestamp regardless of its format.
  if (status === 'approved' || status === 'rejected') {
    if (!hasReviewer) errors.push('approved/rejected requires reviewer_id.')
    if (!hasTimestamp) errors.push('approved/rejected requires valid ISO review_timestamp.')
  } else {
    if (hasReviewer) errors.push('pending/undefined must not include reviewer_id.')
    // Pending/undefined status must not include any review timestamp, valid or invalid.
    if (metadata.review_timestamp !== undefined) {
      errors.push('pending/undefined must not include review_timestamp.')
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Validates a strict UTC ISO-8601 timestamp for review metadata.
 * isIsoTimestamp only accepts Z or +00:00 suffixes, rejects other offsets,
 * allows 1-6 fractional digits normalized by normalizeIsoMilliseconds, and
 * verifies round-trip equality with Date.prototype.toISOString().
 */
function isIsoTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (value !== trimmed) return false
  // Normalize "+00:00" to "Z", then pad/truncate 1-6 fractional digits to
  // exactly 3 milliseconds before comparing with Date.prototype.toISOString().
  // A decimal point without digits is intentionally rejected as malformed; Date.parse
  // is used only after the value matches this strict ISO-8601 UTC shape.
  const normalized = trimmed.replace(/\+00:00$/, 'Z')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(normalized)) return false
  const time = Date.parse(normalized)
  if (!Number.isFinite(time)) return false
  const normalizedTimestamp = normalizeIsoMilliseconds(normalized)
  return new Date(time).toISOString() === normalizedTimestamp
}

function normalizeIsoMilliseconds(value: string): string {
  const match = value.match(/^(.*?)(?:\.(\d{1,6}))?Z$/)
  if (!match) return value
  const millis = (match[2] ?? '').padEnd(3, '0').slice(0, 3)
  return `${match[1]}.${millis}Z`
}

export interface PartSourceRank {
  kind: PartSourceRankKind
  score: number
  confidence: PartConfidence
  reason: string
}

export interface PhotoCandidate extends SafetyReviewMetadata {
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

export interface PartKnowledgeRecord extends SafetyReviewMetadata {
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

export interface InventoryItem extends SafetyReviewMetadata {
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
