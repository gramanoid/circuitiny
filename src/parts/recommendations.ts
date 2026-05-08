import type { CompanionPart, InventoryItem, PartKnowledgeRecord, ProjectRecommendation } from './types'

type ProjectIdea = {
  id: string
  title: string
  concepts: string[]
  required: string[]
  optional?: CompanionPart[]
  safetyNotes: string[]
  why: string
  templateId?: string
  firstStep: string
  expectedSimulation: string
  safetyRisk?: 'normal' | 'caution'
}

const PROJECT_IDEAS: ProjectIdea[] = [
  {
    id: 'blink-led',
    title: 'Blink a status LED',
    concepts: ['GPIO output', 'current limiting', 'timer behavior'],
    required: ['indicator', 'resistor'],
    safetyNotes: ['Use a resistor in series with the LED.'],
    why: 'This is the smallest useful ESP32 circuit and gives immediate visual feedback.',
    templateId: 'blink-led',
    firstStep: 'Place an LED and 220 ohm resistor, then wire GPIO16 through the resistor to the LED.',
    expectedSimulation: 'The simulated LED toggles on and off every second.',
  },
  {
    id: 'button-led',
    title: 'Button-controlled LED',
    concepts: ['digital input', 'pull-up/pull-down', 'conditional behavior'],
    required: ['indicator', 'resistor', 'input'],
    safetyNotes: ['Do not connect an input pin directly to 5V.'],
    why: 'You learn both input and output in one circuit.',
    templateId: 'button-led',
    firstStep: 'Wire the button to a safe GPIO and ground, then use it to control the LED.',
    expectedSimulation: 'Pressing the simulated button changes the LED state.',
  },
  {
    id: 'plant-thirst-meter',
    title: 'Plant thirst meter',
    concepts: ['analog input', 'sensor calibration', 'thresholds'],
    required: ['analog sensor', 'indicator'],
    optional: [{ componentId: 'resistor-220r', quantity: 1, reason: 'Protects the LED indicator.' }],
    safetyNotes: ['Use a 3.3V-compatible moisture sensor module.'],
    why: 'It turns a sensor reading into a practical alert.',
    firstStep: 'Read the sensor value first, then decide what value means dry soil.',
    expectedSimulation: 'The indicator changes when the simulated sensor crosses a dry threshold.',
  },
  {
    id: 'motion-night-light',
    title: 'Motion night light',
    concepts: ['digital sensor', 'event trigger', 'output control'],
    required: ['digital sensor', 'indicator', 'resistor'],
    safetyNotes: ['Confirm the motion sensor output is 3.3V-safe.'],
    why: 'It feels like a real smart-home project while staying beginner friendly.',
    firstStep: 'Wire the PIR OUT pin to a safe GPIO and turn the LED on when motion is detected.',
    expectedSimulation: 'A motion input event turns the LED on for a short period.',
  },
  {
    id: 'tiny-dashboard',
    title: 'Tiny OLED dashboard',
    concepts: ['I2C', 'display output', 'status UI'],
    required: ['display'],
    safetyNotes: ['Use 3.3V logic or level shifting for I2C.'],
    why: 'A display makes invisible sensor values easier to understand.',
    firstStep: 'Wire VCC, GND, SDA, and SCL, then show one short line of text.',
    expectedSimulation: 'The display shows a short status message in the circuit state.',
  },
  {
    id: 'servo-pointer',
    title: 'Servo pointer',
    concepts: ['PWM', 'external power', 'motion control'],
    required: ['motor'],
    safetyNotes: ['Use separate power for the servo and share ground with the ESP32.'],
    why: 'It introduces movement while teaching why motors need careful power handling.',
    firstStep: 'Power the servo safely, connect signal to a PWM-capable GPIO, and sweep slowly.',
    expectedSimulation: 'The servo angle changes slowly when PWM output changes.',
    safetyRisk: 'caution',
  },
]

export type RecommendationOptions = {
  novelty?: 'normal' | 'higher'
}

export function recommendProjectsFromInventory(
  parts: Array<InventoryItem | PartKnowledgeRecord>,
  options: RecommendationOptions = {}
): ProjectRecommendation[] {
  const families = new Set(parts.map((part) => ('knowledge' in part ? part.knowledge.family : part.family).toLowerCase()))
  const labels = new Set(parts.map((part) => ('knowledge' in part ? part.knowledge.label : part.label).toLowerCase()))
  return PROJECT_IDEAS.map((idea) => toRecommendation(idea, families, labels, options))
    .filter((rec) => rec.usedParts.length > 0 || rec.missingParts.length <= 2)
    .sort((a, b) => b.score - a.score)
}

function toRecommendation(
  idea: ProjectIdea,
  families: Set<string>,
  labels: Set<string>,
  options: RecommendationOptions
): ProjectRecommendation {
  const usedParts = idea.required.filter((family) => hasFamily(families, family))
  const missingFamilies = idea.required.filter((family) => !hasFamily(families, family))
  const missingParts = [
    ...missingFamilies.map((family): CompanionPart => ({ componentId: familyToPartId(family), quantity: 1, reason: `Needed for ${idea.title}.` })),
    ...(idea.optional ?? []).filter((part) => !labels.has(part.componentId.toLowerCase())),
  ]
  const buildNow = missingFamilies.length === 0
  const safetyPenalty = idea.safetyRisk === 'caution' ? 18 : 0
  const noveltyBonus = options.novelty === 'higher' ? idea.concepts.length * 3 + (idea.id === 'blink-led' ? 0 : 8) : 0
  return {
    id: idea.id,
    title: idea.title,
    difficulty: idea.id === 'servo-pointer' ? 'intermediate' : 'beginner',
    fit: buildNow ? 'build-now' : 'missing-parts',
    score: usedParts.length * 20 - missingParts.length * 8 + (buildNow ? 20 : 0) + idea.concepts.length + noveltyBonus - safetyPenalty,
    concepts: idea.concepts,
    usedParts,
    missingParts,
    safetyNotes: idea.safetyNotes,
    why: idea.why,
    templateId: idea.templateId,
    firstStep: idea.firstStep,
    expectedSimulation: idea.expectedSimulation,
  }
}

function hasFamily(families: Set<string>, required: string): boolean {
  if (families.has(required)) return true
  if (required === 'indicator') return families.has('led') || families.has('indicator')
  if (required === 'input') return families.has('button') || families.has('input')
  if (required === 'digital sensor') return families.has('digital sensor') || families.has('sensor')
  if (required === 'analog sensor') return families.has('analog sensor') || families.has('sensor')
  return false
}

function familyToPartId(family: string): string {
  switch (family) {
    case 'indicator': return 'led-5mm-red'
    case 'resistor': return 'resistor-220r'
    case 'input': return 'button-6mm'
    case 'display': return 'ssd1306-oled-i2c'
    case 'analog sensor': return 'capacitive-soil-moisture-sensor'
    case 'digital sensor': return 'pir-motion-sensor'
    case 'motor': return 'sg90-servo'
    default: return family.replace(/\s+/g, '-')
  }
}
