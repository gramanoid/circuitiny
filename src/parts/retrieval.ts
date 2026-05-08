import { catalog } from '../catalog'
import { CURATED_PARTS } from './curated'
import type { ExaSearchResult, PartCloseMatch, PartConfidence, PartKnowledgeRecord, PartSourceKind, PartSourceRank } from './types'

export type ExaSearchProvider = (query: string) => Promise<ExaSearchResult[]>

export function normalizePartQuery(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 300)
}

export function lookupPartKnowledge(query: string): PartKnowledgeRecord {
  const normalized = normalizePartQuery(query)
  const local = lookupLocalCatalog(normalized)
  if (local) return local
  const curated = lookupCurated(normalized)
  if (curated) return { ...curated, source: curated.catalogMatchId ? 'local-catalog' : 'curated-db' }
  const closeMatches = lookupLocalCatalogCloseMatches(normalized)
  return unknownPart(normalized || query, closeMatches)
}

export async function lookupPartKnowledgeWithWeb(
  query: string,
  provider?: ExaSearchProvider
): Promise<PartKnowledgeRecord> {
  const base = lookupPartKnowledge(query)
  if (base.source !== 'manual' || !provider) return base
  try {
    const results = rankExaResults(await provider(query))
    if (results.length === 0) return base
    const ranks = results.map((result) => rankSourceUrl(result.url))
    const confidence = confidenceFromRanks(ranks)
    const conflicts = detectSourceConflicts(results)
    return {
      ...base,
      source: 'exa-web',
      confidence,
      explanation: `Web sources mention this part; review the sources before wiring. ${results[0].highlights[0] ?? ''}`.trim(),
      sourceLinks: results.map((r) => r.url).filter(Boolean).slice(0, 5),
      sourceRanks: ranks.slice(0, 5),
      retrievedAt: new Date().toISOString(),
      safetyNotes: [
        ...base.safetyNotes,
        ...conflicts,
        'Web-derived metadata is not trusted yet; verify voltage, current, and pinout before hardware use.',
      ],
      reviewRequired: true,
    }
  } catch {
    return base
  }
}

export function rankExaResults(results: ExaSearchResult[]): ExaSearchResult[] {
  return [...results].sort((a, b) => {
    const ar = rankSourceUrl(a.url)
    const br = rankSourceUrl(b.url)
    return br.score - ar.score
  })
}

export function rankSourceUrl(url: string): PartSourceRank {
  const normalized = url.toLowerCase()
  if (/\.pdf($|[?#])|datasheet|data-sheet|technical[-_ ]?spec|reference-manual/.test(normalized)) {
    return { kind: 'datasheet', score: 100, confidence: 'medium', reason: 'Looks like a datasheet or technical specification.' }
  }
  if (/(digikey|mouser|sparkfun|adafruit|espressif|ti\.com|st\.com|microchip|analog\.com|nxp\.com|raspberrypi\.com)/.test(normalized)) {
    return { kind: 'vendor', score: 85, confidence: 'medium', reason: 'Comes from a vendor or manufacturer domain.' }
  }
  if (/(learn\.adafruit|docs\.arduino|randomnerdtutorials|instructables|hackster|github\.com)/.test(normalized)) {
    return { kind: 'tutorial', score: 60, confidence: 'low', reason: 'Looks like a tutorial or example project.' }
  }
  if (/(forum|reddit|stackexchange|stackoverflow|esp32\.com)/.test(normalized)) {
    return { kind: 'forum', score: 35, confidence: 'low', reason: 'Looks like a forum or discussion source.' }
  }
  return { kind: 'unknown', score: 20, confidence: 'low', reason: 'Source type is unknown.' }
}

export function confidenceFromRanks(ranks: PartSourceRank[]): PartConfidence {
  const best = ranks.reduce<PartSourceRank | null>((acc, rank) => !acc || rank.score > acc.score ? rank : acc, null)
  return best?.confidence ?? 'low'
}

export function detectSourceConflicts(results: ExaSearchResult[]): string[] {
  const text = results.flatMap((result) => result.highlights).join(' ').toLowerCase()
  const conflicts: string[] = []
  if (/\b3\.?3\s*v\b/.test(text) && /\b5\s*v\b/.test(text)) {
    conflicts.push('Sources mention both 3.3V and 5V. Verify the safe logic and power voltage before wiring.')
  }
  if (/\bvin\b/.test(text) && /\b3v3\b|\b3\.?3\s*v\b/.test(text)) {
    conflicts.push('Sources mix VIN and 3.3V power references. Check the module regulator before connecting power.')
  }
  return conflicts
}

function lookupLocalCatalog(query: string): PartKnowledgeRecord | null {
  for (const def of catalog.listComponents()) {
    const haystack = [def.id, def.name, def.family, def.category, def.docs?.notes].filter(Boolean).join(' ').toLowerCase()
    if (!haystack.includes(query) && !query.includes(def.id.toLowerCase()) && !query.includes(def.name.toLowerCase())) continue
    return {
      id: def.id,
      label: def.name,
      family: def.family ?? def.category,
      confidence: 'high',
      source: 'local-catalog',
      catalogMatchId: def.id,
      explanation: `${def.name} is already in the Circuitiny catalog.`,
      safetyNotes: def.power?.rail ? [`Use the ${def.power.rail.toUpperCase()} rail unless the datasheet says otherwise.`] : [],
      importantPins: def.pins.map((pin) => ({
        id: pin.id,
        label: pin.label,
        type: pin.type,
        why: `Catalog pin typed as ${pin.type}.`,
      })),
      requiredCompanions: [],
      sourceLinks: def.docs?.datasheetUrl ? [def.docs.datasheetUrl] : [],
      renderStrategy: catalog.getGlbUrl(def.id) || def.model ? 'catalog-glb' : 'primitive',
      reviewRequired: false,
    }
  }
  return null
}

function lookupLocalCatalogCloseMatches(query: string): PartCloseMatch[] {
  if (!query) return []
  return catalog.listComponents()
    .map((def) => {
      const candidates = [def.id, def.name, def.family, def.category].filter(Boolean).map((value) => String(value).toLowerCase())
      const bestDistance = Math.min(...candidates.map((candidate) => levenshtein(query, candidate)))
      const bestTokenMatch = candidates.some((candidate) => candidate.split(/[-_\s]+/).some((token) => token.length > 3 && query.includes(token)))
      const score = bestTokenMatch ? 0 : bestDistance
      return {
        componentId: def.id,
        label: def.name,
        confidence: score <= 2 ? 'medium' as const : 'low' as const,
        reason: bestTokenMatch ? 'Shares a distinctive word with your query.' : `Name is ${bestDistance} edits away from your query.`,
        score,
      }
    })
    .filter((match) => match.score <= Math.max(2, Math.ceil(query.length * 0.35)))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(({ score: _score, ...match }) => match)
}

function lookupCurated(query: string) {
  return CURATED_PARTS.find((part) => {
    const names = [part.id, part.label, part.family, ...part.synonyms].map((s) => s.toLowerCase())
    return names.some((name) => partNameMatches(query, name))
  }) ?? null
}

function partNameMatches(query: string, name: string): boolean {
  if (!query || !name) return false
  if (query === name) return true
  if (name.length <= 3) {
    const tokenPattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`, 'i')
    return tokenPattern.test(query)
  }
  return query.includes(name) || name.includes(query)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function unknownPart(query: string, closeMatches: PartCloseMatch[] = []): PartKnowledgeRecord {
  const label = query || 'Unknown part'
  const family = inferFamily(label)
  const safetySensitive = isSafetySensitive(label)
  return {
    id: label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'unknown-part',
    label,
    family,
    confidence: 'low',
    source: 'manual' satisfies PartSourceKind,
    explanation: closeMatches.length > 0
      ? 'Circuitiny found similar local catalog parts. Ask the learner to confirm the closest match before using it.'
      : 'Circuitiny does not know this part yet. Treat it as a draft until reviewed.',
    safetyNotes: [
      'Unknown parts need voltage, current, polarity, and pinout review before wiring hardware.',
      ...(safetySensitive ? ['This looks safety-sensitive. Do not recommend direct hardware wiring until reviewed.'] : []),
    ],
    importantPins: [],
    requiredCompanions: [],
    sourceLinks: [],
    closeMatches,
    renderStrategy: 'generic-block',
    reviewRequired: true,
  }
}

function inferFamily(value: string): string {
  const v = value.toLowerCase()
  if (/(led|light)/.test(v)) return 'indicator'
  if (/resistor/.test(v)) return 'resistor'
  if (/(button|switch)/.test(v)) return 'input'
  if (/(sensor|moisture|pir|temp)/.test(v)) return 'sensor'
  if (/(display|oled|screen)/.test(v)) return 'display'
  if (/(servo|motor|relay)/.test(v)) return 'actuator'
  if (/(battery|power|mains|charger|supply|capacitor bank)/.test(v)) return 'power'
  return 'unknown'
}

function isSafetySensitive(value: string): boolean {
  return /(safety-sensitive|power part|relay|motor driver|battery|lithium|li-?ion|mains|power supply|charger|capacitor bank|high current|heat)/i.test(value)
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}
