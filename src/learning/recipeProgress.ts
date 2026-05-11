export interface RecipeProgressSnapshot {
  version: number
  projectName: string
  recipeId: string
  stepIndex: number
  guidanceVisible: boolean
  updatedAt: string
}

export interface RecipeProgressStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type RecipeProgressSaveResult =
  | { ok: true }
  | { ok: true; skipped: true }
  | { ok: false; quotaExceeded: true }
  | { ok: false; reason: 'invalid-project-name' }
  | { ok: false; reason: 'storage-error' }

const STORAGE_PREFIX = 'circuitiny.recipe-progress'
const CURRENT_PROGRESS_VERSION = 1
const MISSING_PROJECT = '__missing_project__'
const MISSING_RECIPE = '__missing_recipe__'
const MAX_KEY_PART_LENGTH = 80

export function recipeProgressKey(projectName: string, recipeId: string): string {
  return `${STORAGE_PREFIX}.${encodedProgressKeyPart(projectName, MISSING_PROJECT)}.${encodedProgressKeyPart(recipeId, MISSING_RECIPE)}`
}

function encodedProgressKeyPart(value: string, fallback: string): string {
  const raw = progressKeyPart(value, fallback)
  const encoded = encodeURIComponent(raw)
  if (encoded.length <= MAX_KEY_PART_LENGTH) return encoded
  return `${encoded.slice(0, MAX_KEY_PART_LENGTH)}-${shortDeterministicHash(raw)}`
}

// This 32-bit FNV-1a suffix only keeps long localStorage keys compact and readable.
// Collisions are possible, so it must not be used as a security boundary or global identity.
function shortDeterministicHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function saveRecipeProgress(
  projectName: string,
  recipeId: string | null,
  stepIndex: number,
  guidanceVisible: boolean,
  storage: RecipeProgressStorage | null = defaultRecipeProgressStorage(),
): RecipeProgressSaveResult {
  if (!storage || !recipeId) return { ok: true, skipped: true }
  if (!projectName.trim()) {
    console.warn('Recipe progress was not saved: projectName is empty.')
    return { ok: false, reason: 'invalid-project-name' }
  }
  const snapshot: RecipeProgressSnapshot = {
    version: CURRENT_PROGRESS_VERSION,
    projectName,
    recipeId,
    stepIndex: Math.max(0, Math.floor(stepIndex)),
    guidanceVisible,
    updatedAt: new Date().toISOString(),
  }
  const key = recipeProgressKey(projectName, recipeId)
  try {
    storage.setItem(key, JSON.stringify(snapshot))
    return { ok: true }
  } catch (error) {
    if (isStorageQuotaError(error)) {
      console.warn(`Could not persist recipe progress for ${projectName}/${recipeId} at ${key}: storage quota exceeded.`)
      return { ok: false, quotaExceeded: true }
    }
    console.warn(`Could not persist recipe progress for ${projectName}/${recipeId} at ${key}: unexpected storage error.`, error)
    return { ok: false, reason: 'storage-error' }
  }
}

export function loadRecipeProgress(
  projectName: string,
  recipeId: string | null,
  totalSteps?: number | null,
  storage: RecipeProgressStorage | null = defaultRecipeProgressStorage(),
): RecipeProgressSnapshot | null {
  if (!storage || !recipeId) return null
  const raw = storage.getItem(recipeProgressKey(projectName, recipeId))
  if (!raw) return null
  try {
    const migrated = migrateRecipeProgress(JSON.parse(raw))
    if (!migrated || migrated.projectName !== projectName || migrated.recipeId !== recipeId) return null
    const stepIndex = typeof migrated.stepIndex === 'number' && Number.isFinite(migrated.stepIndex) ? migrated.stepIndex : 0
    const maxStep = typeof totalSteps === 'number' && Number.isFinite(totalSteps)
      ? Math.max(0, Math.floor(totalSteps) - 1)
      : null
    return {
      version: 1,
      projectName,
      recipeId,
      stepIndex: normalizeStepIndex(stepIndex, maxStep),
      guidanceVisible: migrated.guidanceVisible === true,
      updatedAt: typeof migrated.updatedAt === 'string' ? migrated.updatedAt : '',
    }
  } catch (error) {
    if (error instanceof SyntaxError) return null
    console.warn('Unexpected error loading recipe progress.', error)
    return null
  }
}

export function migrateRecipeProgress(value: unknown): RecipeProgressSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<RecipeProgressSnapshot>
  const hasExplicitVersion = Object.prototype.hasOwnProperty.call(parsed, 'version')
  const version = typeof parsed.version === 'number' ? parsed.version : 0
  // hasExplicitVersion distinguishes migratable legacy records with no version from
  // explicit version: 0 payloads, which CURRENT_PROGRESS_VERSION intentionally rejects.
  if (hasExplicitVersion && version === 0) return null
  if (version > CURRENT_PROGRESS_VERSION) return null
  if (version === CURRENT_PROGRESS_VERSION || version === 0) {
    if (typeof parsed.projectName !== 'string' || typeof parsed.recipeId !== 'string') return null
    return {
      version: CURRENT_PROGRESS_VERSION,
      projectName: parsed.projectName,
      recipeId: parsed.recipeId,
      stepIndex: typeof parsed.stepIndex === 'number' ? parsed.stepIndex : 0,
      guidanceVisible: parsed.guidanceVisible === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  }
  return null
}

function normalizeStepIndex(stepIndex: number, maxStep: number | null): number {
  const normalized = Math.max(0, Math.floor(stepIndex))
  return maxStep === null ? normalized : Math.min(maxStep, normalized)
}

export function clearRecipeProgress(
  projectName: string,
  recipeId: string | null,
  storage: RecipeProgressStorage | null = defaultRecipeProgressStorage(),
): void {
  if (!storage || !recipeId) return
  storage.removeItem(recipeProgressKey(projectName, recipeId))
}

export function defaultRecipeProgressStorage(): RecipeProgressStorage | null {
  const candidate = globalThis as { localStorage?: RecipeProgressStorage }
  return candidate.localStorage ?? null
}

function isStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { name?: unknown; code?: unknown }
  return record.name === 'QuotaExceededError' ||
    record.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    record.name === 'QUOTA_EXCEEDED_ERR' ||
    (typeof record.code === 'number' && (record.code === 22 || record.code === 1014))
}

function progressKeyPart(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}
