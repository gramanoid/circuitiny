import type { PinType } from '../project/schema'
import { lookupPartKnowledge, normalizePartQuery } from '../parts/retrieval'
import type { PartKnowledgeRecord } from '../parts/types'

export type PartIdentityState = 'exact' | 'generic-family' | 'approximate' | 'conflict' | 'unknown'
export type IdentityFieldState = 'reviewed' | 'draft' | 'conflicting'
export type IdentityEvidenceTrust = 'reviewed' | 'draft' | 'conflicting' | 'local-only' | 'blocked'
export type LicenseNoteStatus = 'blocked' | 'local-only' | 'unknown'

export interface DatasheetSource {
  url: string
  title: string
  vendor?: string
  retrievedAt: string
  licenseNote: string
  checksum?: string
  text?: string
}

export interface ExtractedPin {
  id: string
  label: string
  type: PinType
  state: IdentityFieldState
}

export interface DatasheetExtraction {
  pins: ExtractedPin[]
  voltageRange?: { min: number; max: number; state: IdentityFieldState }
  currentMa?: { max: number; state: IdentityFieldState }
  protocol?: { value: string; state: IdentityFieldState }
  companionParts: string[]
  warnings: string[]
  hasConflict: boolean
}

export interface PartIdentity {
  id: string
  query: string
  state: PartIdentityState
  knowledge: PartKnowledgeRecord
  sources: DatasheetSource[]
  extraction: DatasheetExtraction
  reviewRequired: boolean
  confidence: 'high' | 'medium' | 'low'
}

export function isTrustedIdentity(identity: Pick<PartIdentity, 'reviewRequired' | 'state'>): boolean {
  return !identity.reviewRequired && identity.state !== 'conflict'
}

const MAX_EXTRACTED_PINS = 12
const TOKEN_BOUNDARY = String.raw`(?<![A-Za-z0-9])`
const TOKEN_END = String.raw`(?![A-Za-z0-9])`
const PROTOCOL_TOKENS = [
  'i2c', 'sda', 'scl',
  'spi', 'mosi', 'miso', 'sck',
  'uart', 'tx', 'rx',
  'one-wire', 'one wire', '1-wire', '1 wire',
] as const
const protocolTokenRegexes = new Map<string, RegExp>(
  PROTOCOL_TOKENS.map((token) => [
    token,
    new RegExp(`${TOKEN_BOUNDARY}${escapeRegExp(token)}${TOKEN_END}`, 'i'),
  ]),
)

const PIN_TYPE_HINTS: Array<[RegExp, PinType]> = [
  [/\bgnd|ground\b/i, 'ground'],
  [/\bvcc|vdd|vin|3v3|5v\b/i, 'power_in'],
  [/\bsda\b/i, 'i2c_sda'],
  [/\bscl\b/i, 'i2c_scl'],
  [/\bmosi\b/i, 'spi_mosi'],
  [/\bmiso\b/i, 'spi_miso'],
  [/\bsck|clk\b/i, 'spi_sck'],
  [/\btx\b/i, 'uart_tx'],
  [/\brx\b/i, 'uart_rx'],
  [/\baout|analog\b/i, 'analog_out'],
  [/^(?:dout\d*|data\d*|sig\d*|io\d*)$/i, 'digital_io'],
]

export function identifyPart(
  query: string,
  sources: DatasheetSource[] = [],
  lookup: (normalizedQuery: string) => PartKnowledgeRecord = lookupPartKnowledge,
): PartIdentity {
  const normalized = normalizePartQuery(query)
  const knowledge = lookup(normalized)
  const extraction = mergeExtractions(sources.map(extractDatasheetFacts))
  const hasConflict = extraction.hasConflict
  const state = hasConflict
    ? 'conflict'
    : identityStateFromKnowledge(knowledge)
  const sourceBacked = sources.length > 0 || knowledge.sourceLinks.length > 0
  return {
    id: knowledge.id,
    query,
    state,
    knowledge,
    sources,
    extraction,
    reviewRequired: knowledge.reviewRequired || state !== 'exact' || hasDraftOrConflict(extraction) || !sourceBacked,
    confidence: hasConflict ? 'low' : knowledge.confidence,
  }
}

export function extractDatasheetFacts(source: DatasheetSource): DatasheetExtraction {
  const text = source.text ?? ''
  const warnings = extractWarnings(text)
  const pins = extractPins(text, warnings)
  const voltageRange = extractVoltageRange(text, warnings)
  const currentMa = extractCurrentLimit(text)
  const protocol = extractProtocol(text)
  const companionParts = extractCompanionParts(text)
  return {
    pins,
    voltageRange,
    currentMa,
    protocol,
    companionParts,
    warnings,
    hasConflict: false,
  }
}

export function trustedIdentitySummary(identity: PartIdentity): string[] {
  const lines: string[] = []
  lines.push(`${identity.knowledge.label}: ${identity.state.replace('-', ' ')}`)
  if (identity.extraction.pins.length > 0) {
    lines.push(`Pins: ${identity.extraction.pins.map((pin) => `${pin.label} (${pin.type})`).join(', ')}`)
  }
  if (identity.extraction.voltageRange) {
    const range = identity.extraction.voltageRange
    lines.push(`Voltage: ${range.min}-${range.max} V (${range.state})`)
  }
  if (identity.extraction.companionParts.length > 0) {
    lines.push(`Companions: ${identity.extraction.companionParts.join(', ')}`)
  }
  if (identity.reviewRequired) lines.push('Review required before build-critical use.')
  return lines
}

export function beginnerIdentitySummary(identity: PartIdentity): string[] {
  const lines: string[] = []
  const sources = sourceLabels(identity)
  lines.push(`${identity.knowledge.label}: ${identity.state.replace('-', ' ')} match with ${identity.confidence} confidence.`)
  lines.push(sources.length > 0
    ? `Sources checked: ${sources.join(', ')}.`
    : 'No source link is attached yet; keep this as a draft until you add a datasheet or trusted catalog source.')
  if (identity.extraction.pins.length > 0) {
    lines.push(`Pins to look for: ${identity.extraction.pins.map((pin) => `${pin.label} (${pin.type}, ${pin.state})`).join(', ')}.`)
  }
  if (identity.extraction.voltageRange) {
    const range = identity.extraction.voltageRange
    lines.push(`Power range found: ${range.min}-${range.max} V (${range.state}).`)
  }
  if (identity.extraction.currentMa) {
    lines.push(`Current limit found: up to ${identity.extraction.currentMa.max} mA (${identity.extraction.currentMa.state}).`)
  }
  if (identity.extraction.protocol) {
    lines.push(`Signal protocol: ${identity.extraction.protocol.value.toUpperCase()} (${identity.extraction.protocol.state}).`)
  }
  if (identity.extraction.companionParts.length > 0) {
    lines.push(`Usually needs: ${identity.extraction.companionParts.join(', ')}.`)
  }
  const cautions = [...identity.knowledge.safetyNotes, ...identity.extraction.warnings]
  if (cautions.length > 0) {
    lines.push(`Mistakes to avoid: ${Array.from(new Set(cautions)).join(' ')}`)
  }
  if (identity.reviewRequired) {
    lines.push('Review required: do not use these fields for build-critical wiring until pins, power, and sources are promoted.')
  }
  return lines
}

export function classifyIdentityEvidence(identity: PartIdentity): IdentityEvidenceTrust {
  if (identity.state === 'conflict' || identity.extraction.hasConflict) return 'conflicting'
  const licenseStatuses = identity.sources.map((source) => normalizeLicenseNote(source.licenseNote))
  if (licenseStatuses.includes('blocked')) return 'blocked'
  if (licenseStatuses.includes('local-only')) return 'local-only'
  return isTrustedIdentity(identity) ? 'reviewed' : 'draft'
}

function sourceLabels(identity: PartIdentity): string[] {
  const sourceLabels = identity.sources.map((source) => source.vendor || source.title || source.url)
  const linkLabels = identity.knowledge.sourceLinks.map((link) => {
    try {
      return new URL(link).hostname
    } catch {
      return link
    }
  })
  return Array.from(new Set([...sourceLabels, ...linkLabels].filter(Boolean)))
}

/** Normalize free-text source terms into the small trust categories identity review uses. */
export function normalizeLicenseNote(licenseNote: string): LicenseNoteStatus {
  const normalized = licenseNote.trim().toLowerCase()
  if (['blocked', 'paid', 'paywalled', 'restricted'].some((token) => normalized.includes(token))) return 'blocked'
  if (['local-only', 'local import only', 'personal use'].some((token) => normalized.includes(token))) return 'local-only'
  return 'unknown'
}

function identityStateFromKnowledge(knowledge: PartKnowledgeRecord): PartIdentityState {
  if (knowledge.source === 'local-catalog' && !knowledge.reviewRequired) return 'exact'
  if (knowledge.source === 'curated-db' || knowledge.catalogMatchId) return 'generic-family'
  if (knowledge.source === 'manual') return 'unknown'
  return 'approximate'
}

function hasDraftOrConflict(extraction: DatasheetExtraction): boolean {
  if (extraction.pins.some((pin) => pin.state !== 'reviewed')) return true
  if (extraction.voltageRange?.state && extraction.voltageRange.state !== 'reviewed') return true
  if (extraction.currentMa?.state && extraction.currentMa.state !== 'reviewed') return true
  if (extraction.protocol?.state && extraction.protocol.state !== 'reviewed') return true
  return false
}

function mergeExtractions(extractions: DatasheetExtraction[]): DatasheetExtraction {
  if (extractions.length === 0) {
    return { pins: [], companionParts: [], warnings: [], hasConflict: false }
  }
  const warnings = extractions.flatMap((extraction) => extraction.warnings)
  const pins = dedupePins(extractions.flatMap((extraction) => extraction.pins))
  const voltageRanges = extractions.map((extraction) => extraction.voltageRange).filter((range): range is NonNullable<DatasheetExtraction['voltageRange']> => !!range)
  const currentLimits = extractions.map((extraction) => extraction.currentMa).filter((current): current is NonNullable<DatasheetExtraction['currentMa']> => !!current)
  const protocols = extractions.map((extraction) => extraction.protocol?.value).filter((value): value is string => !!value)
  const companionParts = Array.from(new Set(extractions.flatMap((extraction) => extraction.companionParts))).sort()

  const voltageRange = mergeVoltageRanges(voltageRanges, warnings)
  const currentMa = currentLimits.length > 0
    ? { max: Math.min(...currentLimits.map((current) => current.max)), state: allSameNumeric(currentLimits.map((current) => current.max)) ? 'draft' as const : 'conflicting' as const }
    : undefined
  if (currentMa?.state === 'conflicting') warnings.push('Current limit conflict between sources.')

  const protocolValues = Array.from(new Set(protocols))
  const protocol = protocolValues.length === 1 ? { value: protocolValues[0], state: 'draft' as const } : undefined
  if (protocolValues.length > 1) warnings.push(`Protocol conflict between sources: ${protocolValues.join(', ')}.`)

  return {
    pins,
    voltageRange,
    currentMa,
    protocol,
    companionParts,
    warnings,
    hasConflict: extractions.some((extraction) => extraction.hasConflict) ||
      pins.some((pin) => pin.state === 'conflicting') ||
      voltageRange?.state === 'conflicting' ||
      currentMa?.state === 'conflicting' ||
      protocolValues.length > 1,
  }
}

function dedupePins(pins: ExtractedPin[]): ExtractedPin[] {
  const byId = new Map<string, ExtractedPin>()
  for (const pin of pins) {
    const existing = byId.get(pin.id)
    if (!existing) {
      byId.set(pin.id, pin)
    } else if (existing.type !== pin.type) {
      byId.set(pin.id, { ...existing, state: 'conflicting' })
    }
  }
  return Array.from(byId.values())
}

/**
 * Merges voltage ranges from multiple sources.
 * Empty input returns undefined. Overlapping ranges return their safe
 * intersection with state 'draft'. Non-overlapping ranges return the visible
 * union with state 'conflicting'; callers must not treat those min/max values
 * as safe operating limits without checking the returned state.
 */
function mergeVoltageRanges(
  ranges: NonNullable<DatasheetExtraction['voltageRange']>[],
  warnings: string[],
): DatasheetExtraction['voltageRange'] {
  if (ranges.length === 0) return undefined
  const min = Math.max(...ranges.map((range) => range.min))
  const max = Math.min(...ranges.map((range) => range.max))
  if (min > max) {
    warnings.push('Voltage range conflict between sources.')
    // Return the union only to keep the conflict visible; callers must inspect state before treating it as safe.
    return { min: Math.min(...ranges.map((range) => range.min)), max: Math.max(...ranges.map((range) => range.max)), state: 'conflicting' }
  }
  return { min, max, state: 'draft' }
}

function extractPins(text: string, warnings: string[]): ExtractedPin[] {
  const matches = Array.from(text.matchAll(/\b(?:pins?|pinout)\s*[:#-]?\s*([A-Za-z0-9_, /\-]{1,120})/gi))
  const rawPinLabels = matches
    .flatMap((match) => (match[1] ?? '').split(/[,\s/]+/))
    .map((label) => label.trim())
    .filter((label) => label.length >= 2 && label.length <= 12)
  // Datasheet prose can include long pin tables; keep extraction bounded until a reviewed parser promotes fields.
  if (rawPinLabels.length > MAX_EXTRACTED_PINS) {
    warnings.push(`Datasheet extraction kept the first ${MAX_EXTRACTED_PINS} of ${rawPinLabels.length} possible pin labels.`)
  }
  const seenIds = new Map<string, number>()
  const pins: ExtractedPin[] = []
  for (const label of rawPinLabels) {
    const baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!baseId) {
      warnings.push(`Pin label "${label}" normalized to an empty id; skipped.`)
      continue
    }
    const seenCount = seenIds.get(baseId) ?? 0
    seenIds.set(baseId, seenCount + 1)
    const id = seenCount === 0 ? baseId : `${baseId}_${seenCount + 1}`
    if (seenCount > 0) {
      warnings.push(`Duplicate pin label "${label}" normalized to "${baseId}"; kept as "${id}".`)
    }
    pins.push({
      id,
      label,
      type: inferPinType(label),
      state: 'draft' as const,
    })
    if (pins.length >= MAX_EXTRACTED_PINS) break
  }
  return pins
}

function extractVoltageRange(text: string, warnings: string[]): DatasheetExtraction['voltageRange'] {
  const voltageUnit = String.raw`(?:v|volt)s?(?:\s*dc)?`
  const ranges = Array.from(text.matchAll(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${voltageUnit}\s*(?:-|–|—|~|to|through|\.{2})\s*(\d+(?:\.\d+)?)\s*${voltageUnit}`, 'gi')))
    .map((match) => {
      const left = Number(match[1])
      const right = Number(match[2])
      if (Number.isFinite(left) && Number.isFinite(right) && left > right) {
        warnings.push(`Inverted voltage range detected: "${match[0]}"; check datasheet context.`)
      }
      return [left, right] as const
    })
    .filter(([min, max]) => Number.isFinite(min) && Number.isFinite(max))
  if (ranges.length > 0) {
    // extractVoltageRange unions ranges within one source so multiple operating modes
    // stay visible; mergeVoltageRanges intersects across independent sources.
    const min = Math.min(...ranges.map((range) => Math.min(range[0], range[1])))
    const max = Math.max(...ranges.map((range) => Math.max(range[0], range[1])))
    return { min, max, state: 'draft' }
  }
  const single = text.match(new RegExp(String.raw`\b(\d+(?:\.\d+)?)\s*${voltageUnit}\b`, 'i'))
  if (!single) return undefined
  const value = Number(single[1])
  return { min: value, max: value, state: 'draft' }
}

function extractCurrentLimit(text: string): DatasheetExtraction['currentMa'] {
  const match = text.match(/(\d+(?:\.\d+)?)\s*mA\b/i)
  if (!match) return undefined
  const max = Number(match[1])
  return Number.isFinite(max) ? { max, state: 'draft' } : undefined
}

function extractProtocol(text: string): DatasheetExtraction['protocol'] {
  const normalized = text.toLowerCase()
  if (hasToken(normalized, ['i2c', 'sda', 'scl'])) return { value: 'i2c', state: 'draft' }
  if (hasToken(normalized, ['spi', 'mosi', 'miso', 'sck'])) return { value: 'spi', state: 'draft' }
  const hasTx = hasToken(normalized, ['tx'])
  const hasRx = hasToken(normalized, ['rx'])
  if (hasToken(normalized, ['uart']) || /\bserial\b/.test(normalized) || /\bbaud\b/.test(normalized) || (hasTx && hasRx)) {
    return { value: 'uart', state: 'draft' }
  }
  if (hasToken(normalized, ['one-wire', 'one wire', '1-wire', '1 wire'])) return { value: '1wire', state: 'draft' }
  return undefined
}

function hasToken(text: string, tokens: string[]): boolean {
  return tokens.some((token) => {
    const regex = protocolTokenRegexes.get(token)
    return regex?.test(text) ?? false
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractCompanionParts(text: string): string[] {
  const normalized = text.toLowerCase()
  const companions: string[] = []
  if (/pull[- ]?up/.test(normalized)) companions.push('pull-up resistor')
  if (/series resistor|current limit/.test(normalized)) companions.push('series resistor')
  if (/flyback|diode/.test(normalized)) companions.push('flyback diode')
  if (/transistor|mosfet|driver/.test(normalized)) companions.push('driver transistor')
  return Array.from(new Set(companions)).sort()
}

function extractWarnings(text: string): string[] {
  const warnings: string[] = []
  const normalized = text.toLowerCase()
  if (/absolute maximum/.test(normalized)) warnings.push('Absolute maximum ratings are not normal operating limits.')
  if (/5\s*v/.test(normalized) && /3\.3\s*v/.test(normalized)) warnings.push('Source mentions both 3.3V and 5V; confirm the safe ESP32 logic level.')
  if (hasMalformedVoltageRange(text)) {
    warnings.push('Voltage range text is malformed; review the datasheet before trusting voltage limits.')
  }
  if (/reverse polarity/.test(normalized)) warnings.push('Polarity matters; check orientation before power.')
  return warnings
}

function hasMalformedVoltageRange(text: string): boolean {
  const range = /(\d+(?:\.\d+)?\s*v?)\s*(?:-|–|—|~|to|through|\.{2})\s*([^\s,;.]+)/gi
  for (const match of text.matchAll(range)) {
    const right = match[2]?.trim().toLowerCase() ?? ''
    if (!right || right === 'ground' || right === 'gnd') continue
    if (!/\d/.test(right) && !/^v(?:olts?)?$/.test(right)) return true
  }
  return false
}

function inferPinType(label: string): PinType {
  for (const [pattern, type] of PIN_TYPE_HINTS) {
    if (pattern.test(label)) return type
  }
  return 'digital_io'
}

// Datasheet current limits are expected to be practical mA values; combine absolute
// and relative tolerance so tiny rounding noise is allowed without hiding large-value drift.
function allSameNumeric(values: number[]): boolean {
  if (values.length === 0) return true
  const first = values[0]
  const absoluteTolerance = 0.01
  const relativeTolerance = 1e-6
  const magnitudeFloor = 1
  // All-zero source values intentionally compare equal while the floor keeps
  // near-zero relative tolerance from collapsing below the absolute tolerance.
  return values.every((value) =>
    Math.abs(value - first) <= Math.max(
      absoluteTolerance,
      relativeTolerance * Math.max(Math.abs(first), Math.abs(value), magnitudeFloor),
    ))
}
