import { lookupPartKnowledge, normalizePartQuery } from '../parts/retrieval'
import type { PartKnowledgeRecord } from '../parts/types'
import { identifyPart, type DatasheetSource, type PartIdentity } from './datasheets'

export interface DatasheetSourceAdapter {
  id: string
  label: string
  /** query is normalized with normalizePartQuery before adapter dispatch. */
  sourcesFor(query: string, knowledge: PartKnowledgeRecord): DatasheetSource[]
}

interface StarterDatasheetFixture {
  ids: string[]
  aliases: string[]
  source: Omit<DatasheetSource, 'retrievedAt'>
}

const STARTER_RETRIEVED_AT = '2026-05-09T00:00:00.000Z'

const STARTER_DATASHEET_FIXTURES: StarterDatasheetFixture[] = [
  {
    ids: ['led-5mm-red'],
    aliases: ['led', 'red led', '5mm led'],
    source: {
      url: 'fixture://starter/led-5mm-red',
      title: 'Starter fixture: 5mm red LED datasheet notes',
      vendor: 'Circuitiny fixture',
      licenseNote: 'fixture local test source',
      text: 'Pins: anode cathode. Forward voltage 1.8V to 2.2V. Use a series resistor for current limit. Observe polarity: anode is positive and cathode is negative.',
    },
  },
  {
    ids: ['resistor-220r'],
    aliases: ['220 resistor', '220 ohm resistor', 'resistor'],
    source: {
      url: 'fixture://starter/resistor-220r',
      title: 'Starter fixture: 220 ohm resistor notes',
      vendor: 'Circuitiny fixture',
      licenseNote: 'fixture local test source',
      text: 'Pins: in out. Passive resistor for current limiting. Common companion part for LED circuits. No polarity.',
    },
  },
  {
    ids: ['button-6mm'],
    aliases: ['button', 'push button', 'tactile switch'],
    source: {
      url: 'fixture://starter/button-6mm',
      title: 'Starter fixture: 6mm tactile push button notes',
      vendor: 'Circuitiny fixture',
      licenseNote: 'fixture local test source',
      text: 'Pins: A B C D. Push button connects opposite legs when pressed. Check orientation across the breadboard gap.',
    },
  },
  {
    ids: ['buzzer-active', 'buzzer-passive'],
    aliases: ['buzzer', 'active buzzer', 'passive buzzer'],
    source: {
      url: 'fixture://starter/buzzer-module',
      title: 'Starter fixture: buzzer module notes',
      vendor: 'Circuitiny fixture',
      licenseNote: 'fixture local test source',
      text: 'Pins: VCC GND SIG. Supply voltage 3.3V to 5V. Use a transistor driver for larger buzzers and check active versus passive buzzer behavior.',
    },
  },
  {
    ids: ['hc-sr04-ultrasonic'],
    aliases: ['hc-sr04', 'ultrasonic sensor'],
    source: {
      url: 'fixture://starter/hc-sr04-ultrasonic',
      title: 'Starter fixture: HC-SR04 ultrasonic module notes',
      vendor: 'Circuitiny fixture',
      licenseNote: 'fixture local test source',
      text: 'Pins: VCC Trig Echo GND. Supply voltage 5V. Echo can be 5V, so use a divider before ESP32 GPIO.',
    },
  },
  {
    ids: ['ssd1306-oled-i2c'],
    aliases: ['ssd1306', 'oled display', 'i2c display'],
    source: {
      url: 'fixture://starter/ssd1306-oled-i2c',
      title: 'Starter fixture: SSD1306 I2C OLED notes',
      vendor: 'Circuitiny fixture',
      licenseNote: 'fixture local test source',
      text: 'Pins: VCC GND SDA SCL. Supply voltage 3.3V to 5V. I2C module may require pull-up resistors.',
    },
  },
]

export const starterDatasheetAdapter: DatasheetSourceAdapter = {
  id: 'starter-fixture-datasheets',
  label: 'Circuitiny starter datasheet fixtures',
  sourcesFor(query, knowledge) {
    const fixture = STARTER_DATASHEET_FIXTURES.find((candidate) =>
      candidate.ids.includes(knowledge.id) ||
      candidate.aliases.some((alias) => aliasMatchesQuery(query, alias)),
    )
    return fixture ? [withRetrievedAt(fixture.source)] : []
  },
}

function aliasMatchesQuery(normalizedQuery: string, alias: string): boolean {
  const normalizedAlias = normalizePartQuery(alias)
  if (!normalizedQuery || !normalizedAlias) return false
  if (normalizedQuery === normalizedAlias) return true
  // Fuzzy by design: starter aliases may be a subset of a learner's longer request.
  const queryTokens = new Set(tokens(normalizedQuery))
  const aliasTokens = tokens(normalizedAlias)
  const aliasTokenSet = new Set(aliasTokens)
  return (aliasTokens.length > 0 && aliasTokens.every((token: string) => queryTokens.has(token))) ||
    (queryTokens.size > 0 && Array.from(queryTokens).every((token) => aliasTokenSet.has(token)))
}

function tokens(value: string): string[] {
  return value.split(/[^a-z0-9]+/).filter(Boolean)
}

export function starterDatasheetSources(
  query: string,
  lookup: (normalizedQuery: string) => PartKnowledgeRecord = lookupPartKnowledge,
  adapter: DatasheetSourceAdapter = starterDatasheetAdapter,
): DatasheetSource[] {
  const normalized = normalizePartQuery(query)
  const knowledge = lookup(normalized)
  return adapter.sourcesFor(normalized, knowledge)
}

export function identifyPartWithStarterSources(
  query: string,
  lookup: (normalizedQuery: string) => PartKnowledgeRecord = lookupPartKnowledge,
  adapter: DatasheetSourceAdapter = starterDatasheetAdapter,
): PartIdentity {
  const normalized = normalizePartQuery(query)
  const knowledge = lookup(normalized)
  return identifyPart(query, adapter.sourcesFor(normalized, knowledge), () => knowledge)
}

function withRetrievedAt(source: Omit<DatasheetSource, 'retrievedAt'>): DatasheetSource {
  return {
    ...source,
    retrievedAt: STARTER_RETRIEVED_AT,
  }
}
