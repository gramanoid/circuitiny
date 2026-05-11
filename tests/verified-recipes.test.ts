import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../src/templates'
import {
  evaluateMilestone,
  evaluateRecipeProgress,
  classifyRecipeEvidenceEdit,
  codexTutorRecommendation,
  listVerifiedRecipes,
  manualEvidenceExpiresForRecipeChange,
  progressiveMilestoneHints,
  recommendFollowUpExperiments,
  shouldExpireManualEvidence,
  summarizeRecipeResume,
  toVerifiedRecipe,
  type VerifiedEvidence,
  type VerifiedMilestone,
} from '../src/learning/verifiedRecipes'
import type { LearningRecipe } from '../src/learning/types'

describe('verified learning recipes', () => {
  it('converts existing beginner recipes into evidence-gated milestones', () => {
    const template = TEMPLATES.find((entry) => entry.id === 'blink-led')
    if (!template?.recipe) {
      throw new Error('blink-led template with recipe not found in TEMPLATES')
    }
    const verified = toVerifiedRecipe(template.recipe)

    expect(verified.milestones.length).toBeGreaterThan(0)
    expect(verified.milestones.some((milestone) => milestone.requiredEvidence.includes('drc'))).toBe(true)
  })

  it('adds physical DRC and Reality Check gates to starter recipes', () => {
    const verifiedRecipes = listVerifiedRecipes()

    expect(verifiedRecipes.length).toBeGreaterThanOrEqual(3)
    for (const recipe of verifiedRecipes) {
      expect(recipe).toMatchObject({
        id: expect.any(String),
        milestones: expect.any(Array),
      })
      expect(recipe.id.trim()).not.toBe('')
      const physical = recipe.milestones.find((milestone) => milestone.id === 'physical-reality-check')
      if (physical) {
        expect(physical.requiredEvidence).toContain('physical-drc')
        expect(physical.supportingEvidence).toContain('reality-check')
        expect(physical.blockingEvidence).toContain('drc')
      }
    }
  })

  it('keeps a milestone ready until required evidence passes', () => {
    const template = TEMPLATES.find((entry) => entry.id === 'blink-led')
    if (!template?.recipe) throw new Error('blink-led template with recipe not found in TEMPLATES')
    const milestone = toVerifiedRecipe(template.recipe).milestones.find((candidate) => candidate.requiredEvidence.includes('drc'))
    if (!milestone) throw new Error('blink-led recipe has no DRC-gated milestone')

    const missing = evaluateMilestone(milestone, [], true)
    expect(missing.status).toBe('ready')
    expect(missing.missingEvidence).toContain('drc')

    const passed: VerifiedEvidence[] = [{ kind: 'drc', state: 'pass', title: 'DRC', detail: 'No errors' }]
    expect(evaluateMilestone(milestone, passed, true).status).toBe('complete')
  })

  it('does not allow Codex-style progress through blocking evidence', () => {
    const template = TEMPLATES.find((entry) => entry.id === 'blink-led')
    if (!template?.recipe) throw new Error('blink-led template with recipe not found in TEMPLATES')
    const verified = toVerifiedRecipe(template.recipe)
    const target = verified.milestones.find((milestone) => milestone.requiredEvidence.includes('drc'))
    if (!target) throw new Error('blink-led recipe has no DRC-gated milestone')

    const blocked = evaluateMilestone(target, [{
      kind: 'drc',
      state: 'blocked',
      title: 'Missing resistor',
      detail: 'Add a resistor in series with the LED.',
    }], true)

    expect(blocked.status).toBe('blocked')
    expect(blocked.nextHint).toContain('resistor')
  })

  it('locks later milestones until earlier milestones complete', () => {
    const template = TEMPLATES.find((entry) => entry.id === 'blink-led')
    if (!template?.recipe) throw new Error('blink-led template with recipe not found in TEMPLATES')
    const verified = toVerifiedRecipe(template.recipe)
    const progress = evaluateRecipeProgress(verified, {})

    expect(progress[0].status).not.toBe('locked')
    expect(progress.slice(1).some((milestone) => milestone.status === 'locked')).toBe(true)
  })

  it('marks milestones that remain evaluable after an earlier blocker', () => {
    const recipe = toVerifiedRecipe(makeRecipeWithStepKinds())
    const first = recipe.milestones[0]
    const second = recipe.milestones[1]
    if (!first || !second) throw new Error('expected at least two verified milestones')
    const progress = evaluateRecipeProgress(recipe, {
      [first.id]: [{
        kind: first.blockingEvidence[0] ?? 'drc',
        state: 'blocked',
        title: 'Blocked',
        detail: 'Fix this first.',
      }],
    })

    expect(progress[0].status).toBe('blocked')
    expect(progress[1].propagatedFromBlocked).toBe(true)
  })

  it('keeps supporting evidence from replacing required proof', () => {
    const milestone: VerifiedMilestone = {
      id: 'hardware',
      title: 'Flash and observe',
      action: 'Watch the LED',
      why: 'Hardware proof matters',
      requiredEvidence: ['build', 'manual'],
      supportingEvidence: ['reality-check'],
      blockingEvidence: ['drc', 'reality-check'],
      hints: ['Build first'],
      expectedObservation: 'LED blinks',
    }

    const evaluation = evaluateMilestone(milestone, [{
      kind: 'reality-check',
      state: 'pass',
      title: 'Reality Check',
      detail: 'Visible wiring matches.',
    }], true)

    expect(evaluation.status).toBe('ready')
    expect(evaluation.missingEvidence).toEqual(['build', 'manual'])
    expect(evaluation.passedEvidence.map((item) => item.kind)).toContain('reality-check')
  })

  it('uses first blocking evidence and handles empty hints without undefined text', () => {
    const milestone: VerifiedMilestone = {
      id: 'wire',
      title: 'Wire LED',
      action: 'Connect LED',
      why: 'Complete the circuit',
      requiredEvidence: ['drc'],
      supportingEvidence: [],
      blockingEvidence: ['drc', 'physical-drc'],
      hints: [],
      expectedObservation: 'DRC passes',
    }

    const blocked = evaluateMilestone(milestone, [
      { kind: 'drc', state: 'blocked', title: 'DRC', detail: 'Fix the resistor first.' },
      { kind: 'physical-drc', state: 'blocked', title: 'Physical DRC', detail: 'Button is rotated.' },
    ], true)
    expect(blocked.nextHint).toBe('Fix the resistor first.')

    const missing = evaluateMilestone(milestone, [], true)
    expect(missing.nextHint).toContain('Review the current milestone')
    expect(missing.nextHint).not.toContain('undefined')
  })

  it('builds beginner hint copy with expected observations and blockers', () => {
    const milestone: VerifiedMilestone = {
      id: 'wire',
      title: 'Wire LED',
      action: 'Connect LED',
      why: 'Complete the circuit',
      requiredEvidence: ['drc'],
      supportingEvidence: [],
      blockingEvidence: ['drc'],
      hints: ['Check the resistor is in series.'],
      expectedObservation: 'DRC passes and the LED net has a resistor.',
    }

    const ready = evaluateMilestone(milestone, [], true)
    expect(progressiveMilestoneHints(milestone, ready).join(' ')).toContain('Expected observation')

    const blocked = evaluateMilestone(milestone, [{
      kind: 'drc',
      state: 'blocked',
      title: 'Missing resistor',
      detail: 'Add a resistor before powering the LED.',
    }], true)
    const hints = progressiveMilestoneHints(milestone, blocked).join(' ')
    expect(hints).toContain('Add a resistor')
    expect(hints).toContain('DRC passes')
  })

  it('summarizes resume state with completed proof and recheck actions', () => {
    const template = TEMPLATES.find((entry) => entry.id === 'blink-led')
    if (!template?.recipe) throw new Error('blink-led template with recipe not found in TEMPLATES')
    const verified = toVerifiedRecipe(template.recipe)
    const evaluations = verified.milestones.map((milestone, index) => ({
      milestoneId: milestone.id,
      status: index === 0 ? 'complete' as const : index === 1 ? 'ready' as const : 'locked' as const,
      missingEvidence: index === 1 ? milestone.requiredEvidence : [],
      blockingEvidence: [],
      passedEvidence: index === 0 ? [{ kind: milestone.requiredEvidence[0] ?? 'project', state: 'pass' as const, title: 'Proof', detail: 'Done' }] : [],
      nextHint: index === 1 ? 'Continue here.' : 'Wait.',
    }))

    const summary = summarizeRecipeResume(verified, evaluations)
    expect(summary.completedCount).toBe(1)
    expect(summary.message).toContain('Resuming')
    expect(summary.recheckActions.join(' ')).toContain('Rerun DRC')
  })

  it('keeps Codex tutor actions inside the selected autonomy tier', () => {
    const milestone: VerifiedMilestone = {
      id: 'build',
      title: 'Build firmware',
      action: 'Run build',
      why: 'Compile before hardware',
      requiredEvidence: ['build'],
      supportingEvidence: [],
      blockingEvidence: ['build'],
      hints: ['Build after DRC is clean.'],
      expectedObservation: 'ESP-IDF build succeeds.',
    }
    const ready = evaluateMilestone(milestone, [], true)

    expect(codexTutorRecommendation(milestone, ready, 'explain-only')).toMatchObject({
      mode: 'explain',
      canPerform: false,
      approvalRequired: false,
    })
    expect(codexTutorRecommendation(milestone, ready, 'guided-edit')).toMatchObject({
      mode: 'suggest-fix',
      canPerform: false,
      approvalRequired: true,
    })
    expect(codexTutorRecommendation(milestone, ready, 'hardware-gated')).toMatchObject({
      mode: 'request-approval',
      canPerform: true,
      approvalRequired: true,
    })
  })

  it('recommends authored follow-ups after completion and remedial practice for repeated mistakes', () => {
    const recipe = { ...makeRecipeWithStepKinds(), followUpExperiments: ['Change the blink speed'] }
    const verified = toVerifiedRecipe(recipe)
    const complete = verified.milestones.map((milestone) => ({
      milestoneId: milestone.id,
      status: 'complete' as const,
      missingEvidence: [],
      blockingEvidence: [],
      passedEvidence: [{ kind: milestone.requiredEvidence[0] ?? 'project', state: 'pass' as const, title: 'Proof', detail: 'Done' }],
      nextHint: 'Done.',
    }))

    const recommendations = recommendFollowUpExperiments(recipe, complete, [
      { kind: 'drc', state: 'blocked', title: 'DRC', detail: 'Missing resistor.' },
      { kind: 'drc', state: 'fail', title: 'DRC', detail: 'Wrong GPIO.' },
    ])

    expect(recommendations.some((item) => item.id === 'repeat-drc')).toBe(true)
    expect(recommendations.some((item) => item.id.startsWith('authored-'))).toBe(true)
  })

  it('models an end-to-end proof chain through wiring, simulation, build approval, observation, and next experiment', () => {
    const recipe = { ...makeRecipeWithStepKinds(), followUpExperiments: ['Change one timing value and predict the result'] }
    const verified = toVerifiedRecipe(recipe)
    const evidence = Object.fromEntries(verified.milestones.map((milestone) => [
      milestone.id,
      milestone.requiredEvidence.map((kind): VerifiedEvidence => ({
        kind,
        state: 'pass',
        title: `${kind} proof`,
        detail: kind === 'manual' ? 'Learner observed the hardware result after approval.' : `${kind} passed.`,
      })),
    ]))
    const progress = evaluateRecipeProgress(verified, evidence)
    const hardwareMilestone = verified.milestones.find((milestone) => milestone.requiredEvidence.includes('build') && milestone.requiredEvidence.includes('manual'))
    const hardwareEvaluation = progress.find((evaluation) => evaluation.milestoneId === hardwareMilestone?.id)

    expect(progress.every((evaluation) => evaluation.status === 'complete')).toBe(true)
    expect(hardwareMilestone).toBeDefined()
    expect(hardwareEvaluation?.passedEvidence.map((item) => item.kind)).toEqual(expect.arrayContaining(['build', 'manual']))
    expect(codexTutorRecommendation(hardwareMilestone!, hardwareEvaluation!, 'hardware-gated')).toMatchObject({
      mode: 'celebrate',
      canPerform: false,
    })
    expect(recommendFollowUpExperiments(recipe, progress)[0]?.experiment).toContain('timing')
  })

  it('maps each recipe step kind to appropriate evidence and blockers', () => {
    const verified = toVerifiedRecipe(makeRecipeWithStepKinds())

    expect(verified.milestones.find((milestone) => milestone.id === 'wire')?.requiredEvidence).toEqual(['drc'])
    expect(verified.milestones.find((milestone) => milestone.id === 'wire')?.blockingEvidence).toContain('physical-drc')
    expect(verified.milestones.find((milestone) => milestone.id === 'simulate')?.requiredEvidence).toEqual(['simulation'])
    expect(verified.milestones.find((milestone) => milestone.id === 'simulate')?.blockingEvidence).toEqual(['drc'])
    expect(verified.milestones.find((milestone) => milestone.id === 'code')?.requiredEvidence).toEqual(['code'])
    expect(verified.milestones.find((milestone) => milestone.id === 'build')?.requiredEvidence).toEqual(['build'])
    expect(verified.milestones.find((milestone) => milestone.id === 'hardware')?.requiredEvidence).toEqual(['build', 'manual'])
    expect(verified.milestones.find((milestone) => milestone.id === 'hardware')?.blockingEvidence).toContain('serial-monitor')
  })

  it('expires manual evidence only for structural recipe edits', () => {
    expect(shouldExpireManualEvidence('structural')).toBe(true)
    expect(shouldExpireManualEvidence('cosmetic')).toBe(false)
  })

  it('classifies recipe topology changes as structural evidence expiry', () => {
    const recipe = makeRecipeWithStepKinds()
    const changed = {
      ...recipe,
      wiringSteps: [{ id: 'wire-1', from: 'board.gpio16', to: 'led1.anode', title: 'Wire LED', why: 'Complete circuit', expected: 'DRC passes' }],
    }

    expect(classifyRecipeEvidenceEdit(recipe, changed)).toMatchObject({
      kind: 'structural',
      fields: ['wiringSteps'],
    })
    expect(manualEvidenceExpiresForRecipeChange(recipe, changed)).toBe(true)
  })

  it('keeps manual evidence for cosmetic recipe copy edits', () => {
    const recipe = makeRecipeWithStepKinds()
    const changed = {
      ...recipe,
      steps: recipe.steps.map((entry) => entry.id === 'wire' ? { ...entry, title: 'Wire the LED carefully' } : entry),
    }

    expect(classifyRecipeEvidenceEdit(recipe, changed).kind).toBe('cosmetic')
    expect(manualEvidenceExpiresForRecipeChange(recipe, changed)).toBe(false)
  })

  it('keeps manual evidence for render-only recipe metadata edits', () => {
    const recipe = makeRecipeWithStepKinds()
    const changed = {
      ...recipe,
      visualTransform: { x: 12, y: 6, rotation: 90 },
    } as LearningRecipe

    expect(classifyRecipeEvidenceEdit(recipe, changed).kind).toBe('cosmetic')
    expect(manualEvidenceExpiresForRecipeChange(recipe, changed)).toBe(false)
  })

  it('dedupes generated milestones only when ids are compatible with the duplicate title', () => {
    const verified = toVerifiedRecipe({
      id: 'dedupe-fixture',
      goal: 'Check milestone dedupe',
      estimatedTime: '5 min',
      concepts: [],
      requiredParts: [],
      wiringSteps: [],
      checkpoints: [],
      hardwareNotes: [],
      followUpExperiments: [],
      steps: [
        step('', 'overview', ''),
        step('same-id', 'overview', 'Same ID first'),
        step('same-id', 'overview', 'Same ID second'),
        step('', 'overview', 'Title only'),
        step('title-partner', 'overview', 'Title only'),
        step('conflict-one', 'overview', 'Conflicting title'),
        step('conflict-two', 'overview', 'Conflicting title'),
      ],
    })

    expect(verified.milestones.map((milestone) => milestone.id)).toEqual([
      'same-id',
      '',
      'conflict-one',
      'conflict-two',
    ])
    expect(verified.milestones.map((milestone) => milestone.title)).toEqual([
      'Same ID first',
      'Title only',
      'Conflicting title',
      'Conflicting title',
    ])
  })
})

function makeRecipeWithStepKinds(): LearningRecipe {
  return {
    id: 'step-kind-fixture',
    goal: 'Verify evidence mapping',
    estimatedTime: '5 min',
    concepts: ['testing'],
    requiredParts: [],
    wiringSteps: [],
    checkpoints: [],
    hardwareNotes: [],
    followUpExperiments: [],
    steps: [
      step('wire', 'wire'),
      step('simulate', 'simulate'),
      step('code', 'code'),
      step('build', 'build'),
      step('hardware', 'hardware'),
    ],
  }
}

function step(id: string, kind: LearningRecipe['steps'][number]['kind'], title = id): LearningRecipe['steps'][number] {
  return {
    id,
    kind,
    title,
    body: `${id} body`,
    why: `${id} why`,
    action: `${id} action`,
  }
}
