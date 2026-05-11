import { catalog } from '../catalog'
import { runDrc } from '../drc'
import type { DrcResult } from '../drc'
import type { Project } from '../project/schema'
import { derivePhysicalNets, runPhysicalDrc, type PhysicalDrcFinding, type PhysicalLayout } from '../physical/breadboard'
import { realityReadiness, type RealityFinding } from '../reality/check'
import type { CodexCliReasoningEffort } from './reasoningEffort'

const WEB_CRYPTO_RUNTIME = globalThis as typeof globalThis & { process?: unknown; window?: unknown }
const WEB_CRYPTO_SUBTLE = WEB_CRYPTO_RUNTIME.crypto?.subtle

export type CodexAutonomyTier = 'explain-only' | 'draft-edit' | 'guided-edit' | 'hardware-gated'
/** @see CodexCliReasoningEffort - Beginner Lab hides none/minimal; use low in new UI code. */
export type CodexReasoningEffort = CodexCliReasoningEffort
export type AgentActionKind =
  | 'inspect'
  | 'add-part'
  | 'place-part'
  | 'move-part'
  | 'delete-item'
  | 'connect'
  | 'connect-breadboard'
  | 'behavior-change'
  | 'code-change'
  | 'catalog-import'
  | 'camera-analysis'
  | 'build'
  | 'flash'
  | 'monitor'

export interface CodexSceneContext {
  projectSummary: {
    name: string
    board: string
    target: string
    components: Array<{ instance: string; componentId: string }>
    nets: Array<{ id: string; endpoints: string[] }>
    behaviors: Array<{ id: string; trigger: string }>
  }
  renderSummary: {
    selected: string | null
    componentCount: number
    catalogRenderCoverage: { withModel: number; primitiveOrFallback: number }
  }
  validationSummary: {
    drcErrors: number
    drcWarnings: number
    physicalDrcErrors: number
    physicalDrcWarnings: number
    realityReadiness: 'blocked' | 'warn' | 'pass' | 'unknown'
  }
  physicalSummary?: {
    nets: number
    jumpers: number
    placements: number
  }
  permissions: {
    autonomyTier: CodexAutonomyTier
    allowedActions: AgentActionKind[]
    riskyActions: AgentActionKind[]
  }
}

const ALLOWED_ACTIONS_BY_TIER: Record<CodexAutonomyTier, AgentActionKind[]> = {
  'explain-only': ['inspect'],
  'draft-edit': ['inspect', 'add-part', 'place-part', 'move-part', 'delete-item', 'connect', 'connect-breadboard', 'behavior-change', 'code-change'],
  'guided-edit': ['inspect', 'add-part', 'place-part', 'move-part', 'delete-item', 'connect', 'connect-breadboard', 'behavior-change', 'code-change', 'catalog-import', 'camera-analysis'],
  'hardware-gated': ['inspect', 'add-part', 'place-part', 'move-part', 'delete-item', 'connect', 'connect-breadboard', 'behavior-change', 'code-change', 'catalog-import', 'camera-analysis', 'build', 'flash', 'monitor'],
}

const RISKY_ACTIONS: AgentActionKind[] = ['catalog-import', 'camera-analysis', 'build', 'flash', 'monitor']

export interface AgentActionPolicyResult {
  allowed: boolean
  approvalRequired: boolean
  reason: string
  requiredValidation: string[]
}

export interface CanvasReference {
  attached: boolean
  dataUrl?: string
  contextId: string
  reason: string
}

export interface CanvasReferenceRequest {
  project: Project
  canvasDataUrl?: string | null
  enabledBySettings?: boolean
  explicitlyRequested?: boolean
  approved?: boolean
}

export interface AgentActionSession {
  id: string
  tool: string
  action: AgentActionKind
  changedObjects: string[]
  validationResults: Record<string, AgentValidationResult>
  beginnerSummary: string
  createdAt: string
}

const MAX_ACTION_SESSIONS = 20
const MAX_CANVAS_HASH_CACHE_ENTRIES = 8
// Renderer-scoped action history for the visible beginner lab. Tests call
// clearAgentActionSessions so sessions do not leak across cases.
const actionSessions: AgentActionSession[] = []
const canvasHashCache = new Map<string, string>()
let agentActionSessionCounter = 0

/**
 * Builds the compact scene snapshot shared with Codex.
 *
 * `precomputedDrc` can be supplied when the caller already ran `runDrc(project)`
 * and wants to avoid doing that work again. `precomputedPhysicalNetCount` can be
 * supplied with `physicalLayout` when the caller already derived physical nets
 * and wants to skip `derivePhysicalNets(physicalLayout)`.
 *
 * If either value is omitted this function computes it. Callers must ensure
 * provided values belong to the same project/layout; stale values can make
 * `validationSummary` or `physicalSummary` inconsistent with the visible scene.
 */
export function buildCodexSceneContext(options: {
  project: Project
  selected?: string | null
  physicalLayout?: PhysicalLayout
  precomputedPhysicalDrc?: PhysicalDrcFinding[]
  realityFindings?: RealityFinding[]
  autonomyTier?: CodexAutonomyTier
  precomputedDrc?: DrcResult
  precomputedPhysicalNetCount?: number
}): CodexSceneContext {
  const autonomyTier = options.autonomyTier ?? 'guided-edit'
  const drc = options.precomputedDrc ?? runDrc(options.project)
  const physicalFindings = options.precomputedPhysicalDrc
    ?? (options.physicalLayout ? runPhysicalDrc(options.physicalLayout, options.project) : [])
  const physicalNetCount = options.physicalLayout
    ? options.precomputedPhysicalNetCount ?? derivePhysicalNets(options.physicalLayout).length
    : 0
  const selected = options.selected && options.project.components.some((component) => component.instance === options.selected)
    ? options.selected
    : null
  const renderCoverage = catalogRenderCoverage(options.project)
  return {
    projectSummary: {
      name: options.project.name,
      board: options.project.board,
      target: options.project.target,
      components: options.project.components.map((component) => ({
        instance: component.instance,
        componentId: component.componentId,
      })),
      nets: options.project.nets.map((net) => ({ id: net.id, endpoints: net.endpoints })),
      behaviors: options.project.behaviors.map((behavior) => ({
        id: behavior.id,
        trigger: behavior.trigger.type,
      })),
    },
    renderSummary: {
      selected,
      componentCount: options.project.components.length,
      catalogRenderCoverage: renderCoverage,
    },
    validationSummary: {
      drcErrors: drc.errors.length,
      drcWarnings: drc.warnings.length,
      physicalDrcErrors: physicalFindings.filter((finding) => finding.severity === 'error').length,
      physicalDrcWarnings: physicalFindings.filter((finding) => finding.severity === 'warning').length,
      realityReadiness: options.realityFindings ? realityReadiness(options.realityFindings) : 'unknown',
    },
    ...(options.physicalLayout ? {
      physicalSummary: {
        nets: physicalNetCount,
        jumpers: options.physicalLayout.jumpers.length,
        placements: options.physicalLayout.placements.length,
      },
    } : {}),
    permissions: {
      autonomyTier,
      allowedActions: allowedActionsForTier(autonomyTier),
      riskyActions: riskyActions(),
    },
  }
}

export function evaluateAgentActionPolicy(
  action: AgentActionKind,
  autonomyTier: CodexAutonomyTier,
): AgentActionPolicyResult {
  const allowedActions = allowedActionsForTier(autonomyTier)
  if (!allowedActions.includes(action)) {
    return {
      allowed: false,
      approvalRequired: false,
      reason: `${action} is not allowed in ${autonomyTier} mode.`,
      requiredValidation: [],
    }
  }
  const approvalRequired = riskyActions().includes(action)
  return {
    allowed: true,
    approvalRequired,
    reason: approvalRequired
      ? `${action} needs explicit learner approval before Codex continues.`
      : `${action} is allowed in ${autonomyTier} mode.`,
    requiredValidation: validationForAction(action),
  }
}

export function validationForAction(action: AgentActionKind): string[] {
  switch (action) {
    case 'connect':
    case 'add-part':
    case 'delete-item':
      return ['drc']
    case 'place-part':
    case 'move-part':
    case 'connect-breadboard':
      return ['physical-drc']
    case 'behavior-change':
      return ['drc', 'simulation']
    case 'code-change':
      return ['drc', 'code-inspection']
    case 'build':
      return ['drc', 'build-log', 'user-approval']
    case 'flash':
      return ['drc', 'build-log', 'user-approval', 'serial-port']
    case 'monitor':
      return ['user-approval', 'serial-port']
    case 'catalog-import':
      return ['source-license-review', 'catalog-draft-review']
    case 'camera-analysis':
      return ['user-approval', 'reality-check-findings']
    case 'inspect':
      return []
    default: {
      const _exhaustive: never = action
      throw new Error(`Unhandled action kind: ${String(_exhaustive)}`)
    }
  }
}

export type AgentValidationResult = boolean | { ok: boolean; artifacts?: string[]; files?: string[]; outputIds?: string[] }

export function canAgentClaimReady(action: AgentActionKind, validationResults: Record<string, AgentValidationResult>): boolean {
  return validationForAction(action).every((validation) => validationResultSatisfied(validation, validationResults[validation]))
}

export function recordAgentActionSession(entry: Omit<AgentActionSession, 'id' | 'createdAt'>): AgentActionSession {
  agentActionSessionCounter += 1
  const session: AgentActionSession = {
    ...entry,
    id: `agent-action-${agentActionSessionCounter.toString(36)}`,
    createdAt: new Date().toISOString(),
  }
  actionSessions.unshift(session)
  actionSessions.splice(MAX_ACTION_SESSIONS)
  return session
}

export function listAgentActionSessions(): AgentActionSession[] {
  return actionSessions.map((session) => ({
    ...session,
    changedObjects: [...session.changedObjects],
    validationResults: { ...session.validationResults },
  }))
}

export function clearAgentActionSessions(): void {
  actionSessions.length = 0
  agentActionSessionCounter = 0
  canvasHashCache.clear()
}

function validationResultSatisfied(validation: string, result: AgentValidationResult | undefined): boolean {
  if (result === true) return true
  if (!result || typeof result !== 'object' || result.ok !== true) return false
  if (validation === 'simulation') return (result.outputIds?.length ?? result.artifacts?.length ?? 0) > 0
  if (validation === 'code-inspection') return (result.files?.length ?? result.artifacts?.length ?? 0) > 0
  return true
}

export async function generateContextID(value: unknown): Promise<string> {
  const text = stableStringify(value)
  return `ctx-${(await sha256Hex(text)).slice(0, 32)}`
}

// Always return a stable contextId, then gate attachment by data availability,
// learner approval, and the settings/explicit-request sharing controls.
export async function buildCanvasReference(request: CanvasReferenceRequest): Promise<CanvasReference> {
  const contextId = await generateContextID({
    project: request.project.name,
    schemaVersion: request.project.schemaVersion,
    canvas: request.canvasDataUrl ? await computeCanvasHash(request.canvasDataUrl) : null,
  })
  if (!request.canvasDataUrl) {
    return { attached: false, contextId, reason: 'No rendered canvas image is available.' }
  }
  if (!request.approved) {
    return { attached: false, contextId, reason: 'Screenshot attachment is waiting for learner approval.' }
  }
  if (!request.enabledBySettings && !request.explicitlyRequested) {
    return { attached: false, contextId, reason: 'Screenshot attachment is disabled.' }
  }
  return {
    attached: true,
    dataUrl: request.canvasDataUrl,
    contextId,
    reason: request.explicitlyRequested ? 'Screenshot was explicitly requested.' : 'Screenshot sharing is enabled.',
  }
}

export async function captureScreenshot(request: CanvasReferenceRequest): Promise<CanvasReference> {
  return buildCanvasReference(request)
}

export async function approveScreenshot(request: CanvasReferenceRequest, approved: boolean): Promise<CanvasReference> {
  return buildCanvasReference({ ...request, approved })
}

async function computeCanvasHash(canvasDataUrl: string): Promise<string> {
  const cached = canvasHashCache.get(canvasDataUrl)
  if (cached) {
    canvasHashCache.delete(canvasDataUrl)
    canvasHashCache.set(canvasDataUrl, cached)
    return cached
  }
  const hash = await generateContextID(canvasDataUrl)
  canvasHashCache.set(canvasDataUrl, hash)
  for (const oldest of canvasHashCache.keys()) {
    if (canvasHashCache.size <= MAX_CANVAS_HASH_CACHE_ENTRIES) break
    canvasHashCache.delete(oldest)
  }
  return hash
}

function allowedActionsForTier(tier: CodexAutonomyTier): AgentActionKind[] {
  return ALLOWED_ACTIONS_BY_TIER[tier]
}

function stableStringify(value: unknown, seen = new WeakSet<object>(), depth = 0, maxDepth = 100): string {
  if (depth > maxDepth) return '"[MaxDepth]"'
  if (value === undefined) return 'undefined'
  if (typeof value === 'bigint') return JSON.stringify(`${value.toString()}n`)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (seen.has(value)) return '"[Circular]"'
  seen.add(value)
  if (Array.isArray(value)) {
    const serialized = `[${value.map((entry) => stableStringify(entry, seen, depth + 1, maxDepth)).join(',')}]`
    seen.delete(value)
    return serialized
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([key, entry]) => [
        stableStringify(key, seen, depth + 1, maxDepth),
        stableStringify(entry, seen, depth + 1, maxDepth),
      ] as const)
      .sort(([a], [b]) => a.localeCompare(b))
    seen.delete(value)
    return `{"$map":[${entries.map(([key, entry]) => `[${key},${entry}]`).join(',') }]}`
  }
  if (value instanceof Set) {
    const entries = Array.from(value.values())
      .map((entry) => stableStringify(entry, seen, depth + 1, maxDepth))
      .sort()
    seen.delete(value)
    return `{"$set":[${entries.join(',') }]}`
  }
  const record = value as Record<string, unknown>
  const serialized = `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], seen, depth + 1, maxDepth)}`).join(',')}}`
  seen.delete(value)
  return serialized
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  if (!WEB_CRYPTO_SUBTLE) {
    throw new Error(
      `Web Crypto SHA-256 support is required to generate Codex scene context IDs. ` +
      `Detected crypto=${typeof WEB_CRYPTO_RUNTIME.crypto}, window=${typeof WEB_CRYPTO_RUNTIME.window}, process=${typeof WEB_CRYPTO_RUNTIME.process}.`
    )
  }
  const digest = await WEB_CRYPTO_SUBTLE.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function riskyActions(): AgentActionKind[] {
  return RISKY_ACTIONS
}

function catalogRenderCoverage(project: Project): { withModel: number; primitiveOrFallback: number } {
  let withModel = 0
  let primitiveOrFallback = 0
  for (const component of project.components) {
    const def = catalog.getComponent(component.componentId)
    const hasModel = !!def?.model
    const hasImportedGlb = !!catalog.getGlbUrl(component.componentId)
    if (hasModel || hasImportedGlb) {
      withModel += 1
    } else {
      primitiveOrFallback += 1
    }
  }
  return { withModel, primitiveOrFallback }
}
