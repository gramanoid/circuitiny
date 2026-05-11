import type { PinType } from '../project/schema'
import type { CatalogRenderStrategy } from '../project/component'

export type RecipeStepKind = 'overview' | 'wire' | 'simulate' | 'code' | 'build' | 'hardware' | 'experiment'

export interface RecipePart {
  componentId: string
  quantity: number
  why: string
}

/**
 * A concrete wire the learner should make.
 * `from` and `to` are Circuitiny pin refs in `instance.pinId` or `board.pinId` form,
 * for example `resistor1.out`, `led1.anode`, or `board.gnd_l`.
 */
export interface RecipeWiringStep {
  id: string
  from: string
  to: string
  title: string
  why: string
  expected: string
}

export type RecipeCheckpointKind = 'drc' | 'simulation' | 'code' | 'build' | 'hardware'

export interface RecipeCheckpoint {
  id: string
  kind: RecipeCheckpointKind
  title: string
  expected: string
  behaviorId?: string
  afterMs?: number
  requiresInput?: string
}

export interface RecipeGuideStep {
  id: string
  kind: RecipeStepKind
  title: string
  body: string
  why: string
  action: string
  refs?: string[]
  wiringStepId?: string
  checkpointId?: string
}

/**
 * JSON-like recipe data. `verifiedRecipes.deepEqual` does not compare Map/Set
 * entries by value, so use arrays/records or serialize Map/Set fields first.
 */
export interface LearningRecipe {
  id: string
  goal: string
  estimatedTime: string
  concepts: string[]
  requiredParts: RecipePart[]
  wiringSteps: RecipeWiringStep[]
  checkpoints: RecipeCheckpoint[]
  hardwareNotes: string[]
  followUpExperiments: string[]
  steps: RecipeGuideStep[]
}

export type RecommendationConfidence = 'high' | 'medium' | 'low'
export type RenderStrategy = CatalogRenderStrategy
export type PartRecommendationSource = 'local-catalog' | 'draft-suggestion'

export interface CompanionPartRule {
  componentId: string
  quantity: number
  reason: string
}

export interface ImportantPinInfo {
  id: string
  label: string
  type: PinType
  why: string
}

export interface PartRecommendation {
  id: string
  label: string
  family: string
  source: PartRecommendationSource
  confidence: RecommendationConfidence
  explanation: string
  beginnerBuild: string
  catalogMatchId?: string
  requiredCompanions: CompanionPartRule[]
  voltageCaution?: string
  currentCaution?: string
  importantPins: ImportantPinInfo[]
  sourceLinks: string[]
  renderStrategy: RenderStrategy
  reviewRequired: boolean
}
