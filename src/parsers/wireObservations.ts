import type { RealityObservation } from '../reality/check'

export function parseWireObservations(text: string): RealityObservation[] {
  return text.split('\n')
    .map((line, originalIndex) => ({ line: line.trim(), originalIndex }))
    .filter(({ line }) => !!line)
    .map(({ line, originalIndex }) => parseWireObservationLine(line, originalIndex))
}

function parseWireObservationLine(line: string, index: number): RealityObservation {
  // Polarity shorthand marks a component as reversed without needing pin endpoints.
  const polarity = line.match(/^polarity\s+([A-Za-z0-9._-]+)\s+(reversed|backwards|wrong)\s*$/i)
  if (polarity) {
    return {
      id: `manual-polarity-${index + 1}`,
      kind: 'polarity',
      label: `${polarity[1]} polarity`,
      componentInstance: normalizePolarityComponentRef(polarity[1]),
      polarityReversed: true,
      confidence: 'high',
      notes: polarity[2],
    }
  }
  const parts = line.split(/\s*->\s*/).map((part) => part.trim()).filter(Boolean)
  // Mixed comma and arrow delimiters hide multiple wires in one line; ask for one wire per line.
  if (parts.length === 2 && parts.some(hasCommaSeparatedEndpoints)) {
    return {
      id: `manual-wire-${index + 1}`,
      kind: 'wire',
      label: `Observed wire ${index + 1}`,
      confidence: 'low',
      notes: `Mixed delimiters are not supported on line ${index + 1}; use one "from -> to" wire per line.`,
    }
  }
  // Valid wire: normalize exactly two instance.pin endpoint references.
  if (parts.length === 2 && isEndpointRef(parts[0]) && isEndpointRef(parts[1])) {
    return {
      id: `manual-wire-${index + 1}`,
      kind: 'wire',
      label: `Observed wire ${index + 1}`,
      endpoints: [normalizeEndpointRef(parts[0]), normalizeEndpointRef(parts[1])] as [string, string],
      confidence: 'high',
    }
  }
  // Delimiter-only lines produce no usable endpoints.
  if (parts.length === 0) {
    return {
      id: `manual-wire-${index + 1}`,
      kind: 'wire',
      label: `Observed wire ${index + 1}`,
      confidence: 'low',
      notes: 'Line contains only delimiters; no endpoints were provided.',
    }
  }
  // Multiple arrows usually mean several wires were pasted onto one line.
  if (parts.length > 2) {
    return {
      id: `manual-wire-${index + 1}`,
      kind: 'wire',
      label: `Observed wire ${index + 1}`,
      confidence: 'low',
      notes: `Multiple arrows found on line ${index + 1}; use one "from -> to" wire per line.`,
    }
  }
  // A single part means the arrow separator is missing; echo a sanitized snippet.
  if (parts.length === 1) {
    return {
      id: `manual-wire-${index + 1}`,
      kind: 'wire',
      label: `Observed wire ${index + 1}`,
      confidence: 'low',
      notes: `Expected "from -> to" on line ${index + 1}; got "${sanitizeObservationSnippet(line)}".`,
    }
  }
  const from = sanitizeObservationSnippet(parts[0] ?? '')
  const to = sanitizeObservationSnippet(parts[1] ?? '')
  const source = sanitizeObservationSnippet(line)
  // Final fallback: the shape looked like a wire but one or both refs failed instance.pin format.
  return {
    id: `manual-wire-${index + 1}`,
    kind: 'wire',
    label: `Observed wire ${index + 1}`,
    confidence: 'low',
    notes: `Endpoints failed instance.pin format on line ${index + 1}: "${from}" -> "${to}" from "${source}".`,
  }
}

function sanitizeObservationSnippet(value: string, maxLength = 200): string {
  const normalized = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`
}

function isEndpointRef(value: string): boolean {
  const parts = value.split('.').map((part) => part.trim())
  return parts.length === 2 && parts.every((part) => part.length > 0)
}

function normalizeEndpointRef(value: string): string {
  return value.split('.').map((part) => part.trim().toLowerCase()).join('.')
}

function normalizePolarityComponentRef(value: string): string {
  return value.split('.')[0]?.trim() || value.trim()
}

function hasCommaSeparatedEndpoints(segment: string): boolean {
  if (!segment.includes(',')) return false
  const pieces = segment.split(',').map((piece) => piece.trim())
  const nonEmptyPieces = pieces.filter(Boolean)
  return nonEmptyPieces.length > 1 && nonEmptyPieces.every((piece) => piece.includes('.'))
}
