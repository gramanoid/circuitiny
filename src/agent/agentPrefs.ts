import type { CodexAutonomyTier, CodexReasoningEffort } from './visualBuildAgent'

export const AGENT_PREFS_STORAGE_KEY = 'circuitiny:beginner-lab-agent'
export const AGENT_PREFS_VERSION = 1
export const AGENT_AUTONOMY_TIERS: CodexAutonomyTier[] = ['explain-only', 'draft-edit', 'guided-edit', 'hardware-gated']
// Beginner Lab hides legacy `none`/`minimal` to keep the effort choice educational: low, medium, high, or xhigh.
export const AGENT_REASONING_EFFORTS: CodexReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']
const AGENT_AUTONOMY_TIER_SET = new Set<unknown>(AGENT_AUTONOMY_TIERS)
const AGENT_REASONING_EFFORT_SET = new Set<unknown>(AGENT_REASONING_EFFORTS)

export function loadAgentPrefs(): { autonomy: CodexAutonomyTier; effort: CodexReasoningEffort } {
  try {
    const raw = localStorage.getItem(AGENT_PREFS_STORAGE_KEY)
    if (!raw) return normalizeAgentPrefs({})
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return normalizeAgentPrefs({})
    return normalizeAgentPrefs(migrateAgentPrefs(parsed))
  } catch (error) {
    console.debug('Failed to load beginner agent prefs; using defaults.', { key: AGENT_PREFS_STORAGE_KEY, error })
    return normalizeAgentPrefs({})
  }
}

export function saveAgentPrefs(autonomy: CodexAutonomyTier, effort: CodexReasoningEffort): void {
  try {
    localStorage.setItem(AGENT_PREFS_STORAGE_KEY, JSON.stringify({ version: AGENT_PREFS_VERSION, data: { autonomy, effort } }))
  } catch (error) {
    console.debug('Failed to save beginner agent prefs; keeping session values.', {
      version: AGENT_PREFS_VERSION,
      autonomy,
      effort,
      error,
    })
    // Session-scoped settings are acceptable if browser storage is unavailable.
  }
}

type MigratedAgentPrefs = Partial<{ autonomy: CodexAutonomyTier; effort: CodexReasoningEffort }> & { rawRecord?: unknown }

export function migrateAgentPrefs(value: unknown): MigratedAgentPrefs {
  if (!value || typeof value !== 'object') return {}
  const record = value as {
    version?: unknown
    data?: Partial<{ autonomy: CodexAutonomyTier; effort: CodexReasoningEffort }>
    autonomy?: CodexAutonomyTier
    effort?: CodexReasoningEffort | 'none' | 'minimal'
  }
  const version = typeof record.version === 'number' ? record.version : 0
  if (version === AGENT_PREFS_VERSION) return record.data ?? {}
  if (version > AGENT_PREFS_VERSION) {
    console.warn('Newer beginner agent prefs version found; preserving compatible fields.', { version, supportedVersion: AGENT_PREFS_VERSION })
    if (record.data) return record.data
    console.warn('Future beginner agent prefs missing data field; falling back to compatible top-level fields.', {
      version,
      rawRecord: record,
    })
    return {
      autonomy: record.autonomy,
      effort: record.effort === 'none' || record.effort === 'minimal' ? 'low' : record.effort,
      rawRecord: record,
    }
  }
  if (version === 0) {
    return {
      autonomy: record.autonomy,
      effort: record.effort === 'none' || record.effort === 'minimal' ? 'low' : record.effort,
    }
  }
  return {}
}

export function normalizeAgentPrefs(value: Partial<{ autonomy: CodexAutonomyTier; effort: CodexReasoningEffort }>): {
  autonomy: CodexAutonomyTier
  effort: CodexReasoningEffort
} {
  return {
    autonomy: isCodexAutonomyTier(value.autonomy) ? value.autonomy : 'guided-edit',
    effort: isCodexReasoningEffort(value.effort) ? value.effort : 'medium',
  }
}

function isCodexAutonomyTier(value: unknown): value is CodexAutonomyTier {
  return AGENT_AUTONOMY_TIER_SET.has(value)
}

function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return AGENT_REASONING_EFFORT_SET.has(value)
}
