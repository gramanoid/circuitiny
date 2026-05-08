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
} from '../src/agent/tools'
import { useStore } from '../src/store'
import { TEMPLATES } from '../src/templates'
import { emptyProject } from '../src/project/schema'
import { catalog } from '../src/catalog'
import { resolveCatalogRender } from '../src/catalog/rendering'

describe('agent tools for beginner guidance', () => {
  beforeEach(() => {
    useStore.getState().loadProject(emptyProject('agent-tool-test', 'esp32-devkitc-v4'))
  })

  afterEach(() => {
    if (catalog.getComponent('capacitive-soil-moisture-sensor')) {
      catalog.removeComponent('capacitive-soil-moisture-sensor')
    }
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
})

function getCreatedInstance(result: Awaited<ReturnType<typeof execTool>>): string {
  if (!result.ok) throw new Error(`Expected tool success: ${result.error}`)
  const data = result.data as { instance?: unknown }
  if (typeof data.instance !== 'string') throw new Error('Expected tool result to include instance')
  return data.instance
}
