import { beforeEach, describe, expect, it } from 'vitest'
import {
  approveScreenshot,
  buildCodexSceneContext,
  buildCanvasReference,
  canAgentClaimReady,
  clearAgentActionSessions,
  evaluateAgentActionPolicy,
  generateContextID,
  listAgentActionSessions,
  recordAgentActionSession,
  validationForAction,
} from '../src/agent/visualBuildAgent'
import { makeSeedProject } from './helpers'
import { migrateAgentPrefs, normalizeAgentPrefs } from '../src/agent/agentPrefs'

describe('Codex visual build agent policy', () => {
  beforeEach(() => {
    clearAgentActionSessions()
  })

  it('builds structured scene context from project and validation state', () => {
    const context = buildCodexSceneContext({ project: makeSeedProject(), selected: 'led1' })

    expect(context.projectSummary.components.map((component) => component.instance)).toContain('led1')
    expect(context.renderSummary.selected).toBe('led1')
    expect(context.validationSummary.drcErrors).toBe(0)
    expect(context.permissions.allowedActions).toContain('connect')
  })

  it('handles empty and stale selections without losing project context', () => {
    const project = makeSeedProject()

    expect(buildCodexSceneContext({ project, selected: undefined }).renderSummary.selected).toBeNull()
    const staleSelection = buildCodexSceneContext({ project, selected: 'missing-part' })
    expect(staleSelection.renderSummary.selected).toBeNull()
    expect(staleSelection.projectSummary.components.length).toBeGreaterThan(0)
  })

  it('uses guided edit permissions when autonomy tier is omitted', () => {
    const context = buildCodexSceneContext({ project: makeSeedProject() })

    expect(context.permissions.autonomyTier).toBe('guided-edit')
    expect(context.permissions.allowedActions).toEqual(
      expect.arrayContaining(['inspect', 'add-part', 'place-part', 'move-part', 'delete-item', 'connect', 'connect-breadboard', 'catalog-import', 'camera-analysis'])
    )
  })

  it('summarizes DRC errors and permission variants', () => {
    const project = {
      ...makeSeedProject(),
      // ESP32 GPIO34 is input-only; driving an LED from it should remain a deterministic DRC error.
      nets: [...makeSeedProject().nets, { id: 'bad-input-only', endpoints: ['board.gpio34', 'led1.anode'] }],
    }
    const context = buildCodexSceneContext({ project, autonomyTier: 'explain-only' })

    expect(context.validationSummary.drcErrors).toBeGreaterThan(0)
    expect(context.permissions.allowedActions).toEqual(['inspect'])
    expect(buildCodexSceneContext({ project, autonomyTier: 'hardware-gated' }).permissions.allowedActions).toContain('flash')
  })

  it('gates hardware actions behind approval', () => {
    const policy = evaluateAgentActionPolicy('flash', 'hardware-gated')

    expect(policy.allowed).toBe(true)
    expect(policy.approvalRequired).toBe(true)
    expect(policy.requiredValidation).toContain('user-approval')
  })

  it.each(['build', 'monitor'] as const)('gates %s behind hardware approval', (action) => {
    const policy = evaluateAgentActionPolicy(action, 'hardware-gated')

    expect(policy.allowed).toBe(true)
    expect(policy.approvalRequired).toBe(true)
    expect(policy.requiredValidation).toContain('user-approval')
  })

  it.each([
    ['explain-only', false, false],
    ['draft-edit', false, false],
    ['guided-edit', false, false],
    ['hardware-gated', true, true],
  ] as const)('evaluates flash in %s mode', (tier, allowed, approvalRequired) => {
    const policy = evaluateAgentActionPolicy('flash', tier)

    expect(policy.allowed).toBe(allowed)
    expect(policy.approvalRequired).toBe(approvalRequired)
  })

  it('rejects invalid actions when called through the policy boundary', () => {
    const policy = evaluateAgentActionPolicy('erase' as never, 'hardware-gated')

    expect(policy.allowed).toBe(false)
  })

  it('blocks edits in explain-only mode', () => {
    const policy = evaluateAgentActionPolicy('connect', 'explain-only')

    expect(policy.allowed).toBe(false)
    expect(policy.approvalRequired).toBe(false)
  })

  it('maps circuit actions to required validation', () => {
    expect(validationForAction('inspect')).toEqual([])
    expect(validationForAction('add-part')).toEqual(['drc'])
    expect(validationForAction('connect')).toEqual(['drc'])
    expect(validationForAction('place-part')).toEqual(['physical-drc'])
    expect(validationForAction('move-part')).toEqual(['physical-drc'])
    expect(validationForAction('delete-item')).toEqual(['drc'])
    expect(validationForAction('connect-breadboard')).toEqual(['physical-drc'])
    expect(validationForAction('behavior-change')).toEqual(['drc', 'simulation'])
    expect(validationForAction('code-change')).toEqual(['drc', 'code-inspection'])
    expect(validationForAction('catalog-import')).toEqual(['source-license-review', 'catalog-draft-review'])
    expect(validationForAction('build')).toEqual(['drc', 'build-log', 'user-approval'])
    expect(validationForAction('flash')).toEqual(['drc', 'build-log', 'user-approval', 'serial-port'])
    expect(validationForAction('monitor')).toEqual(['user-approval', 'serial-port'])
    expect(validationForAction('camera-analysis')).toEqual(['user-approval', 'reality-check-findings'])
  })

  it('blocks ready claims until required validation has passed', () => {
    expect(canAgentClaimReady('flash', {})).toBe(false)
    expect(canAgentClaimReady('flash', { drc: true, 'build-log': true, 'user-approval': true })).toBe(false)
    expect(canAgentClaimReady('flash', { drc: true, 'build-log': true, 'user-approval': true, 'serial-port': true })).toBe(true)
    expect(canAgentClaimReady('code-change', { drc: true, 'code-inspection': { ok: true, files: ['main/app_main.c'] } })).toBe(true)
    expect(canAgentClaimReady('code-change', { drc: true, 'code-inspection': { ok: true } })).toBe(false)
    expect(canAgentClaimReady('inspect', {})).toBe(true)
  })

  it('records inspectable action sessions for UI history', () => {
    const session = recordAgentActionSession({
      tool: 'connect_pins',
      action: 'connect',
      changedObjects: ['net:net1'],
      validationResults: { drc: true },
      beginnerSummary: 'Connected two pins.',
    })

    expect(listAgentActionSessions()).toEqual([session])
    const listed = listAgentActionSessions()
    listed[0].changedObjects.push('mutated')
    expect(listAgentActionSessions()[0].changedObjects).toEqual(['net:net1'])
  })

  it('keeps context IDs stable and distinct', async () => {
    const input = { project: 'Blink', fields: ['board', 'nets'] }

    await expect(generateContextID(input)).resolves.toBe(await generateContextID({ fields: ['board', 'nets'], project: 'Blink' }))
    await expect(generateContextID(input)).resolves.not.toBe(await generateContextID({ project: 'Blink', fields: ['board'] }))
  })

  it('hashes structured scene metadata beyond plain objects deterministically', async () => {
    const input = {
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
      aliases: new Set(['led', 'resistor']),
      pinsByPart: new Map([
        ['led1', ['anode', 'cathode']],
        ['r1', ['a', 'b']],
      ]),
    }

    await expect(generateContextID(input)).resolves.toBe(await generateContextID({
      aliases: new Set(['resistor', 'led']),
      pinsByPart: new Map([
        ['r1', ['a', 'b']],
        ['led1', ['anode', 'cathode']],
      ]),
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
    }))
    await expect(generateContextID(input)).resolves.not.toBe(await generateContextID({ ...input, createdAt: new Date('2026-05-09T00:00:01.000Z') }))
  })

  it('attaches canvas screenshots only after settings/request and approval allow it', async () => {
    const project = makeSeedProject()
    const canvasDataUrl = 'data:image/png;base64,abc123'

    expect((await buildCanvasReference({ project, canvasDataUrl, approved: true })).attached).toBe(false)
    expect((await buildCanvasReference({ project, canvasDataUrl, enabledBySettings: true })).attached).toBe(false)
    expect((await approveScreenshot({ project, canvasDataUrl, enabledBySettings: true }, true)).attached).toBe(true)
    expect((await buildCanvasReference({ project, canvasDataUrl, explicitlyRequested: true, approved: true })).attached).toBe(true)
  })

  it('keeps scene context complete for minimal and extended requests', () => {
    const minimal = buildCodexSceneContext({ project: makeSeedProject() })
    const extended = buildCodexSceneContext({ project: makeSeedProject(), selected: 'led1', autonomyTier: 'hardware-gated' })

    expect(minimal.projectSummary.name).toBeTruthy()
    expect(minimal.renderSummary.catalogRenderCoverage).toBeDefined()
    expect(minimal.validationSummary.realityReadiness).toBe('unknown')
    expect(extended.renderSummary.selected).toBe('led1')
    expect(extended.permissions.allowedActions).toContain('flash')
  })

  it('migrates persisted beginner agent settings without losing learner choices', () => {
    expect(normalizeAgentPrefs(migrateAgentPrefs({
      autonomy: 'hardware-gated',
      effort: 'minimal',
    }))).toEqual({ autonomy: 'hardware-gated', effort: 'low' })

    expect(normalizeAgentPrefs(migrateAgentPrefs({
      version: 1,
      data: { autonomy: 'draft-edit', effort: 'xhigh' },
    }))).toEqual({ autonomy: 'draft-edit', effort: 'xhigh' })

    expect(normalizeAgentPrefs(migrateAgentPrefs({
      autonomy: 'guided-edit',
      effort: 'none',
    }))).toEqual({ autonomy: 'guided-edit', effort: 'low' })
  })
})
