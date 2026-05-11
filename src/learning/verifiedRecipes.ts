import type { LearningRecipe, RecipeCheckpointKind, RecipeStepKind } from './types'
import { listRecipes } from './recipes'

export type VerifiedEvidenceKind = RecipeCheckpointKind | 'project' | 'physical-drc' | 'reality-check' | 'serial-monitor' | 'manual'
export type VerifiedEvidenceState = 'pass' | 'fail' | 'missing' | 'blocked'
export type MilestoneStatus = 'locked' | 'ready' | 'complete' | 'blocked'

export interface VerifiedEvidence {
  kind: VerifiedEvidenceKind
  state: VerifiedEvidenceState
  title: string
  detail: string
}

export interface VerifiedMilestone {
  id: string
  title: string
  action: string
  why: string
  requiredEvidence: VerifiedEvidenceKind[]
  supportingEvidence: VerifiedEvidenceKind[]
  blockingEvidence: VerifiedEvidenceKind[]
  hints: string[]
  expectedObservation: string
}

export interface VerifiedRecipe {
  id: string
  goal: string
  concepts: string[]
  milestones: VerifiedMilestone[]
}

export interface MilestoneEvaluation {
  milestoneId: string
  status: MilestoneStatus
  propagatedFromBlocked?: boolean
  missingEvidence: VerifiedEvidenceKind[]
  blockingEvidence: VerifiedEvidence[]
  passedEvidence: VerifiedEvidence[]
  nextHint: string
}

export interface RecipeResumeSummary {
  completedCount: number
  totalCount: number
  currentMilestoneId: string | null
  message: string
  recheckActions: string[]
}

export type RecipeCodexAutonomyTier = 'explain-only' | 'draft-edit' | 'guided-edit' | 'hardware-gated'
export type RecipeTutorMode = 'celebrate' | 'explain' | 'suggest-fix' | 'perform-fix' | 'request-approval'

export interface RecipeTutorRecommendation {
  mode: RecipeTutorMode
  canPerform: boolean
  approvalRequired: boolean
  title: string
  detail: string
}

export interface RecipeFollowUpRecommendation {
  id: string
  title: string
  reason: string
  experiment: string
}

export type RecipeEvidenceEditKind = 'structural' | 'cosmetic'

export function shouldExpireManualEvidence(editKind: RecipeEvidenceEditKind): boolean {
  return editKind === 'structural'
}

export interface RecipeEvidenceChange {
  kind: RecipeEvidenceEditKind
  fields: string[]
}

export function classifyRecipeEvidenceEdit(previous: LearningRecipe, next: LearningRecipe): RecipeEvidenceChange {
  const fields = changedRecipeFields(previous, next)
  const structural = fields.filter(isStructuralRecipeField)
  return {
    kind: structural.length > 0 ? 'structural' : 'cosmetic',
    fields: structural.length > 0 ? structural : fields,
  }
}

export function manualEvidenceExpiresForRecipeChange(previous: LearningRecipe, next: LearningRecipe): boolean {
  return shouldExpireManualEvidence(classifyRecipeEvidenceEdit(previous, next).kind)
}

export function toVerifiedRecipe(recipe: LearningRecipe): VerifiedRecipe {
  const milestones = recipe.steps.map((step) => {
    const checkpoint = recipe.checkpoints.find((candidate) => candidate.id === step.checkpointId)
    const requiredEvidence = checkpoint ? [checkpoint.kind] : evidenceForStepKind(step.kind)
    const supportingEvidence: VerifiedEvidenceKind[] = step.kind === 'hardware' ? ['reality-check', 'serial-monitor'] : []
    const blockingEvidence = blockingEvidenceForStepKind(step.kind)
    return {
      id: step.id,
      title: step.title,
      action: step.action,
      why: step.why,
      requiredEvidence,
      supportingEvidence,
      blockingEvidence,
      hints: hintsForStep(step.kind, step.action),
      expectedObservation: checkpoint?.expected ?? step.body,
    }
  })
  return {
    id: recipe.id,
    goal: recipe.goal,
    concepts: recipe.concepts,
    milestones: dedupeMilestones([...milestones, ...physicalMilestonesForRecipe(recipe)], (kept, dropped) => {
      console.warn(`Skipped duplicate recipe milestone title "${dropped.title}" after "${kept.title}".`)
    }),
  }
}

export function listVerifiedRecipes(): VerifiedRecipe[] {
  return listRecipes().map(toVerifiedRecipe)
}

export function evaluateMilestone(
  milestone: VerifiedMilestone,
  evidence: VerifiedEvidence[],
  previousComplete: boolean,
  propagatedFromBlocked = false,
): MilestoneEvaluation {
  if (!previousComplete) {
    return {
      milestoneId: milestone.id,
      status: 'locked',
      propagatedFromBlocked,
      missingEvidence: milestone.requiredEvidence,
      blockingEvidence: [],
      passedEvidence: [],
      nextHint: 'Finish the previous milestone first so this step has the right context.',
    }
  }

  const blockingEvidence = evidence.filter((item) =>
    milestone.blockingEvidence.includes(item.kind) && (item.state === 'blocked' || item.state === 'fail'))
  const passedEvidence = evidence.filter((item) =>
    item.state === 'pass' && (milestone.requiredEvidence.includes(item.kind) || milestone.supportingEvidence.includes(item.kind)))
  const missingEvidence = milestone.requiredEvidence.filter((kind) =>
    !evidence.some((item) => item.kind === kind && item.state === 'pass'))

  const status: MilestoneStatus = blockingEvidence.length > 0
    ? 'blocked'
    : missingEvidence.length === 0
      ? 'complete'
      : 'ready'

  return {
    milestoneId: milestone.id,
    status,
    propagatedFromBlocked,
    missingEvidence,
    blockingEvidence,
    passedEvidence,
    nextHint: selectHint(milestone, status, missingEvidence, blockingEvidence),
  }
}

export function evaluateRecipeProgress(
  recipe: VerifiedRecipe,
  evidenceByMilestone: Record<string, VerifiedEvidence[]>,
): MilestoneEvaluation[] {
  const evaluations: MilestoneEvaluation[] = []
  for (const milestone of recipe.milestones) {
    const lastEvaluation = evaluations.at(-1)
    // evaluateMilestone receives false only until the prior MilestoneEvaluation completes;
    // blocked milestones remain visible/evaluable instead of becoming locked again.
    const canEvaluateNext = !lastEvaluation || lastEvaluation.status === 'complete' || lastEvaluation.status === 'blocked'
    evaluations.push(evaluateMilestone(
      milestone,
      evidenceByMilestone[milestone.id] ?? [],
      canEvaluateNext,
      lastEvaluation?.status === 'blocked',
    ))
  }
  return evaluations
}

export function progressiveMilestoneHints(
  milestone: VerifiedMilestone,
  evaluation: MilestoneEvaluation,
): string[] {
  const expected = `Expected observation: ${milestone.expectedObservation}`
  if (evaluation.status === 'locked') {
    return uniqueText([
      evaluation.nextHint,
      expected,
    ])
  }
  if (evaluation.status === 'complete') {
    return uniqueText([
      expected,
      'This proof step is complete. Keep the circuit unchanged before moving on.',
    ])
  }
  if (evaluation.blockingEvidence.length > 0) {
    return uniqueText([
      evaluation.blockingEvidence[0]?.detail ?? evaluation.nextHint,
      expected,
      ...milestone.hints,
    ])
  }
  return uniqueText([
    evaluation.missingEvidence.length > 0 ? `Missing proof: ${evaluation.missingEvidence.map(labelEvidenceKind).join(', ')}.` : evaluation.nextHint,
    expected,
    ...milestone.hints,
  ])
}

export function summarizeRecipeResume(
  recipe: VerifiedRecipe,
  evaluations: MilestoneEvaluation[],
): RecipeResumeSummary {
  const totalCount = recipe.milestones.length
  const completedCount = evaluations.filter((evaluation) => evaluation.status === 'complete').length
  const currentEvaluation = evaluations.find((evaluation) => evaluation.status !== 'complete') ?? null
  const currentMilestone = currentEvaluation
    ? recipe.milestones.find((milestone) => milestone.id === currentEvaluation.milestoneId) ?? null
    : null
  const completedMilestones = new Set(
    evaluations.filter((evaluation) => evaluation.status === 'complete').map((evaluation) => evaluation.milestoneId),
  )
  const completedEvidenceKinds = recipe.milestones
    .filter((milestone) => completedMilestones.has(milestone.id))
    .flatMap((milestone) => [...milestone.requiredEvidence, ...milestone.supportingEvidence])
  const recheckActions: string[] = []
  if (completedCount > 0 && completedCount < totalCount) {
    recheckActions.push('Rerun DRC before continuing so old wiring assumptions do not carry forward.')
  }
  if (completedEvidenceKinds.includes('simulation')) {
    recheckActions.push('Replay the simulation once and compare it with the expected observation.')
  }
  if (completedEvidenceKinds.some((kind) => kind === 'physical-drc' || kind === 'reality-check' || kind === 'hardware')) {
    recheckActions.push('Look at the real breadboard again before applying power.')
  }

  const message = totalCount === 0
    ? `No verified proof steps exist yet for ${recipe.goal}.`
    : completedCount === totalCount
      ? `All ${totalCount} proof step${totalCount === 1 ? '' : 's'} are complete for ${recipe.goal}.`
      : completedCount === 0
        ? `Starting ${recipe.goal}. Begin with "${currentMilestone?.title ?? 'the first proof step'}".`
        : `Resuming ${recipe.goal}: ${completedCount}/${totalCount} proof steps complete. Continue with "${currentMilestone?.title ?? 'the next proof step'}".`

  return {
    completedCount,
    totalCount,
    currentMilestoneId: currentMilestone?.id ?? null,
    message,
    recheckActions,
  }
}

export function codexTutorRecommendation(
  milestone: VerifiedMilestone,
  evaluation: MilestoneEvaluation,
  autonomyTier: RecipeCodexAutonomyTier,
): RecipeTutorRecommendation {
  if (evaluation.status === 'complete') {
    return {
      mode: 'celebrate',
      canPerform: false,
      approvalRequired: false,
      title: 'Proof complete',
      detail: 'Codex should explain what was proven and suggest the next learning step.',
    }
  }

  const activeEvidence = evaluation.blockingEvidence[0]?.kind ?? evaluation.missingEvidence[0] ?? milestone.requiredEvidence[0] ?? 'project'
  const learnerAction = actionForEvidence(activeEvidence)
  if (autonomyTier === 'explain-only') {
    return {
      mode: 'explain',
      canPerform: false,
      approvalRequired: false,
      title: 'Codex can explain',
      detail: `Codex can explain the ${labelEvidenceKind(activeEvidence)} issue, but cannot change the project in explain-only mode.`,
    }
  }

  if (requiresHardwareGate(activeEvidence) && autonomyTier !== 'hardware-gated') {
    return {
      mode: 'suggest-fix',
      canPerform: false,
      approvalRequired: true,
      title: 'Codex can suggest only',
      detail: `${labelEvidenceKind(activeEvidence)} needs hardware-gated approval before Codex can run ${learnerAction}.`,
    }
  }

  if (requiresApproval(activeEvidence)) {
    return {
      mode: 'request-approval',
      canPerform: true,
      approvalRequired: true,
      title: 'Codex needs approval',
      detail: `Codex may request ${learnerAction}, then must wait for your approval before continuing.`,
    }
  }

  return {
    mode: 'perform-fix',
    canPerform: true,
    approvalRequired: false,
    title: 'Codex can help fix',
    detail: `Codex may ${learnerAction}, then rerun the required proof before marking this milestone complete.`,
  }
}

export function recommendFollowUpExperiments(
  recipe: LearningRecipe,
  evaluations: MilestoneEvaluation[],
  mistakeHistory: VerifiedEvidence[] = [],
): RecipeFollowUpRecommendation[] {
  const recommendations: RecipeFollowUpRecommendation[] = []
  for (const [kind, count] of countRepeatedMistakes(mistakeHistory)) {
    if (count < 2) continue
    recommendations.push(remedialExperiment(kind, count))
  }

  const allComplete = evaluations.length > 0 && evaluations.every((evaluation) => evaluation.status === 'complete')
  if (allComplete) {
    recommendations.push(...recipe.followUpExperiments.map((experiment, index) => ({
      id: `authored-${index + 1}`,
      title: `Try next: ${experiment}`,
      reason: 'All required proof steps are complete, so this is a safe stretch experiment.',
      experiment,
    })))
  }

  return dedupeFollowUps(recommendations).slice(0, 4)
}

function evidenceForStepKind(kind: RecipeStepKind): VerifiedEvidenceKind[] {
  switch (kind) {
    case 'wire':
      return ['drc']
    case 'simulate':
      return ['simulation']
    case 'code':
      return ['code']
    case 'build':
      return ['build']
    case 'hardware':
      return ['build', 'manual']
    case 'overview':
    case 'experiment':
      return ['project']
    default:
      return assertNeverStepKind(kind)
  }
}

function blockingEvidenceForStepKind(kind: RecipeStepKind): VerifiedEvidenceKind[] {
  switch (kind) {
    case 'wire':
      return ['drc', 'physical-drc', 'reality-check']
    case 'simulate':
    case 'code':
    case 'overview':
    case 'experiment':
      return ['drc']
    case 'build':
      return ['drc', 'build']
    case 'hardware':
      return ['drc', 'physical-drc', 'reality-check', 'build', 'serial-monitor']
    default:
      return assertNeverStepKind(kind)
  }
}

// Recipes can merge authored steps with generated evidence gates. id/title are trimmed;
// whitespace-only ids fall back to title-only dedupe, and onTitleDuplicate receives
// the kept milestone first and the dropped milestone second.
function dedupeMilestones(
  milestones: VerifiedMilestone[],
  onTitleDuplicate?: (kept: VerifiedMilestone, dropped: VerifiedMilestone) => void,
): VerifiedMilestone[] {
  const seenIds = new Set<string>()
  const seenTitles = new Map<string, VerifiedMilestone>()
  const out: VerifiedMilestone[] = []
  for (const milestone of milestones) {
    // Trim before recording in seenIds/seenTitles; blank ids fall back to title-only dedupe.
    const id = milestone.id.trim()
    const title = milestone.title.trim().toLowerCase()
    if (!id && !title) {
      console.warn('Skipping verified recipe milestone with blank id and title.', { milestone })
      continue
    }

    const titleMatch = title ? seenTitles.get(title) : undefined
    const titleMatchId = titleMatch?.id.trim() ?? ''
    if (titleMatch && areCompatibleMilestoneIds(titleMatchId, id)) {
      onTitleDuplicate?.(titleMatch, milestone)
      continue
    }

    if (id) {
      if (seenIds.has(id)) continue
      seenIds.add(id)
    }

    if (title) seenTitles.set(title, milestone)
    out.push(milestone)
  }
  return out
}

function areCompatibleMilestoneIds(existingId: string, candidateId: string): boolean {
  return !existingId || !candidateId || existingId === candidateId
}

function physicalMilestonesForRecipe(recipe: LearningRecipe): VerifiedMilestone[] {
  if (recipe.wiringSteps.length === 0) return []
  return [{
    id: 'physical-reality-check',
    title: 'Check the real breadboard before power',
    action: 'Run Physical Breadboard checks and compare one learner-confirmed photo or wire list.',
    why: 'A circuit can be electrically valid in the schematic while the real jumper, rail, or LED direction is still wrong.',
    requiredEvidence: ['physical-drc'],
    supportingEvidence: ['reality-check'],
    blockingEvidence: ['drc', 'physical-drc', 'reality-check'],
    hints: [
      'Fix any physical DRC finding before plugging in the ESP32.',
      'Confirm jumper endpoints and polarized parts against the real board.',
    ],
    expectedObservation: 'Physical DRC passes, and Reality Check either confirms the visible wires or names what to fix.',
  }]
}

function hintsForStep(kind: string, action: string): string[] {
  const base = [`Focus on this action first: ${action}`]
  if (kind === 'wire') return [...base, 'Check the two endpoint labels before moving the jumper.', 'Run DRC after the wire is placed.']
  if (kind === 'simulate') return [...base, 'Start simulation and watch the expected output before touching hardware.']
  if (kind === 'build') return [...base, 'Read the first ESP-IDF error line before changing code.']
  if (kind === 'hardware') return [...base, 'Do a physical check before power, then flash only after you approve the port.']
  return base
}

function assertNeverStepKind(kind: never): never {
  throw new Error(`Unhandled recipe step kind: ${String(kind)}`)
}

function changedRecipeFields(previous: LearningRecipe, next: LearningRecipe): string[] {
  const fields: string[] = []
  if (!deepEqual(previous.wiringSteps, next.wiringSteps)) fields.push('wiringSteps')
  if (!deepEqual(previous.checkpoints, next.checkpoints)) fields.push('checkpoints')
  if (!deepEqual(previous.requiredParts, next.requiredParts)) fields.push('requiredParts')
  if (!deepEqual(previous.steps.map(stepStructuralFingerprint), next.steps.map(stepStructuralFingerprint))) fields.push('steps.behavior')
  if (previous.goal !== next.goal) fields.push('goal')
  if (previous.estimatedTime !== next.estimatedTime) fields.push('estimatedTime')
  if (!deepEqual(previous.concepts, next.concepts)) fields.push('concepts')
  if (!deepEqual(previous.hardwareNotes, next.hardwareNotes)) fields.push('hardwareNotes')
  if (!deepEqual(previous.followUpExperiments, next.followUpExperiments)) fields.push('followUpExperiments')
  if (!deepEqual(previous.steps.map(stepCosmeticFingerprint), next.steps.map(stepCosmeticFingerprint))) fields.push('steps.copy')
  return Array.from(new Set(fields))
}

// LearningRecipe data is JSON-like; cycles are guarded defensively, but this is
// not a strict graph comparator. In-progress cycle revisits are treated as equal
// for the same pair, while Map/Set entries are intentionally not compared.
// Use a stricter cycle-aware comparator if recipes ever gain graph, Map, or Set fields.
type DeepEqualPairState = 'in-progress' | 'equal'

function deepEqual(a: unknown, b: unknown, visitedPairs = new WeakMap<object, WeakMap<object, DeepEqualPairState>>()): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const aObject = a as object
  const bObject = b as object
  if (a instanceof Map || b instanceof Map || a instanceof Set || b instanceof Set) {
    console.warn('deepEqual encountered Map/Set values; LearningRecipe equality expects JSON-like data.')
    return false
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  const visitedForA = visitedPairs.get(aObject)
  const pairState = visitedForA?.get(bObject)
  if (pairState === 'equal') return true
  // Optimistic by design for JSON-like recipe DAGs; genuine cyclic graphs with
  // different cycle structure may compare equal and should use a stricter comparator.
  if (pairState === 'in-progress') return true
  if (visitedForA) {
    visitedForA.set(bObject, 'in-progress')
  } else {
    visitedPairs.set(aObject, new WeakMap([[bObject, 'in-progress']]))
  }
  const equal = Array.isArray(a) || Array.isArray(b)
    ? Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((entry, index) => deepEqual(entry, b[index], visitedPairs))
    : (() => {
        const aRecord = a as Record<string, unknown>
        const bRecord = b as Record<string, unknown>
        const aKeys = Object.keys(aRecord).sort()
        const bKeys = Object.keys(bRecord).sort()
        return deepEqual(aKeys, bKeys, visitedPairs) &&
          aKeys.every((key) => deepEqual(aRecord[key], bRecord[key], visitedPairs))
      })()
  const pairStates = visitedPairs.get(aObject)
  if (equal) {
    pairStates?.set(bObject, 'equal')
  } else {
    pairStates?.delete(bObject)
  }
  return equal
}

function isStructuralRecipeField(field: string): boolean {
  return field === 'wiringSteps' ||
    field === 'checkpoints' ||
    field === 'requiredParts' ||
    field === 'steps.behavior'
}

function stepStructuralFingerprint(step: LearningRecipe['steps'][number]): object {
  return {
    id: step.id,
    kind: step.kind,
    action: step.action,
    refs: step.refs ?? [],
    wiringStepId: step.wiringStepId ?? null,
    checkpointId: step.checkpointId ?? null,
  }
}

function stepCosmeticFingerprint(step: LearningRecipe['steps'][number]): object {
  return {
    id: step.id,
    title: step.title,
    body: step.body,
    why: step.why,
  }
}

function selectHint(
  milestone: VerifiedMilestone,
  status: MilestoneStatus,
  missingEvidence: VerifiedEvidenceKind[],
  blockingEvidence: VerifiedEvidence[],
): string {
  if (status === 'complete') return 'Milestone complete. Move to the next proof step.'
  if (blockingEvidence[0]) return blockingEvidence[0].detail
  const fallback = milestone.hints[0] ?? 'Review the current milestone.'
  if (missingEvidence[0]) return `Missing proof: ${missingEvidence[0]}. ${fallback}`
  return fallback
}

function labelEvidenceKind(kind: VerifiedEvidenceKind): string {
  switch (kind) {
    case 'drc':
      return 'DRC'
    case 'simulation':
      return 'simulation'
    case 'code':
      return 'code inspection'
    case 'build':
      return 'ESP-IDF build'
    case 'hardware':
      return 'hardware observation'
    case 'project':
      return 'project setup'
    case 'physical-drc':
      return 'physical breadboard check'
    case 'reality-check':
      return 'Reality Check'
    case 'serial-monitor':
      return 'serial monitor'
    case 'manual':
      return 'manual confirmation'
    default: {
      const _exhaustive: never = kind
      return String(_exhaustive)
    }
  }
}

function actionForEvidence(kind: VerifiedEvidenceKind): string {
  switch (kind) {
    case 'drc':
      return 'inspect and fix the schematic wiring'
    case 'physical-drc':
      return 'inspect and fix the breadboard layout'
    case 'simulation':
      return 'run simulation and inspect the behavior'
    case 'code':
      return 'inspect the generated code'
    case 'build':
      return 'run an ESP-IDF build'
    case 'hardware':
      return 'compare the real hardware with the expected observation'
    case 'reality-check':
      return 'run a Reality Check'
    case 'serial-monitor':
      return 'open the serial monitor'
    case 'manual':
      return 'ask you to confirm the real-world result'
    case 'project':
      return 'inspect the active project'
    default: {
      const _exhaustive: never = kind
      return String(_exhaustive)
    }
  }
}

function requiresHardwareGate(kind: VerifiedEvidenceKind): boolean {
  return kind === 'build' || kind === 'hardware' || kind === 'serial-monitor' || kind === 'manual'
}

function requiresApproval(kind: VerifiedEvidenceKind): boolean {
  return requiresHardwareGate(kind) || kind === 'reality-check'
}

function countRepeatedMistakes(evidence: VerifiedEvidence[]): Map<VerifiedEvidenceKind, number> {
  const counts = new Map<VerifiedEvidenceKind, number>()
  for (const item of evidence) {
    if (item.state !== 'blocked' && item.state !== 'fail') continue
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  }
  return counts
}

function remedialExperiment(kind: VerifiedEvidenceKind, count: number): RecipeFollowUpRecommendation {
  const label = labelEvidenceKind(kind)
  if (kind === 'drc' || kind === 'physical-drc') {
    return {
      id: `repeat-${kind}`,
      title: `Practice ${label}`,
      reason: `${label} blocked progress ${count} times, so a smaller wiring variation will help the learner see the pattern.`,
      experiment: 'Move one jumper at a time, rerun the check, and predict whether the circuit should still work.',
    }
  }
  if (kind === 'reality-check') {
    return {
      id: `repeat-${kind}`,
      title: 'Practice visual checks',
      reason: `Reality Check found repeated uncertainty ${count} times.`,
      experiment: 'Take a clearer photo from above and label each visible jumper before powering the board.',
    }
  }
  return {
    id: `repeat-${kind}`,
    title: `Practice ${label}`,
    reason: `${label} needed repeated attention ${count} times.`,
    experiment: `Repeat the step slowly and write down what should happen before running ${label}.`,
  }
}

function dedupeFollowUps(recommendations: RecipeFollowUpRecommendation[]): RecipeFollowUpRecommendation[] {
  const seen = new Set<string>()
  const out: RecipeFollowUpRecommendation[] = []
  for (const recommendation of recommendations) {
    if (seen.has(recommendation.id)) continue
    seen.add(recommendation.id)
    out.push(recommendation)
  }
  return out
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
