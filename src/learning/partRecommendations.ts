import { catalog } from '../catalog'
import type { ComponentDef } from '../project/component'
import type { PartRecommendation, CompanionPartRule } from './types'

type IntentRule = {
  id: string
  match: RegExp
  label: string
  family: string
  localIds: string[]
  draft?: {
    id: string
    label: string
    explanation: string
    pins: PartRecommendation['importantPins']
    voltageCaution?: string
    renderStrategy?: PartRecommendation['renderStrategy']
  }
  beginnerBuild: string
}

type CompanionRuleConfig = {
  families?: string[]
  pinTypesAny?: string[]
  companion: CompanionPartRule
}

const DEFAULT_COMPANION_RULES: CompanionRuleConfig[] = [
  {
    families: ['led'],
    companion: { componentId: 'resistor-220r', quantity: 1, reason: 'A series resistor protects the LED and ESP32 GPIO from too much current.' },
  },
  {
    pinTypesAny: ['i2c_sda', 'i2c_scl'],
    companion: { componentId: 'resistor-4k7', quantity: 2, reason: 'I2C often needs pull-up resistors on SDA and SCL unless the module already has them.' },
  },
  {
    pinTypesAny: ['analog_in', 'analog_out'],
    companion: { componentId: 'capacitor-100nf', quantity: 1, reason: 'A decoupling capacitor helps reduce noise on analog sensor power.' },
  },
  {
    families: ['relay', 'motor', 'solenoid'],
    companion: { componentId: 'flyback-diode', quantity: 1, reason: 'Inductive loads need a flyback diode to absorb voltage spikes.' },
  },
]

const INTENT_RULES: IntentRule[] = [
  {
    id: 'blink-light',
    match: /\b(led|light|blink|lamp|status)\b/i,
    label: 'LED output',
    family: 'indicator',
    localIds: ['led-5mm-red'],
    beginnerBuild: 'Start with one LED, one 220 ohm resistor, and a timer behavior.',
  },
  {
    id: 'button-input',
    match: /\b(button|press|switch|click|input)\b/i,
    label: 'Push button input',
    family: 'input',
    localIds: ['button-6mm'],
    beginnerBuild: 'Start with one push button that toggles or controls an LED.',
  },
  {
    id: 'plant-water',
    match: /\b(plant|soil|moisture|water|watering|dry)\b/i,
    label: 'Soil moisture sensor',
    family: 'analog sensor',
    localIds: [],
    beginnerBuild: 'Start by reading one analog moisture value and logging wet versus dry readings.',
    draft: {
      id: 'capacitive-soil-moisture-sensor',
      label: 'Capacitive Soil Moisture Sensor',
      explanation: 'This sensor estimates soil moisture by outputting an analog voltage the ESP32 can read.',
      voltageCaution: 'Use a 3.3V-compatible capacitive sensor module for ESP32 GPIO safety.',
      renderStrategy: 'primitive',
      pins: [
        { id: 'vcc', label: 'VCC', type: 'power_in', why: 'Powers the sensor from 3V3.' },
        { id: 'gnd', label: 'GND', type: 'ground', why: 'Completes the circuit ground reference.' },
        { id: 'aout', label: 'AOUT', type: 'analog_out', why: 'Carries the moisture voltage to an ESP32 analog input.' },
      ],
    },
  },
  {
    id: 'temperature',
    match: /\b(temp|temperature|humidity|dht|weather)\b/i,
    label: 'Temperature and humidity sensor',
    family: 'digital sensor',
    localIds: [],
    beginnerBuild: 'Start by reading a sensor value and printing it in the serial monitor.',
    draft: {
      id: 'dht22-sensor',
      label: 'DHT22 Temperature/Humidity Sensor',
      explanation: 'This sensor reports temperature and humidity over one digital data pin.',
      voltageCaution: 'Power the module from 3V3 if the board GPIO is connected directly to DATA.',
      renderStrategy: 'primitive',
      pins: [
        { id: 'vcc', label: 'VCC', type: 'power_in', why: 'Powers the sensor.' },
        { id: 'data', label: 'DATA', type: 'digital_io', why: 'One-wire style data signal to the ESP32.' },
        { id: 'gnd', label: 'GND', type: 'ground', why: 'Shared ground reference.' },
      ],
    },
  },
  {
    id: 'display',
    match: /\b(display|screen|oled|show|text)\b/i,
    label: 'Small OLED display',
    family: 'display',
    localIds: [],
    beginnerBuild: 'Start by showing one short message over I2C.',
    draft: {
      id: 'ssd1306-oled-i2c',
      label: 'SSD1306 OLED I2C Display',
      explanation: 'A small display module that uses two I2C signal wires plus power and ground.',
      voltageCaution: 'Use a display module that supports 3.3V logic or includes level shifting.',
      renderStrategy: 'primitive',
      pins: [
        { id: 'vcc', label: 'VCC', type: 'power_in', why: 'Powers the display.' },
        { id: 'gnd', label: 'GND', type: 'ground', why: 'Shared ground reference.' },
        { id: 'sda', label: 'SDA', type: 'i2c_sda', why: 'I2C data line.' },
        { id: 'scl', label: 'SCL', type: 'i2c_scl', why: 'I2C clock line.' },
      ],
    },
  },
  {
    id: 'motion',
    match: /\b(motion|movement|pir|presence)\b/i,
    label: 'PIR motion sensor',
    family: 'digital sensor',
    localIds: [],
    beginnerBuild: 'Start by turning an LED on when motion output goes high.',
    draft: {
      id: 'pir-motion-sensor',
      label: 'PIR Motion Sensor',
      explanation: 'This module outputs a digital signal when it detects motion.',
      voltageCaution: 'Check the module output voltage; ESP32 GPIO expects 3.3V logic.',
      renderStrategy: 'primitive',
      pins: [
        { id: 'vcc', label: 'VCC', type: 'power_in', why: 'Powers the sensor module.' },
        { id: 'out', label: 'OUT', type: 'digital_out', why: 'Goes high or low when motion is detected.' },
        { id: 'gnd', label: 'GND', type: 'ground', why: 'Shared ground reference.' },
      ],
    },
  },
]

const BEGINNER_FALLBACK_RULE_IDS = new Set(['blink-light', 'button-input'])
const MAX_GOAL_LENGTH = 300

export function recommendParts(goal: string): PartRecommendation[] {
  const text = goal.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_GOAL_LENGTH)
  const matched = INTENT_RULES.filter((rule) => rule.match.test(text))
  const rules = matched.length > 0
    ? matched
    : INTENT_RULES.filter((rule) => BEGINNER_FALLBACK_RULE_IDS.has(rule.id))
  return rules.flatMap((rule) => recommendationsForRule(rule))
}

function recommendationsForRule(rule: IntentRule): PartRecommendation[] {
  const localMatches = rule.localIds
    .map((id) => catalog.getComponent(id))
    .filter((def): def is ComponentDef => !!def)
    .map((def) => fromCatalog(rule, def))

  if (localMatches.length > 0) return localMatches
  if (!rule.draft) return []

  return [{
    id: rule.draft.id,
    label: rule.draft.label,
    family: rule.family,
    source: 'draft-suggestion',
    confidence: 'medium',
    explanation: rule.draft.explanation,
    beginnerBuild: rule.beginnerBuild,
    requiredCompanions: companionsFor({ id: rule.draft.id, family: rule.family }, rule.draft.pins.map((p) => p.type)),
    voltageCaution: rule.draft.voltageCaution,
    importantPins: rule.draft.pins,
    sourceLinks: [],
    renderStrategy: rule.draft.renderStrategy ?? 'generic-block',
    reviewRequired: true,
  }]
}

function fromCatalog(rule: IntentRule, def: ComponentDef): PartRecommendation {
  return {
    id: def.id,
    label: def.name,
    family: rule.family,
    source: 'local-catalog',
    confidence: 'high',
    explanation: `${def.name} is already in the Circuitiny catalog, so it can be added and rendered immediately.`,
    beginnerBuild: rule.beginnerBuild,
    catalogMatchId: def.id,
    requiredCompanions: companionsFor(def, def.pins.map((p) => p.type)),
    voltageCaution: def.power?.rail ? `Power from the ${def.power.rail.toUpperCase()} rail unless the part notes say otherwise.` : undefined,
    currentCaution: def.power?.current_ma ? `Estimated current draw: ${def.power.current_ma} mA.` : undefined,
    importantPins: def.pins.map((p) => ({
      id: p.id,
      label: p.label,
      type: p.type,
      why: pinWhy(p.type),
    })),
    sourceLinks: def.docs?.datasheetUrl ? [def.docs.datasheetUrl] : [],
    renderStrategy: catalog.getGlbUrl(def.id) || def.model ? 'catalog-glb' : 'primitive',
    reviewRequired: false,
  }
}

function companionsFor(component: Pick<ComponentDef, 'id' | 'family'>, pinTypes: string[]): CompanionPartRule[] {
  const family = componentFamily(component)
  const matched = DEFAULT_COMPANION_RULES
    .filter((rule) => hasCompanionConstraint(rule) && matchesFamily(rule, family) && matchesPinTypes(rule, pinTypes))
    .map((rule) => ({ ...rule.companion }))
  const seen = new Set<string>()
  return matched.filter((companion) => {
    if (seen.has(companion.componentId)) return false
    seen.add(companion.componentId)
    return true
  })
}

function hasCompanionConstraint(rule: CompanionRuleConfig): boolean {
  return !!rule.families?.length || !!rule.pinTypesAny?.length
}

function matchesFamily(rule: CompanionRuleConfig, family: string): boolean {
  return !rule.families || rule.families.includes(family)
}

function matchesPinTypes(rule: CompanionRuleConfig, pinTypes: string[]): boolean {
  return !rule.pinTypesAny || rule.pinTypesAny.some((type) => pinTypes.includes(type))
}

function componentFamily(component: Pick<ComponentDef, 'id' | 'family'>): string {
  if (component.family) return component.family.toLowerCase().trim()
  // Fallback convention: catalog component ids start with the family prefix, e.g. led-5mm-red.
  return component.id.toLowerCase().split(/[-_]+/)[0]
}

function pinWhy(type: string): string {
  switch (type) {
    case 'power_in': return 'Power input for the component.'
    case 'power_out': return 'Power supplied by the board.'
    case 'ground': return 'Shared electrical reference; every circuit needs ground.'
    case 'analog_in': return 'Reads a changing voltage.'
    case 'analog_out': return 'Outputs a changing voltage for the ESP32 to read.'
    case 'digital_in': return 'Receives an on/off signal.'
    case 'digital_out': return 'Sends an on/off signal.'
    case 'digital_io': return 'Can send or receive an on/off signal.'
    case 'i2c_sda': return 'I2C data signal.'
    case 'i2c_scl': return 'I2C clock signal.'
    default: return 'Signal pin for this component.'
  }
}
