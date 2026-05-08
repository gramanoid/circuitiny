import { lookupPartKnowledge } from './retrieval'
import type { PartConfidence, PhotoCandidate } from './types'

type RawCandidate = {
  label?: unknown
  quantity?: unknown
  confidence?: unknown
  evidence?: unknown
  safetyNotes?: unknown
}

export function parsePhotoCandidates(text: string): PhotoCandidate[] {
  const json = extractJson(text)
  if (json) {
    try {
      const parsed = JSON.parse(json)
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.candidates) ? parsed.candidates : []
      const candidates = items.map((item: RawCandidate, index: number) => candidateFromRaw(item, index)).filter(Boolean)
      if (candidates.length > 0) return candidates
    } catch {
      // Fall back to keyword extraction.
    }
  }
  return candidatesFromDescription(text)
}

export function candidatesFromDescription(description: string): PhotoCandidate[] {
  const text = description.toLowerCase()
  const patterns: Array<[RegExp, string]> = [
    [/\bled\b|light emitting diode|lamp/, 'LED'],
    [/resistor|220\s*ohm|220r/, '220 ohm resistor'],
    [/button|switch|tactile/, 'push button'],
    [/soil|moisture|plant/, 'soil moisture sensor'],
    [/oled|display|screen|ssd1306/, 'OLED display'],
    [/pir|motion|presence/, 'PIR motion sensor'],
    [/servo|sg90/, 'servo motor'],
    [/relay|motor driver|lithium|li-?ion|battery|mains|power supply|charger|capacitor bank/, 'safety-sensitive power part'],
  ]
  const labels = patterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => String(label))

  const unique = labels.length > 0 ? Array.from(new Set(labels)) : ['unknown electronics part']
  return unique.map((label, index) => {
    const knowledge = lookupPartKnowledge(label)
    return {
      id: `candidate-${index + 1}-${knowledge.id}`,
      label: knowledge.label,
      quantity: 1,
      confidence: label === 'unknown electronics part' ? 'low' : knowledge.confidence,
      evidence: label === 'unknown electronics part'
        ? 'No known beginner part keywords were detected.'
        : `Matched "${label}" from the description or image analysis.`,
      safetyNotes: knowledge.safetyNotes,
      status: 'candidate',
      source: 'photo',
      ...(isSafetySensitiveLabel(label) ? { safetySensitive: true } : {}),
    }
  })
}

function candidateFromRaw(raw: RawCandidate, index: number): PhotoCandidate | null {
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (!label) return null
  const knowledge = lookupPartKnowledge(label)
  const confidence = normalizeConfidence(raw.confidence) ?? knowledge.confidence
  const safetyNotes = Array.isArray(raw.safetyNotes)
    ? raw.safetyNotes.filter((note): note is string => typeof note === 'string')
    : knowledge.safetyNotes
  return {
    id: `candidate-${index + 1}-${knowledge.id}`,
    label: knowledge.label,
    quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? Math.min(99, Math.floor(raw.quantity)) : 1,
    confidence,
    evidence: typeof raw.evidence === 'string' ? raw.evidence : `Image analysis suggested "${label}".`,
    safetyNotes,
    status: 'candidate',
    source: 'photo',
    ...(isSafetySensitiveLabel(label) || safetyNotes.some((note) => isSafetySensitiveLabel(note)) ? { safetySensitive: true } : {}),
  }
}

function normalizeConfidence(value: unknown): PartConfidence | null {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  if (typeof value === 'number') return value >= 0.75 ? 'high' : value >= 0.45 ? 'medium' : 'low'
  return null
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const firstObj = text.indexOf('{')
  const firstArray = text.indexOf('[')
  const start = firstArray >= 0 && (firstObj === -1 || firstArray < firstObj) ? firstArray : firstObj
  if (start === -1) return null
  const end = text.lastIndexOf(text[start] === '[' ? ']' : '}')
  return end > start ? text.slice(start, end + 1) : null
}

function isSafetySensitiveLabel(value: string): boolean {
  return /(safety-sensitive|power part|relay|motor driver|battery|lithium|li-?ion|mains|power supply|charger|capacitor bank|high current|heat)/i.test(value)
}
