import { describe, expect, it } from 'vitest'
import {
  clearRecipeProgress,
  loadRecipeProgress,
  recipeProgressKey,
  saveRecipeProgress,
  type RecipeProgressStorage,
} from '../src/learning/recipeProgress'
import { memoryStorage } from './helpers'

describe('recipe progress persistence', () => {
  it('saves, loads, and clears versioned recipe progress', () => {
    const storage = memoryStorage()

    expect(saveRecipeProgress('Blink LED', 'blink-led', 3, true, storage)).toEqual({ ok: true })
    const loaded = loadRecipeProgress('Blink LED', 'blink-led', 5, storage)

    expect(loaded).toMatchObject({
      version: 1,
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: 3,
      guidanceVisible: true,
    })
    const stored = JSON.parse(storage.getItem(recipeProgressKey('Blink LED', 'blink-led'))!)
    expect(stored.updatedAt).toBeDefined()
    expect(typeof stored.updatedAt).toBe('string')

    clearRecipeProgress('Blink LED', 'blink-led', storage)
    expect(loadRecipeProgress('Blink LED', 'blink-led', 5, storage)).toBeNull()
  })

  it('ignores malformed or mismatched stored progress', () => {
    const storage = memoryStorage()

    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), '{')
    expect(loadRecipeProgress('Blink LED', 'blink-led', 5, storage)).toBeNull()

    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), '{"version":1,"projectName":"Other","recipeId":"blink-led"}')
    expect(loadRecipeProgress('Blink LED', 'blink-led', 5, storage)).toBeNull()

    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), '{"version":1,"projectName":"Blink LED","recipeId":"other-id"}')
    expect(loadRecipeProgress('Blink LED', 'blink-led', 5, storage)).toBeNull()
  })

  it('clamps loaded progress to known recipe length', () => {
    const storage = memoryStorage()
    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), JSON.stringify({
      version: 1,
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: 99,
      guidanceVisible: true,
      updatedAt: '2026-05-09T00:00:00.000Z',
    }))

    expect(loadRecipeProgress('Blink LED', 'blink-led', 4, storage)?.stepIndex).toBe(3)

    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), JSON.stringify({
      version: 1,
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: 4,
      guidanceVisible: true,
      updatedAt: '2026-05-09T00:00:00.000Z',
    }))
    expect(loadRecipeProgress('Blink LED', 'blink-led', 4, storage)?.stepIndex).toBe(3)

    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), JSON.stringify({
      version: 1,
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: -1,
      guidanceVisible: true,
      updatedAt: '2026-05-09T00:00:00.000Z',
    }))
    expect(loadRecipeProgress('Blink LED', 'blink-led', 4, storage)?.stepIndex).toBe(0)

    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), JSON.stringify({
      version: 1,
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: 0,
      guidanceVisible: true,
      updatedAt: '2026-05-09T00:00:00.000Z',
    }))
    expect(loadRecipeProgress('Blink LED', 'blink-led', 4, storage)?.stepIndex).toBe(0)
  })

  it('uses deterministic fallback keys for empty identifiers', () => {
    expect(recipeProgressKey('', '')).toContain('__missing_project__')
    expect(recipeProgressKey('', '')).toContain('__missing_recipe__')
  })

  it('bounds long storage key parts while preserving uniqueness', () => {
    const longProject = 'Project '.repeat(40)
    const keyA = recipeProgressKey(longProject, 'blink-led')
    const keyB = recipeProgressKey(`${longProject}different`, 'blink-led')

    expect(keyA.length).toBeLessThan(220)
    expect(keyA).not.toBe(keyB)
  })

  it('migrates unversioned progress snapshots into the current schema', () => {
    const storage = memoryStorage()
    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), JSON.stringify({
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: 2,
      guidanceVisible: true,
      updatedAt: '2026-05-09T00:00:00.000Z',
    }))

    expect(loadRecipeProgress('Blink LED', 'blink-led', 4, storage)).toMatchObject({
      version: 1,
      stepIndex: 2,
      guidanceVisible: true,
    })
  })

  it('rejects future progress versions instead of discarding current progress parsing rules', () => {
    const storage = memoryStorage()
    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), JSON.stringify({
      version: 99,
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: 2,
    }))

    expect(loadRecipeProgress('Blink LED', 'blink-led', 4, storage)).toBeNull()
  })

  it('rejects explicit version zero while accepting missing legacy version', () => {
    const storage = memoryStorage()
    storage.setItem(recipeProgressKey('Blink LED', 'blink-led'), JSON.stringify({
      version: 0,
      projectName: 'Blink LED',
      recipeId: 'blink-led',
      stepIndex: 1,
    }))

    expect(loadRecipeProgress('Blink LED', 'blink-led', 4, storage)).toBeNull()
  })

  it('does not throw when storage quota is exceeded', () => {
    const storage: RecipeProgressStorage = {
      getItem: () => null,
      setItem: () => {
        const error = new Error('quota')
        error.name = 'QuotaExceededError'
        throw error
      },
      removeItem: () => undefined,
    }

    expect(saveRecipeProgress('Test', 'test-id', 0, true, storage)).toEqual({ ok: false, quotaExceeded: true })
  })

  it('treats legacy Firefox quota errors as storage quota failures', () => {
    const storage: RecipeProgressStorage = {
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error('quota'), { name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 })
      },
      removeItem: () => undefined,
    }

    expect(saveRecipeProgress('Test', 'test-id', 0, true, storage)).toEqual({ ok: false, quotaExceeded: true })
  })

  it('treats Safari quota names as storage quota failures', () => {
    const storage: RecipeProgressStorage = {
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error('quota'), { name: 'QUOTA_EXCEEDED_ERR', code: 22 })
      },
      removeItem: () => undefined,
    }

    expect(saveRecipeProgress('Test', 'test-id', 0, true, storage)).toEqual({ ok: false, quotaExceeded: true })
  })
})
