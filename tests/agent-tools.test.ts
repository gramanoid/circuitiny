import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  execTool,
  makeExecContext,
  type AnalyzePartsPhotoResult,
  type CreateDraftPartResult,
  type GetProjectResult,
  type MatchPartsDatabaseResult,
  type RecommendPartsResult,
  type RecommendProjectsResult,
  type RunDrcResult,
  type SearchModelLibraryResult,
  type ImportModelCandidateResult,
  type GetSceneContextResult,
  type RunPhysicalDrcResult,
  type IdentifyPartResult,
  type RunRealityCheckResult,
  type AgentActionHistoryResult,
} from '../src/agent/tools'
import { useStore } from '../src/store'
import { TEMPLATES } from '../src/templates'
import { emptyProject } from '../src/project/schema'
import { catalog } from '../src/catalog'
import { resolveCatalogRender } from '../src/catalog/rendering'
import { clearAgentActionSessions } from '../src/agent/visualBuildAgent'

const MOCK_RETRIEVED_AT = '2026-05-09T00:00:00.000Z'

describe('agent tools for beginner guidance', () => {
  const previousWindow = (globalThis as any).window

  beforeEach(() => {
    clearAgentActionSessions()
    useStore.getState().loadProject(emptyProject('agent-tool-test', 'esp32-devkitc-v4'))
  })

  afterEach(() => {
    if (catalog.getComponent('capacitive-soil-moisture-sensor')) {
      catalog.removeComponent('capacitive-soil-moisture-sensor')
    }
    if (catalog.getComponent('model-slide-switch-eg1218-antmicro')) {
      catalog.removeComponent('model-slide-switch-eg1218-antmicro')
    }
    ;(globalThis as any).window = previousWindow
  })

  it('get_project includes active beginner recipe context', async () => {
    const tpl = TEMPLATES.find((t) => t.id === 'blink-led')!
    useStore.getState().loadProject(tpl.project)
    useStore.getState().startRecipe(tpl.recipe.id)
    useStore.getState().setRecipeStep(1)

    const result = await execTool('get_project', {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as GetProjectResult
      expect(data.beginnerGuidance?.recipeId).toBe('blink-led')
      expect(data.beginnerGuidance?.stepTitle ?? '').toContain('GPIO16')
      expect(data.beginnerGuidance?.refs).toContain('board.gpio16')
      expect(data.drc.beginnerSummary).toEqual([])
    }
  })

  it('recommend_parts is exposed through the tool executor', async () => {
    const result = await execTool('recommend_parts', { goal: 'my plant needs water' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as RecommendPartsResult
      expect(data.recommendations[0].source).toBe('draft-suggestion')
      expect(data.recommendations[0].reviewRequired).toBe(true)
    }
  })

  it('analyzes part descriptions into unconfirmed candidates', async () => {
    const result = await execTool('analyze_parts_photo', { description: 'a red LED and a 220 ohm resistor' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as AnalyzePartsPhotoResult
      expect(data.candidates.map((candidate) => candidate.label)).toContain('LED 5mm Red')
      expect(data.candidates.every((candidate) => candidate.status === 'candidate')).toBe(true)
    }
  })

  it('matches the parts database without persisting anything', async () => {
    const result = await execTool('match_parts_database', { query: 'ssd1306 oled' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as MatchPartsDatabaseResult
      expect(data.part.id).toBe('ssd1306-oled-i2c')
      expect(data.part.reviewRequired).toBe(true)
    }
  })

  it('searches free/open model candidates with license and format metadata', async () => {
    const ctx = makeExecContext()
    const result = await execTool('search_model_library', { query: 'slide switch', native_only: true }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as SearchModelLibraryResult
      expect(data.candidates.length).toBeGreaterThan(0)
      expect(data.candidates[0].licenseUse).toBe('bundled-ok')
      expect(['gltf', 'glb']).toContain(data.candidates[0].format)
      expect(ctx.modelCandidates.has(data.candidates[0].id)).toBe(true)
    }
  })

  it('requires approval before importing model candidates', async () => {
    const denied = await execTool('import_model_candidate', {
      candidate_id: 'antmicro-slide-switch-eg1218',
      approved: false,
    })
    expect(denied.ok).toBe(false)
  })

  it('imports an approved native model candidate as a draft catalog component', async () => {
    const ctx = makeExecContext()
    const search = await execTool('search_model_library', { query: 'slide switch', native_only: true }, ctx)
    expect(search.ok).toBe(true)
    ;(globalThis as any).window = {
      espAI: {
        installModelAsset: async ({ componentJson }: { componentJson: string }) => ({
          ok: true,
          componentJson,
          modelName: 'model-slide-switch-eg1218-antmicro.gltf',
          modelData: new Uint8Array([123, 34, 97, 115, 115, 101, 116, 34, 58, 49, 125]),
          savedTo: '/tmp/circuitiny/catalog/model-slide-switch-eg1218-antmicro',
          conversionStatus: 'converted',
          conversionLog: ['mock install'],
        }),
      },
    }
    const imported = await execTool('import_model_candidate', {
      candidate_id: 'antmicro-slide-switch-eg1218',
      approved: true,
    }, ctx)
    expect(imported.ok).toBe(true)
    if (imported.ok) {
      const data = imported.data as ImportModelCandidateResult
      expect(data.componentId).toBe('model-slide-switch-eg1218-antmicro')
      expect(data.catalogMeta?.renderStrategy).toBe('draft-glb')
      expect(data.catalogMeta?.modelAsset?.sourceId).toBe('antmicro-hardware-components')
      expect(catalog.getComponent('model-slide-switch-eg1218-antmicro')).toBeDefined()
    }
  })

  it('recommends projects from confirmed inventory parts', async () => {
    const result = await execTool('recommend_projects_from_inventory', {
      parts: ['led-5mm-red', 'resistor-220r'],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as RecommendProjectsResult
      expect(data.recommendations[0].id).toBe('blink-led')
      expect(data.recommendations[0].fit).toBe('build-now')
    }
  })

  it('requires approval before creating a recipe project from recommendations', async () => {
    const denied = await execTool('create_recipe_from_project', {
      project_id: 'blink-led',
      approved: false,
    })
    expect(denied.ok).toBe(false)

    const created = await execTool('create_recipe_from_project', {
      project_id: 'blink-led',
      approved: true,
    })
    expect(created.ok).toBe(true)
    expect(useStore.getState().project.name).toBe('Blink LED')
    expect(useStore.getState().activeRecipeId).toBe('blink-led')
  })

  it('requires approval before creating an AI draft part', async () => {
    const denied = await execTool('create_draft_part', {
      goal: 'my plant needs water',
      recommendation_id: 'capacitive-soil-moisture-sensor',
      approved: false,
    })
    expect(denied.ok).toBe(false)

    // Intentionally skips recommend_parts so ctx?.recommendedParts has no cached recommendation for create_draft_part.
    const unknown = await execTool('create_draft_part', {
      goal: 'my plant needs water',
      recommendation_id: 'not-in-the-recommendation-list',
      approved: true,
    })
    expect(unknown.ok).toBe(false)
  })

  it('can create an approved AI draft part in the local catalog registry', async () => {
    const ctx = makeExecContext()
    const recResult = await execTool('recommend_parts', { goal: 'my plant needs water' }, ctx)
    expect(recResult.ok).toBe(true)
    const result = await execTool('create_draft_part', {
      goal: 'my plant needs water',
      recommendation_id: 'capacitive-soil-moisture-sensor',
      approved: true,
    }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as CreateDraftPartResult
      expect(data.componentId).toBe('capacitive-soil-moisture-sensor')
      expect(data.catalogMeta?.trust).toBe('ai-draft')
      expect(data.savedTo).toBeNull()
      const component = catalog.getComponent('capacitive-soil-moisture-sensor')
      expect(component).toBeDefined()
      const render = resolveCatalogRender(component!, false)
      expect(render.strategy).toBe('primitive')
      expect(render.primitiveKind).toBe('sensor')
    }
  })

  it('skips draft creation when the recommendation already exists in the catalog', async () => {
    const ctx = makeExecContext()
    const recResult = await execTool('recommend_parts', { goal: 'blink a light' }, ctx)
    expect(recResult.ok).toBe(true)
    const result = await execTool('create_draft_part', {
      goal: 'blink a light',
      recommendation_id: 'led-5mm-red',
      approved: true,
    }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as CreateDraftPartResult
      expect(data.componentId).toBe('led-5mm-red')
      expect(data.skipped).toBe('already_in_catalog')
    }
  })

  // Pin refs and component ids below are tied to current catalog definitions; update them if the catalog changes.
  it('can execute a recipe-style add, wire, behavior, and validation loop', async () => {
    useStore.getState().loadProject(emptyProject('agent-loop-test', 'esp32-devkitc-v4'))

    const resistor = await execTool('add_component', { componentId: 'resistor-220r' })
    const led = await execTool('add_component', { componentId: 'led-5mm-red' })
    expect(resistor).toMatchObject({ ok: true })
    expect(led).toMatchObject({ ok: true })
    const resistorInstance = getCreatedInstance(resistor)
    const ledInstance = getCreatedInstance(led)
    expect(await execTool('connect', { from: 'board.gpio16', to: `${resistorInstance}.in` })).toMatchObject({ ok: true })
    expect(await execTool('connect', { from: `${resistorInstance}.out`, to: `${ledInstance}.anode` })).toMatchObject({ ok: true })
    expect(await execTool('connect', { from: `${ledInstance}.cathode`, to: 'board.gnd_l' })).toMatchObject({ ok: true })
    expect(await execTool('set_behavior', {
      id: 'blink',
      trigger: { type: 'timer', period_ms: 1000 },
      actions: [{ type: 'toggle', target: `${ledInstance}.anode` }],
    })).toMatchObject({ ok: true })

    const drc = await execTool('run_drc', {})
    expect(drc.ok).toBe(true)
    if (drc.ok) {
      const drcData = drc.data as RunDrcResult
      expect(drcData.errors).toBe(0)
    }
  })

  it('exposes scene context through a scoped Codex tool', async () => {
    useStore.getState().loadProject(makeSeedForAgentTools())

    const scene = await execTool('get_scene_context', { autonomy_tier: 'hardware-gated' })
    expect(scene.ok).toBe(true)
    if (scene.ok) {
      const data = scene.data as GetSceneContextResult
      expect(data.context.permissions.allowedActions).toContain('flash')
      expect(data.context.projectSummary.components.map((component) => component.instance)).toContain('led1')
    }
  })

  it('offers typed visual mutation aliases and records action history with rollback', async () => {
    useStore.getState().loadProject(emptyProject('agent-typed-tools-test', 'esp32-devkitc-v4'))

    const added = await execTool('add_component', { componentId: 'led-5mm-red' })
    expect(added.ok).toBe(true)
    const instance = getCreatedInstance(added)
    expect(await execTool('place_part', { instance, position: [0.01, 0.02, 0.03] })).toMatchObject({ ok: true })
    expect(useStore.getState().project.components.find((component) => component.instance === instance)?.position).toEqual([0.01, 0.02, 0.03])

    const history = await execTool('get_agent_action_history', {})
    expect(history.ok).toBe(true)
    if (history.ok) {
      const data = history.data as AgentActionHistoryResult
      expect(data.sessions.some((session) => session.tool === 'place_part' && session.changedObjects.includes(`component:${instance}`))).toBe(true)
    }

    const rolledBack = await execTool('rollback_last_agent_action', {})
    expect(rolledBack.ok).toBe(true)
    expect(useStore.getState().project.components.find((component) => component.instance === instance)?.position).not.toEqual([0.01, 0.02, 0.03])
  })

  it('validates breadboard jumper guidance and catalog search tools', async () => {
    useStore.getState().loadProject(makeSeedForAgentTools())

    const catalogSearch = await execTool('search_catalog', { query: 'led' })
    expect(catalogSearch.ok).toBe(true)
    if (catalogSearch.ok) {
      expect((catalogSearch.data as { matches: Array<{ id: string }> }).matches.some((match) => match.id === 'led-5mm-red')).toBe(true)
    }

    const jumper = await execTool('connect_breadboard_holes', { from_hole: 'a1', to_hole: 'j10', color: 'green' })
    expect(jumper.ok).toBe(true)
    if (jumper.ok) {
      expect((jumper.data as { jumper: { pathLabel: string } }).jumper.pathLabel).toBe('A1 -> J10 (green)')
    }
  })

  it('exposes physical DRC through a scoped Codex tool', async () => {
    useStore.getState().loadProject(makeSeedForAgentTools())
    const physical = await execTool('run_physical_drc', {})
    expect(physical.ok).toBe(true)
    if (physical.ok) {
      const data = physical.data as RunPhysicalDrcResult
      // Seed layout trace: r1, led1, and btn1 each become one placement; net1 creates the lone jumper from r1.out to led1.anode.
      expect(data.physicalLayout.placements).toBe(3)
      expect(data.physicalLayout.jumpers).toBe(1)
      expect(data.findings).toEqual([])
    }
  })

  it('exposes part identity through a scoped Codex tool', async () => {
    useStore.getState().loadProject(makeSeedForAgentTools())
    const identity = await execTool('identify_part', { query: 'led-5mm-red' })
    expect(identity.ok).toBe(true)
    if (identity.ok) {
      const data = identity.data as IdentifyPartResult
      expect(data.identity.id).toBe('led-5mm-red')
      expect(data.identity.state).toBe('exact')
      expect(data.identity.confidence).toBe('high')
    }
  })

  it('exposes local Reality Check through a scoped Codex tool', async () => {
    useStore.getState().loadProject(makeSeedForAgentTools())
    const reality = await execTool('run_reality_check', {
      observations: [{
        id: 'wire-1',
        kind: 'wire',
        label: 'gray jumper',
        endpoints: ['r1.out', 'led1.anode'],
        confidence: 'high',
      }],
    })
    expect(reality.ok).toBe(true)
    if (reality.ok) {
      const data = reality.data as RunRealityCheckResult
      expect(data.readiness).toBe('pass')
      expect(data.session.findings.some((finding) => finding.kind === 'confirmed')).toBe(true)
    }
  })

  it('validates Reality Check observation inputs for scoped Codex calls', async () => {
    useStore.getState().loadProject(makeSeedForAgentTools())

    const empty = await execTool('run_reality_check', { observations: [] })
    expect(empty.ok).toBe(false)

    const nonObject = await execTool('run_reality_check', { observations: ['wire-1'] })
    expect(nonObject.ok).toBe(false)
    if (!nonObject.ok) expect(nonObject.error).toContain('must be an object')

    const malformed = await execTool('run_reality_check', {
      observations: [{ id: 'bad', kind: 'wire', label: 'bad', endpoints: ['r1', 'led1.anode'], confidence: 'high' }],
    })
    expect(malformed.ok).toBe(false)
    if (!malformed.ok) expect(malformed.error).toContain('instance.pin')

    const tooManyEndpoints = await execTool('run_reality_check', {
      observations: [{ id: 'bad-wide-wire', kind: 'wire', label: 'three ended wire', endpoints: ['r1.out', 'led1.anode', 'btn1.a'], confidence: 'high' }],
    })
    expect(tooManyEndpoints.ok).toBe(false)
    if (!tooManyEndpoints.ok) expect(tooManyEndpoints.error).toContain('exactly two endpoints')

    const malformedSpecials = await execTool('run_reality_check', {
      observations: [{ id: 'bad-specials', kind: 'wire', label: 'bad specials', endpoints: ['bad--owner.out', 'led1.anode'], confidence: 'high' }],
    })
    expect(malformedSpecials.ok).toBe(false)

    const malformedComponent = await execTool('run_reality_check', {
      observations: [{ id: 'bad-component', kind: 'polarity', label: 'bad component', componentInstance: '...bad', polarityReversed: true, confidence: 'high' }],
    })
    expect(malformedComponent.ok).toBe(false)
    if (!malformedComponent.ok) expect(malformedComponent.error).toContain('valid existing project component')

    const shortOwner = await execTool('run_reality_check', {
      observations: [{ id: 'short-owner', kind: 'wire', label: 'short owner', endpoints: ['a.out', 'b.in'], confidence: 'high' }],
    })
    expect(shortOwner.ok).toBe(true)

    const mixed = await execTool('run_reality_check', {
      observations: [
        { id: 'wire-1', kind: 'wire', label: 'gray jumper', endpoints: ['r1.out', 'led1.anode'], confidence: 'high' },
        { id: 'wire-2', kind: 'wire', label: 'uncertain jumper', endpoints: ['btn1.a', 'led1.cathode'], confidence: 'low' },
      ],
    })
    expect(mixed.ok).toBe(true)
    if (mixed.ok) {
      const data = mixed.data as RunRealityCheckResult
      expect(data.session.findings.some((finding) => finding.kind === 'uncertain')).toBe(true)
      expect(data.session.findings.some((finding) => finding.kind === 'confirmed')).toBe(true)
    }
  })

  it('records shorthand behavior tools in action history', async () => {
    useStore.getState().loadProject(makeSeedForAgentTools())

    const blink = await execTool('blink', { pin: 'led1.anode', period_ms: 500 })
    expect(blink.ok).toBe(true)

    const history = await execTool('get_agent_action_history', {})
    expect(history.ok).toBe(true)
    if (history.ok) {
      const data = history.data as AgentActionHistoryResult
      expect(data.sessions[0]).toMatchObject({
        tool: 'blink',
        action: 'behavior-change',
        changedObjects: ['behavior:blink'],
      })
    }
  })

  it('passes learner-approved datasheet sources through part identity lookup', async () => {
    const identity = await execTool('identify_part', {
      query: 'mystery sensor',
      sources: [{
        url: 'https://example.com/sensor.pdf',
        title: 'Sensor datasheet',
        retrievedAt: MOCK_RETRIEVED_AT,
        licenseNote: 'test fixture',
        text: 'Pins: VCC GND DATA. Supply voltage 1.8V to 3.6V.',
      }],
    })

    expect(identity.ok).toBe(true)
    if (identity.ok) {
      const data = identity.data as IdentifyPartResult
      expect(data.identity.sources).toHaveLength(1)
      expect(data.identity.extraction.voltageRange).toMatchObject({ min: 1.8, max: 3.6 })
    }
  })

  it('rejects invalid scoped Codex actions before policy evaluation', async () => {
    const result = await execTool('check_agent_action', {
      action: 'delete-everything',
      autonomy_tier: 'hardware-gated',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Invalid action')
  })
})

function getCreatedInstance(result: Awaited<ReturnType<typeof execTool>>): string {
  if (!result.ok) throw new Error(`Expected tool success: ${result.error}`)
  const data = result.data as { instance?: unknown }
  if (typeof data.instance !== 'string') throw new Error('Expected tool result to include instance')
  return data.instance
}

function makeSeedForAgentTools() {
  // The physical layer reads this as 3 component placements (r1, led1, btn1)
  // and 1 jumper: components create placements, and net1 bridges r1.out to led1.anode.
  return {
    ...emptyProject('agent-scene-test', 'esp32-devkitc-v4'),
    components: [
      { instance: 'r1', componentId: 'resistor-220r', position: [0, 0, 0] as [number, number, number], pinAssignments: {} },
      { instance: 'led1', componentId: 'led-5mm-red', position: [0, 0, 0] as [number, number, number], pinAssignments: {} },
      { instance: 'btn1', componentId: 'button-6mm', position: [0, 0, 0] as [number, number, number], pinAssignments: {} },
    ],
    nets: [
      { id: 'net1', endpoints: ['r1.out', 'led1.anode'] },
      { id: 'net2', endpoints: ['btn1.a', 'board.gpio4'] },
    ],
  }
}
