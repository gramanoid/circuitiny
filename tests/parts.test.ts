import { describe, expect, it } from 'vitest'
import { candidatesFromDescription, parsePhotoCandidates } from '../src/parts/photoAnalysis'
import { createExaPartsProvider, photoAnalysisProvider } from '../src/parts/providers'
import { detectSourceConflicts, lookupPartKnowledge, lookupPartKnowledgeWithWeb, rankExaResults, rankSourceUrl } from '../src/parts/retrieval'
import { recommendProjectsFromInventory } from '../src/parts/recommendations'

describe('parts photo analysis', () => {
  it('parses Codex JSON candidates and keeps safety notes', () => {
    const candidates = parsePhotoCandidates(`{
      "candidates": [
        { "label": "red LED", "quantity": 2, "confidence": "high", "evidence": "clear dome", "safetyNotes": ["Use a resistor."] }
      ]
    }`)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      label: 'LED 5mm Red',
      quantity: 2,
      confidence: 'high',
      status: 'candidate',
      source: 'photo',
    })
    expect(candidates[0].safetyNotes).toContain('Use a resistor.')
  })

  it('falls back to beginner keyword extraction', () => {
    const candidates = candidatesFromDescription('I have a small OLED screen, a button, and a 220 ohm resistor')
    expect(candidates.map((c) => c.label)).toEqual([
      '220 ohm resistor',
      'Push Button 6mm',
      'SSD1306 OLED I2C display',
    ])
  })

  it('returns a low-confidence unknown part when nothing matches', () => {
    const candidates = candidatesFromDescription('mystery blue board with no labels')
    expect(candidates[0]).toMatchObject({
      label: 'unknown electronics part',
      confidence: 'low',
    })
  })

  it('marks hazardous-looking parts as safety-sensitive', () => {
    const candidates = candidatesFromDescription('relay board next to a lithium battery charger')
    expect(candidates.some((candidate) => candidate.safetySensitive)).toBe(true)
    expect(candidates.find((candidate) => candidate.safetySensitive)?.safetyNotes.join(' ')).toMatch(/review/i)
  })

  it('can be called through the photo provider interface', () => {
    const candidates = photoAnalysisProvider.analyzeText('button and led')
    expect(candidates.map((candidate) => candidate.label)).toContain('Push Button 6mm')
  })
})

describe('parts retrieval', () => {
  it('matches local catalog before curated records', () => {
    const part = lookupPartKnowledge('red led')
    expect(part.source).toBe('local-catalog')
    expect(part.catalogMatchId).toBe('led-5mm-red')
    expect(part.reviewRequired).toBe(false)
  })

  it('matches curated beginner parts when local catalog has no exact component', () => {
    const part = lookupPartKnowledge('plant moisture sensor')
    expect(part.source).toBe('curated-db')
    expect(part.id).toBe('capacitive-soil-moisture-sensor')
    expect(part.reviewRequired).toBe(true)
  })

  it('returns local close matches instead of silently choosing fuzzy parts', () => {
    const part = lookupPartKnowledge('ledd')
    expect(part.source).toBe('manual')
    expect(part.closeMatches?.map((match) => match.componentId)).toContain('led-5mm-red')
    expect(part.reviewRequired).toBe(true)
  })

  it('ranks datasheets and vendor pages above forum sources', () => {
    const ranked = rankExaResults([
      { title: 'forum', url: 'https://forum.example.test/part', highlights: [] },
      { title: 'datasheet', url: 'https://example.test/abc-datasheet.pdf', highlights: [] },
      { title: 'vendor', url: 'https://www.digikey.com/en/products/detail/example', highlights: [] },
    ])
    expect(ranked[0].title).toBe('datasheet')
    expect(rankSourceUrl(ranked[0].url).kind).toBe('datasheet')
  })

  it('adds low-trust web source links for unknown parts', async () => {
    const part = await lookupPartKnowledgeWithWeb('rare xyz sensor', async () => [
      {
        title: 'XYZ sensor datasheet',
        url: 'https://example.test/xyz-datasheet.pdf',
        highlights: ['VCC is listed as 3.3 V on the datasheet.'],
      },
    ])
    expect(part.source).toBe('exa-web')
    expect(part.sourceLinks).toEqual(['https://example.test/xyz-datasheet.pdf'])
    expect(part.retrievedAt).toBeTruthy()
    expect(part.reviewRequired).toBe(true)
  })

  it('surfaces simple source conflicts from web highlights', () => {
    const conflicts = detectSourceConflicts([
      { title: 'A', url: 'https://example.test/a', highlights: ['Use 3.3V logic.'] },
      { title: 'B', url: 'https://example.test/b', highlights: ['Some modules use 5V VCC.'] },
    ])
    expect(conflicts[0]).toMatch(/3\.3V and 5V/)
  })

  it('supports mocked Exa provider lookup without network', async () => {
    const provider = createExaPartsProvider(async () => [
      { title: 'datasheet', url: 'https://example.test/part-datasheet.pdf', highlights: ['Pinout lists VCC, GND, OUT.'] },
    ])
    const part = await provider.lookup('unknown board')
    expect(part.source).toBe('exa-web')
    expect(part.sourceLinks[0]).toContain('datasheet')
  })
})

describe('project recommendations', () => {
  it('recommends build-now blink project when LED and resistor are confirmed', () => {
    const led = lookupPartKnowledge('led')
    const resistor = lookupPartKnowledge('220 ohm resistor')
    const ideas = recommendProjectsFromInventory([led, resistor])
    expect(ideas[0]).toMatchObject({
      id: 'blink-led',
      fit: 'build-now',
      templateId: 'blink-led',
    })
  })

  it('shows missing companion parts for beginner projects', () => {
    const led = lookupPartKnowledge('led')
    const ideas = recommendProjectsFromInventory([led])
    const blink = ideas.find((idea) => idea.id === 'blink-led')
    expect(blink?.fit).toBe('missing-parts')
    expect(blink?.missingParts.map((part) => part.componentId)).toContain('resistor-220r')
  })

  it('keeps safer beginner projects above motor projects when both are possible', () => {
    const ideas = recommendProjectsFromInventory([
      lookupPartKnowledge('led'),
      lookupPartKnowledge('220 ohm resistor'),
      lookupPartKnowledge('servo'),
    ])
    expect(ideas[0].id).toBe('blink-led')
    expect(ideas.find((idea) => idea.id === 'servo-pointer')?.score).toBeLessThan(ideas[0].score)
  })

  it('can re-rank with a novelty preference while preserving safety notes', () => {
    const ideas = recommendProjectsFromInventory([
      lookupPartKnowledge('led'),
      lookupPartKnowledge('220 ohm resistor'),
      lookupPartKnowledge('button'),
    ], { novelty: 'higher' })
    expect(ideas[0].concepts.length).toBeGreaterThan(0)
    expect(ideas[0].safetyNotes.length).toBeGreaterThan(0)
  })
})
