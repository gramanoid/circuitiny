import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../src/templates'
import { catalog } from '../src/catalog'
import { resolvePin } from '../src/project/pins'
import { runDrc } from '../src/drc'

describe('beginner recipe templates', () => {
  it('all templates include beginner learning metadata', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0)
    for (const tpl of TEMPLATES) {
      expect(tpl.recipe, `${tpl.id} missing recipe`).toBeDefined()
      expect(tpl.recipe.id).toBe(tpl.id)
      expect(tpl.recipe.goal.length).toBeGreaterThan(20)
      expect(tpl.recipe.concepts.length).toBeGreaterThan(0)
      expect(tpl.recipe.requiredParts.length).toBeGreaterThan(0)
      expect(tpl.recipe.wiringSteps.length).toBeGreaterThan(0)
      expect(tpl.recipe.checkpoints.length).toBeGreaterThan(0)
      expect(tpl.recipe.steps.length).toBeGreaterThan(0)
    }
  })

  it('recipe required parts exist in the catalog', () => {
    for (const tpl of TEMPLATES) {
      for (const part of tpl.recipe.requiredParts) {
        expect(catalog.getComponent(part.componentId), `${tpl.id}:${part.componentId}`).toBeDefined()
      }
    }
  })

  it('recipe wiring steps and highlighted refs resolve in the loaded project', () => {
    for (const tpl of TEMPLATES) {
      for (const step of tpl.recipe.wiringSteps) {
        expect(resolvePin(tpl.project, step.from), `${tpl.id}:${step.from}`).toBeDefined()
        expect(resolvePin(tpl.project, step.to), `${tpl.id}:${step.to}`).toBeDefined()
      }
      for (const step of tpl.recipe.steps) {
        for (const ref of step.refs ?? []) {
          expect(resolvePin(tpl.project, ref), `${tpl.id}:${step.id}:${ref}`).toBeDefined()
        }
      }
    }
  })

  it('recipe checkpoints reference real behavior ids', () => {
    for (const tpl of TEMPLATES) {
      const behaviorIds = new Set(tpl.project.behaviors.map((b) => b.id))
      for (const checkpoint of tpl.recipe.checkpoints) {
        if (checkpoint.behaviorId) {
          expect(behaviorIds.has(checkpoint.behaviorId), `${tpl.id}:${checkpoint.behaviorId}`).toBe(true)
        }
      }
    }
  })

  it('beginner templates are safe enough to simulate', () => {
    for (const tpl of TEMPLATES) {
      const drc = runDrc(tpl.project)
      expect(drc.errors, tpl.id).toHaveLength(0)
    }
  })
})
