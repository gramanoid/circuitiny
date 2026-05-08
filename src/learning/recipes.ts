import { TEMPLATES } from '../templates'
import type { Project } from '../project/schema'
import type { LearningRecipe, RecipeCheckpoint, RecipeGuideStep } from './types'

let cachedRecipes: LearningRecipe[] | null = null
const recipeByProjectName = new Map<string, LearningRecipe | null>()
const MAX_PROJECT_CACHE_ENTRIES = 64

export function listRecipes(): LearningRecipe[] {
  cachedRecipes ??= TEMPLATES.map((tpl) => tpl.recipe).filter((r): r is LearningRecipe => !!r)
  return cachedRecipes
}

export function clearRecipeCache(): void {
  cachedRecipes = null
  clearProjectRecipeCache()
}

export function clearProjectRecipeCache(): void {
  recipeByProjectName.clear()
}

export function getRecipe(id: string | null | undefined): LearningRecipe | null {
  if (!id) return null
  return listRecipes().find((r) => r.id === id) ?? null
}

export function getRecipeStep(recipeId: string | null, index: number): RecipeGuideStep | null {
  const recipe = getRecipe(recipeId)
  if (!recipe || recipe.steps.length === 0) return null
  // Clamp recipe navigation for UI robustness; store actions also clamp to the active recipe's bounds.
  return recipe.steps[Math.max(0, Math.min(index, recipe.steps.length - 1))] ?? null
}

export function getActiveRecipeRefs(recipeId: string | null, index: number): string[] {
  const step = getRecipeStep(recipeId, index)
  return step?.refs ?? []
}

export function getCheckpoint(recipe: LearningRecipe | null, id: string | undefined): RecipeCheckpoint | null {
  if (!recipe || !id) return null
  return recipe.checkpoints.find((c) => c.id === id) ?? null
}

function projectIdentityKey(project: Project): string {
  const components = project.components.map((c) => c.componentId).sort()
  const behaviors = project.behaviors.map((b) => b.id).sort()
  return JSON.stringify([project.schemaVersion, project.name, project.board, components, behaviors])
}

function recipeProjectCacheKey(project: Project): string {
  const identity = projectIdentityKey(project)
  const tpl = TEMPLATES.find((tpl) => projectIdentityKey(tpl.project) === identity)
  return tpl?.id ?? `project:${identity}`
}

export function recipeForProject(project: Project): LearningRecipe | null {
  const key = recipeProjectCacheKey(project)
  const cached = readCachedProjectRecipe(key)
  if (cached !== undefined) return cached
  const recipe = key.startsWith('project:')
    ? null
    : (TEMPLATES.find((tpl) => tpl.id === key)?.recipe ?? null)
  return writeCachedProjectRecipe(key, recipe)
}

function readCachedProjectRecipe(key: string): LearningRecipe | null | undefined {
  const value = recipeByProjectName.get(key)
  if (value !== undefined) {
    recipeByProjectName.delete(key)
    recipeByProjectName.set(key, value)
  }
  return value
}

function writeCachedProjectRecipe(key: string, recipe: LearningRecipe | null): LearningRecipe | null {
  if (!recipeByProjectName.has(key) && recipeByProjectName.size >= MAX_PROJECT_CACHE_ENTRIES) {
    const oldest = recipeByProjectName.keys().next().value
    if (oldest !== undefined) recipeByProjectName.delete(oldest)
  }
  recipeByProjectName.set(key, recipe)
  return recipe
}

export function recipeProgressLabel(recipe: LearningRecipe, stepIndex: number): string {
  const current = Math.max(0, Math.min(stepIndex + 1, recipe.steps.length))
  return `${current}/${recipe.steps.length}`
}

export function recipeComponentIds(recipe: LearningRecipe): string[] {
  return recipe.requiredParts.map((p) => p.componentId)
}
