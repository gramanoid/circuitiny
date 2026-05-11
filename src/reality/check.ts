import type { Project } from '../project/schema'
import { runDrc, type DrcResult } from '../drc'
import { catalog } from '../catalog'

export type RealityImageSource = 'camera' | 'photo'
export type RealityFindingKind = 'confirmed' | 'warning' | 'uncertain' | 'blocking' | 'pass'

export interface RealityConsent {
  cameraGranted: boolean
  imageStorageAllowed: boolean
  aiVisionAllowed: boolean
}

export type RealityImageRef =
  | { kind: 'blob-url'; url: string }
  | { kind: 'project-attachment'; attachmentId: string }

export interface RealityObservation {
  id: string
  kind: 'wire' | 'part' | 'polarity' | 'rail' | 'unknown'
  label: string
  endpoints?: [string, string]
  componentInstance?: string
  polarityReversed?: boolean
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface RealityFinding {
  id: string
  kind: RealityFindingKind
  severity?: 'blocking' | 'warning'
  riskScore?: number
  dependencyGroup?: 'safety-first' | 'wiring' | 'validation' | 'privacy'
  title: string
  message: string
  refs: string[]
  nextAction: string
}

export interface RealityCheckSession {
  id: string
  createdAt: string
  source: RealityImageSource
  consent: RealityConsent
  imageStored: boolean
  imageRef?: RealityImageRef
  observations: RealityObservation[]
  findings: RealityFinding[]
}

export interface RealityImageMetrics {
  width: number
  height: number
  blurScore?: number
  angleDegrees?: number
  occlusionRatio?: number
  boardConfidence?: number
  breadboardConfidence?: number
}

export interface RealityImageAlignment {
  ok: boolean
  confidence: 'high' | 'medium' | 'low'
  boardDetected: boolean
  breadboardDetected: boolean
  retakeReasons: string[]
}

export interface RealityVisionAdapter {
  analyze(project: Project, session: RealityCheckSession): Promise<RealityObservation[]>
}

const MIN_REALITY_IMAGE_WIDTH = 640
const MIN_REALITY_IMAGE_HEIGHT = 480
const MAX_REALITY_IMAGE_BLUR_SCORE = 0.45
const MAX_REALITY_IMAGE_ANGLE_DEGREES = 35
const MAX_REALITY_IMAGE_OCCLUSION_RATIO = 0.25
const MIN_REALITY_IMAGE_DETECTION_CONFIDENCE = 0.55

export interface RealityFixtureComponent {
  label: string
  componentInstance?: string
  componentId?: string
  confidence?: RealityObservation['confidence']
  notes?: string
}

export interface RealityFixtureWire {
  label: string
  endpoints?: [string, string]
  confidence?: RealityObservation['confidence']
  notes?: string
}

export interface RealityFixtureRail {
  label: string
  confidence?: RealityObservation['confidence']
  notes?: string
}

export interface RealityVisionFixture {
  components?: RealityFixtureComponent[]
  wires?: RealityFixtureWire[]
  rails?: RealityFixtureRail[]
  polarity?: Array<{ componentInstance: string; reversed: boolean; confidence?: RealityObservation['confidence']; notes?: string }>
  unknownObjects?: string[]
}

export type RealityVisionResult =
  | { ok: true; session: RealityCheckSession }
  | { ok: false; error: string }

export interface RealityCheckStorage {
  length?: number
  getItem(key: string): string | null
  key?(index: number): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear?(): void
}

export interface RealityRetentionPolicy {
  realitySessionRetentionMs?: number
  educationMode?: boolean
}

interface StoredRealityCheckSession {
  version: 1
  projectId: string
  schemaVersion: number
  savedAt: string
  session: RealityCheckSession
}

const REALITY_STORAGE_PREFIX = 'circuitiny.reality-check'
const REALITY_STORAGE_VERSION = 1
const REALITY_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
// checkRealityCheckQuota warns at 80% of this localStorage budget; domStringBytes
// estimates UTF-16 storage as string.length * 2, so 4 MB holds roughly 4 MB / average session bytes.
const REALITY_STORAGE_WARN_BYTES = 4 * 1024 * 1024
const TRANSIENT_REALITY_IMAGE_REF_MAX_ENTRIES = 25
const TRANSIENT_REALITY_IMAGE_REF_TTL_MS = 6 * 60 * 60 * 1000
// SPA callers must dispose replaced/dropped sessions with disposeRealityCheckSession;
// installRealityImageUnloadCleanup only covers full-page unloads.
const transientRealityImageRefs = new Map<string, { url: string; registeredAt: number }>()
const realityQuotaCache = new WeakMap<RealityCheckStorage, number>()
let transientRealityImageCleanupTimer: ReturnType<typeof setInterval> | null = null

/**
 * Creates a Reality Check session. If the session is later registered with a
 * blob-url image ref, SPA owners must call disposeRealityCheckSession when the
 * session is replaced or discarded; full-page unload cleanup is only a fallback.
 */
export function createRealityCheckSession(
  source: RealityImageSource,
  consent: RealityConsent,
  observations: RealityObservation[] = [],
  imageRef?: RealityImageRef,
): RealityCheckSession {
  const sessionId = `reality-${secureRandomId()}`
  return {
    id: sessionId,
    createdAt: new Date().toISOString(),
    source,
    consent,
    imageStored: consent.imageStorageAllowed && imageRef?.kind === 'project-attachment',
    ...(imageRef ? { imageRef } : {}),
    observations,
    findings: [],
  }
}

/**
 * Adds blob-url image refs to the module-level transientRealityImageRefs map.
 * The component that owns the session also owns disposal; failing to call
 * disposeRealityCheckSession can leave blob URLs alive across SPA navigation.
 */
export function registerRealitySessionImageRef(session: RealityCheckSession): void {
  if (session.imageRef?.kind === 'blob-url') {
    transientRealityImageRefs.delete(session.id)
    transientRealityImageRefs.set(session.id, { url: session.imageRef.url, registeredAt: Date.now() })
    pruneTransientRealityImageRefs()
    ensureTransientRealityImageCleanupTimer()
  }
}

export function releaseRealitySessionImageRef(sessionOrId: RealityCheckSession | string | null | undefined): void {
  if (!sessionOrId) return
  const sessionId = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId.id
  const entry = transientRealityImageRefs.get(sessionId)
  if (!entry) return
  revokeTransientRealityImageRef(sessionId, entry)
  stopTransientRealityImageCleanupTimerIfIdle()
}

export function disposeRealityCheckSession(sessionOrId: RealityCheckSession | string | null | undefined): void {
  releaseRealitySessionImageRef(sessionOrId)
}

export function releaseAllRealitySessionImageRefs(): void {
  for (const sessionId of Array.from(transientRealityImageRefs.keys())) {
    releaseRealitySessionImageRef(sessionId)
  }
  stopTransientRealityImageCleanupTimerIfIdle()
}

export function installRealityImageUnloadCleanup(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null | undefined = defaultWindowTarget(),
): () => void {
  if (!target) return () => {}
  const cleanup = () => releaseAllRealitySessionImageRefs()
  const onPageHide = (event: Event) => {
    if ('persisted' in event && (event as PageTransitionEvent).persisted) return
    cleanup()
  }
  target.addEventListener('beforeunload', cleanup)
  target.addEventListener('unload', cleanup)
  target.addEventListener('pagehide', onPageHide)
  return () => {
    target.removeEventListener('beforeunload', cleanup)
    target.removeEventListener('unload', cleanup)
    target.removeEventListener('pagehide', onPageHide)
  }
}

function ensureTransientRealityImageCleanupTimer(): void {
  if (transientRealityImageCleanupTimer || typeof setInterval !== 'function') return
  transientRealityImageCleanupTimer = setInterval(() => {
    pruneTransientRealityImageRefs()
    stopTransientRealityImageCleanupTimerIfIdle()
  }, TRANSIENT_REALITY_IMAGE_REF_TTL_MS)
  const maybeNodeTimer = transientRealityImageCleanupTimer as { unref?: () => void }
  maybeNodeTimer.unref?.()
}

function stopTransientRealityImageCleanupTimerIfIdle(): void {
  if (transientRealityImageRefs.size > 0 || !transientRealityImageCleanupTimer) return
  clearInterval(transientRealityImageCleanupTimer)
  transientRealityImageCleanupTimer = null
}

function pruneTransientRealityImageRefs(now = Date.now()): void {
  for (const [sessionId, entry] of Array.from(transientRealityImageRefs.entries())) {
    if (now - entry.registeredAt > TRANSIENT_REALITY_IMAGE_REF_TTL_MS) revokeTransientRealityImageRef(sessionId, entry)
  }
  while (transientRealityImageRefs.size > TRANSIENT_REALITY_IMAGE_REF_MAX_ENTRIES) {
    const oldest = Array.from(transientRealityImageRefs.entries())[0]
    if (!oldest) return
    revokeTransientRealityImageRef(oldest[0], oldest[1])
  }
}

function revokeTransientRealityImageRef(sessionId: string, entry: { url: string; registeredAt: number }): void {
  transientRealityImageRefs.delete(sessionId)
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(entry.url)
}

export function analyzeRealityCheck(project: Project, session: RealityCheckSession, drcResult?: DrcResult): RealityCheckSession {
  const drc = drcResult ?? runDrc(project)
  const findings = [
    ...validateConsent(session),
    ...compareObservedWires(project, session.observations),
    ...checkObservedPolarity(session.observations),
    ...checkBeginnerHardwareClues(project, session.observations),
    ...translateDrcForRealityCheck(drc),
  ]
  if (findings.length === 0) {
    findings.push({
      id: 'reality.pass.visible-build',
      kind: 'pass',
      title: 'Visible build matches current checks',
      message: 'No visible wiring mismatch was found in the provided observations.',
      refs: [],
      nextAction: 'Run simulation or build validation next; a photo cannot prove every electrical condition.',
    })
  }
  return { ...session, findings: prioritizeFindings(findings) }
}

export function evaluateRealityImageAlignment(metrics: RealityImageMetrics): RealityImageAlignment {
  const retakeReasons: string[] = []
  if (metrics.width < MIN_REALITY_IMAGE_WIDTH || metrics.height < MIN_REALITY_IMAGE_HEIGHT) retakeReasons.push('Photo is too small; move closer or use a higher-resolution image.')
  if ((metrics.blurScore ?? 0) > MAX_REALITY_IMAGE_BLUR_SCORE) retakeReasons.push('Photo is blurry; retake from above with steadier lighting.')
  if ((metrics.angleDegrees ?? 0) > MAX_REALITY_IMAGE_ANGLE_DEGREES) retakeReasons.push('Camera angle is too steep; retake from more directly above the breadboard.')
  if ((metrics.occlusionRatio ?? 0) > MAX_REALITY_IMAGE_OCCLUSION_RATIO) retakeReasons.push('Parts or hands cover too much of the board; clear the view and retake.')
  const boardDetected = (metrics.boardConfidence ?? 0) >= MIN_REALITY_IMAGE_DETECTION_CONFIDENCE
  const breadboardDetected = (metrics.breadboardConfidence ?? 0) >= MIN_REALITY_IMAGE_DETECTION_CONFIDENCE
  if (!boardDetected) retakeReasons.push('ESP32 board was not detected confidently.')
  if (!breadboardDetected) retakeReasons.push('Breadboard was not detected confidently.')
  const confidence: RealityImageAlignment['confidence'] = retakeReasons.length === 0
    ? 'high'
    : retakeReasons.length <= 2 && boardDetected && breadboardDetected
      ? 'medium'
      : 'low'
  return {
    ok: retakeReasons.length === 0,
    confidence,
    boardDetected,
    breadboardDetected,
    retakeReasons,
  }
}

export async function runApprovedRealityVision(
  project: Project,
  session: RealityCheckSession,
  adapter: RealityVisionAdapter,
): Promise<RealityVisionResult> {
  if (!session.consent.aiVisionAllowed) {
    return { ok: false, error: 'AI vision requires explicit approval for this Reality Check.' }
  }
  if (!session.imageRef) {
    return { ok: false, error: 'AI vision needs a reviewed photo or camera image reference.' }
  }
  const observations = await adapter.analyze(project, session)
  const visionSession: RealityCheckSession = {
    ...session,
    observations: [
      ...session.observations,
      ...observations.map((observation) => ({
        ...observation,
        confidence: 'low' as const,
        notes: observation.notes ? `AI vision draft: ${observation.notes}` : 'AI vision draft; learner confirmation is still required.',
      })),
    ],
  }
  return { ok: true, session: analyzeRealityCheck(project, visionSession) }
}

export function observationsFromRealityFixture(project: Project, fixture: RealityVisionFixture): RealityObservation[] {
  const observations: RealityObservation[] = []
  for (const [index, component] of (fixture.components ?? []).entries()) {
    const projectComponent = component.componentInstance
      ? project.components.find((candidate) => candidate.instance === component.componentInstance)
      : component.componentId
        ? project.components.find((candidate) => candidate.componentId === component.componentId)
        : null
    const catalogPart = projectComponent ? catalog.getComponent(projectComponent.componentId) : undefined
    observations.push({
      id: `fixture-part-${index + 1}`,
      kind: projectComponent ? 'part' : 'unknown',
      label: component.label,
      ...(projectComponent ? { componentInstance: projectComponent.instance } : {}),
      confidence: component.confidence ?? (projectComponent ? 'high' : 'low'),
      notes: component.notes ?? (projectComponent
        ? `Catalog match: ${projectComponent.componentId}; ${catalogPart?.pins.length ?? 0} pins; ${catalogPart?.category ?? 'unknown'}; trust ${catalogPart?.catalogMeta?.trust ?? 'user-installed'}.`
        : 'Unknown visible object needs manual identification.'),
    })
  }
  for (const [index, wire] of (fixture.wires ?? []).entries()) {
    observations.push({
      id: `fixture-wire-${index + 1}`,
      kind: 'wire',
      label: wire.label,
      ...(wire.endpoints ? { endpoints: wire.endpoints } : {}),
      confidence: wire.confidence ?? (wire.endpoints ? 'high' : 'low'),
      ...(wire.notes ? { notes: wire.notes } : {}),
    })
  }
  for (const [index, rail] of (fixture.rails ?? []).entries()) {
    observations.push({
      id: `fixture-rail-${index + 1}`,
      kind: 'rail',
      label: rail.label,
      confidence: rail.confidence ?? 'medium',
      notes: rail.notes,
    })
  }
  for (const [index, polarity] of (fixture.polarity ?? []).entries()) {
    observations.push({
      id: `fixture-polarity-${index + 1}`,
      kind: 'polarity',
      label: `${polarity.componentInstance} polarity`,
      componentInstance: polarity.componentInstance,
      polarityReversed: polarity.reversed,
      confidence: polarity.confidence ?? 'medium',
      notes: polarity.notes,
    })
  }
  for (const [index, label] of (fixture.unknownObjects ?? []).entries()) {
    observations.push({
      id: `fixture-unknown-${index + 1}`,
      kind: 'unknown',
      label,
      confidence: 'low',
      notes: 'Unknown object detected in the build area.',
    })
  }
  return observations
}

export function realityReadiness(findings: RealityFinding[]): 'blocked' | 'warn' | 'pass' {
  if (findings.some((finding) => finding.kind === 'blocking')) return 'blocked'
  if (findings.some((finding) => finding.kind === 'warning' || finding.kind === 'uncertain')) return 'warn'
  return 'pass'
}

function validateConsent(session: RealityCheckSession): RealityFinding[] {
  const findings: RealityFinding[] = []
  if (session.source === 'camera' && !session.consent.cameraGranted) {
    findings.push({
      id: 'reality.privacy.camera',
      kind: 'blocking',
      title: 'Camera permission is required',
      message: 'Reality Check cannot use the camera until you approve camera access.',
      refs: [],
      nextAction: 'Approve camera access or choose a photo instead.',
    })
  }
  if (!session.consent.aiVisionAllowed && session.observations.some((observation) => observation.confidence === 'low')) {
    findings.push({
      id: 'reality.privacy.local-only',
      kind: 'uncertain',
      title: 'Low-confidence local observation',
      message: 'AI vision is not approved, so uncertain items need manual confirmation.',
      refs: [],
      nextAction: 'Retake the photo, confirm the item manually, or approve AI vision for this check.',
    })
  }
  return findings
}

function compareObservedWires(project: Project, observations: RealityObservation[]): RealityFinding[] {
  return observations
    .filter((observation) => observation.kind === 'wire')
    .map((observation) => wireFinding(project, observation))
}

function wireFinding(project: Project, observation: RealityObservation): RealityFinding {
  if (!observation.endpoints) {
    return {
      id: `reality.wire.uncertain.${observation.id}`,
      kind: 'uncertain',
      title: 'Wire endpoint is unclear',
      message: `${observation.label} does not have two clear endpoints.`,
      refs: [observation.id],
      nextAction: 'Retake from a lower angle or confirm both endpoints manually.',
    }
  }
  const [a, b] = observation.endpoints
  if (observation.confidence === 'low') {
    return {
      id: `reality.wire.low-confidence.${observation.id}`,
      kind: 'uncertain',
      title: 'Wire match is uncertain',
      message: `${observation.label} appears to connect ${a} and ${b}, but confidence is low.`,
      refs: [a, b],
      nextAction: 'Confirm this wire before using it as proof.',
    }
  }
  const matchingNet = project.nets.find((net) => endpointsContainBoth(net.endpoints, a, b))
  if (matchingNet) {
    return {
      id: `reality.wire.confirmed.${observation.id}`,
      kind: 'confirmed',
      title: 'Wire matches project',
      message: `${observation.label} matches ${matchingNet.id}.`,
      refs: [a, b],
      nextAction: 'Continue to the next unconfirmed wire.',
    }
  }
  const nearbyNet = project.nets.find((net) => endpointMatches(net.endpoints, a) || endpointMatches(net.endpoints, b))
  return {
    id: `reality.wire.mismatch.${observation.id}`,
    kind: 'blocking',
    title: 'Wire does not match the project',
    message: nearbyNet
      ? `${observation.label} shares one endpoint with ${nearbyNet.id}, but the other endpoint differs from the project.`
      : `${observation.label} is not present in the current project nets.`,
    refs: [a, b],
    nextAction: 'Move the wire to the highlighted project endpoint before powering hardware.',
  }
}

function checkObservedPolarity(observations: RealityObservation[]): RealityFinding[] {
  return observations
    .filter((observation) => observation.kind === 'polarity' && observation.polarityReversed === true)
    .map((observation) => ({
      id: `reality.polarity.${observation.id}`,
      kind: 'blocking' as const,
      title: 'Polarity appears reversed',
      message: `${observation.label} appears to be installed backwards.`,
      refs: observation.componentInstance ? [observation.componentInstance] : [observation.id],
      nextAction: 'Flip the polarized part so the anode/cathode or +/− markings match the recipe before applying power.',
    }))
}

function checkBeginnerHardwareClues(project: Project, observations: RealityObservation[]): RealityFinding[] {
  const findings: RealityFinding[] = []
  const patterns = getHardwareCluePatterns()
  for (const observation of observations) {
    const text = `${observation.label} ${observation.notes ?? ''}`.toLowerCase()
    if (observation.kind === 'wire' && observation.endpoints && connectsPowerToGround(observation.endpoints)) {
      findings.push({
        id: `reality.short.${observation.id}`,
        kind: 'blocking',
        title: 'Power and ground may be shorted',
        message: `${observation.label} appears to connect power directly to ground.`,
        refs: observation.endpoints,
        nextAction: 'Remove that jumper before connecting USB or battery power.',
      })
    }
    if (patterns.missingGround.test(text)) {
      findings.push({
        id: `reality.ground.${observation.id}`,
        kind: 'blocking',
        title: 'Ground connection may be missing',
        message: `${observation.label} indicates the real build may not share ground with the ESP32.`,
        refs: observation.componentInstance ? [observation.componentInstance] : [observation.id],
        nextAction: 'Add the ground jumper shown in the recipe before testing signals.',
      })
    }
    if (patterns.missingResistor.test(text)) {
      findings.push({
        id: `reality.resistor.${observation.id}`,
        kind: project.components.some((component) => component.componentId.includes('led')) ? 'blocking' : 'warning',
        title: 'Current-limiting resistor may be missing',
        message: `${observation.label} suggests an LED or output path may not have a series resistor.`,
        refs: observation.componentInstance ? [observation.componentInstance] : [observation.id],
        nextAction: 'Put a resistor in series with the LED before powering the circuit.',
      })
    }
    if (patterns.railGap.test(text)) {
      findings.push({
        id: `reality.rail-gap.${observation.id}`,
        kind: 'warning',
        title: 'Power rail gap needs a bridge',
        message: `${observation.label} mentions a rail gap or split rail.`,
        refs: [observation.id],
        nextAction: 'Add a short jumper across matching rail segments or keep all power wires on one segment.',
      })
    }
    if (patterns.buttonSameRow.test(text)) {
      findings.push({
        id: `reality.button.${observation.id}`,
        kind: 'warning',
        title: 'Button orientation may not change the circuit',
        message: `${observation.label} looks like the button legs are in one connected row.`,
        refs: observation.componentInstance ? [observation.componentInstance] : [observation.id],
        nextAction: 'Rotate the button so it bridges the breadboard center gap.',
      })
    }
  }
  return findings
}

interface HardwareCluePatterns {
  missingGround: RegExp
  missingResistor: RegExp
  railGap: RegExp
  buttonSameRow: RegExp
}

const ENGLISH_HARDWARE_CLUE_PATTERNS: HardwareCluePatterns = {
  missingGround: /missing ground|ground missing|no ground/,
  missingResistor: /missing resistor|no resistor|resistor missing/,
  railGap: /rail gap|split rail|rail break/,
  buttonSameRow: /button.*same row|same row.*button/,
}

// Locale hook for future translations; observations are normalized to lowercase
// before matching, and English remains the default beginner-lab vocabulary.
function getHardwareCluePatterns(): HardwareCluePatterns {
  return ENGLISH_HARDWARE_CLUE_PATTERNS
}

function connectsPowerToGround(endpoints: [string, string]): boolean {
  const [a, b] = endpoints.map((endpoint) => endpoint.toLowerCase())
  return (isPowerRef(a) && isGroundRef(b)) || (isPowerRef(b) && isGroundRef(a))
}

const catalogPowerPinIds = new Set(
  catalog.listBoards().flatMap((board) =>
    board.pins.filter((pin) => pin.type === 'power_in' || pin.type === 'power_out').map((pin) => pin.id.toLowerCase()))
)
const catalogGroundPinIds = new Set(
  catalog.listBoards().flatMap((board) =>
    board.pins.filter((pin) => pin.type === 'ground').map((pin) => pin.id.toLowerCase()))
)
const fallbackPowerPinIds = new Set(['3v3', '3v3_a', '3v3_b', '5v0', 'vin', 'vbat'])
const fallbackGroundPinIds = new Set(['gnd', 'gnd_l', 'gnd_r', 'gnd_center', 'ground'])

function isPowerRef(endpoint: string): boolean {
  const pinId = endpointPinId(endpoint)
  return catalogPowerPinIds.has(pinId) || fallbackPowerPinIds.has(pinId)
}

function isGroundRef(endpoint: string): boolean {
  const pinId = endpointPinId(endpoint)
  return catalogGroundPinIds.has(pinId) || fallbackGroundPinIds.has(pinId)
}

function endpointPinId(endpoint: string): string {
  return endpoint.split('.').at(-1)?.trim().toLowerCase() ?? ''
}

function translateDrcForRealityCheck(drc: DrcResult): RealityFinding[] {
  const errors = drc.errors.map((violation) => ({
    id: `reality.drc.${violation.id}`,
    kind: 'blocking' as const,
    title: 'Project DRC still blocks hardware',
    message: violation.message,
    refs: violation.involves,
    nextAction: formatDrcFixHint(violation.fixHint),
  }))
  const warnings = drc.warnings.map((violation) => ({
    id: `reality.drc.${violation.id}`,
    kind: 'warning' as const,
    title: 'Project DRC warning still needs review',
    message: violation.message,
    refs: violation.involves,
    nextAction: formatDrcFixHint(violation.fixHint),
  }))
  return [...errors, ...warnings]
}

function endpointMatches(endpoints: string[], candidate: string): boolean {
  const normalized = normalizePinRef(candidate)
  return endpoints.some((endpoint) => {
    const projectEndpoint = normalizePinRef(endpoint)
    return projectEndpoint === normalized
  })
}

function endpointsContainBoth(endpoints: string[], a: string, b: string): boolean {
  return endpointMatches(endpoints, a) && endpointMatches(endpoints, b)
}

// Reality Check matching is learner-facing, so pin refs are trimmed and lowercased consistently.
function normalizePinRef(value: string): string {
  return value.trim().toLowerCase()
}

type DrcFixHint = string | { action?: string } | undefined

function formatDrcFixHint(fixHint: DrcFixHint): string {
  if (typeof fixHint === 'string' && fixHint.trim()) return fixHint
  if (fixHint && typeof fixHint === 'object' && fixHint.action?.trim()) return fixHint.action
  return 'Fix the DRC error before trusting the physical build.'
}

export function saveRealityCheckSession(
  project: Project,
  session: RealityCheckSession,
  storage: RealityCheckStorage | null = defaultRealityCheckStorage(),
): void {
  if (!storage) return
  const projectId = realityProjectId(project)
  const stored: StoredRealityCheckSession = {
    version: REALITY_STORAGE_VERSION,
    projectId,
    schemaVersion: project.schemaVersion,
    savedAt: new Date().toISOString(),
    session: serializeRealitySession(session),
  }
  const key = realityCheckStorageKey(project)
  const raw = JSON.stringify(stored)
  let quota = checkRealityCheckQuota(storage, key, raw)
  if (quota.nearLimit) {
    console.warn('Reality Check storage is near quota; purging old sessions before save.', quota)
    purgeOldRealityCheckSessions(project, storage)
    quota = checkRealityCheckQuota(storage, key, raw)
  }
  try {
    const previousRaw = storage.getItem(key)
    storage.setItem(key, raw)
    updateRealityQuotaCache(storage, key, raw, previousRaw)
  } catch (error) {
    if (isRealityStorageQuotaError(error)) {
      console.error('Reality Check storage quota exceeded; session not saved.', { key, quota, error })
      return
    }
    throw error
  }
}

/**
 * Loads the most recent Reality Check session for the project.
 * Circuitiny stores one Reality Check session per project key, so the array is either empty or single-item.
 */
export function loadRealityCheckSessions(
  project: Project,
  storage: RealityCheckStorage | null = defaultRealityCheckStorage(),
  retentionPolicy: RealityRetentionPolicy = {},
): RealityCheckSession[] {
  if (!storage) return []
  const key = realityCheckStorageKey(project)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch (error) {
    console.warn('Reality Check storage read failed; ignoring saved session.', { key, error })
    return []
  }
  if (!raw) return []
  const migrated = migrateRealityCheckSessions(project, raw, retentionPolicy)
  if (!migrated) {
    try {
      storage.removeItem(key)
      updateRealityQuotaCache(storage, key, null, raw)
    } catch (error) {
      console.warn('Reality Check storage cleanup failed after migration rejection.', { key, error })
    }
    return []
  }
  try {
    const quota = checkRealityCheckQuota(storage)
    if (quota.nearLimit) console.warn('Reality Check storage is near quota during load.', quota)
  } catch (error) {
    console.warn('Reality Check quota refresh failed during load; ignoring saved session.', { key, error })
    return []
  }
  if (migrated.raw !== raw) {
    try {
      storage.setItem(key, migrated.raw)
      updateRealityQuotaCache(storage, key, migrated.raw, raw)
    } catch (error) {
      console.warn('Reality Check storage migration write failed; ignoring saved session.', { key, error })
      return []
    }
  }
  return [migrated.session]
}

/**
 * Reject newer on-disk schemaVersion values, but accept older versions with a
 * warning so forward project schemaVersion changes stay readable. Retention
 * still runs through isExpired/retentionPolicy after the version checks.
 */
export function migrateRealityCheckSessions(
  project: Project,
  raw: string,
  retentionPolicy: RealityRetentionPolicy = {},
): { raw: string; session: RealityCheckSession } | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRealityCheckSession> | RealityCheckSession
    const projectId = realityProjectId(project)
    if ('session' in parsed) {
      const migratedSession = migrateStoredSession(parsed)
      if (!migratedSession) return null
      if (parsed.projectId !== projectId) return null
      if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > project.schemaVersion) return null
      if (parsed.schemaVersion !== project.schemaVersion) {
        console.warn('Migrating Reality Check session schemaVersion.', {
          from: parsed.schemaVersion,
          to: project.schemaVersion,
          projectId,
        })
      }
      if (isExpired(parsed.savedAt, retentionPolicy)) return null
      const session = serializeRealitySession(migratedSession)
      const stored: StoredRealityCheckSession = {
        version: REALITY_STORAGE_VERSION,
        projectId,
        schemaVersion: project.schemaVersion,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
        session,
      }
      return { raw: JSON.stringify(stored), session }
    }
    if (isRealityCheckSession(parsed)) {
      const session = serializeRealitySession(parsed)
      if (isExpired(session.createdAt, retentionPolicy)) return null
      const stored: StoredRealityCheckSession = {
        version: REALITY_STORAGE_VERSION,
        projectId,
        schemaVersion: project.schemaVersion,
        savedAt: new Date().toISOString(),
        session,
      }
      return { raw: JSON.stringify(stored), session }
    }
    return null
  } catch (error) {
    console.warn('Failed to migrate Reality Check session; returning null.', { rawLength: raw.length, error })
    return null
  }
}

function migrateStoredSession(parsed: Partial<StoredRealityCheckSession>): RealityCheckSession | null {
  const version = typeof parsed.version === 'number' ? parsed.version : 0
  if (version > REALITY_STORAGE_VERSION) return null
  return isRealityCheckSession(parsed.session) ? parsed.session : null
}

export function purgeOldRealityCheckSessions(
  project: Project,
  storage: RealityCheckStorage | null = defaultRealityCheckStorage(),
  retentionPolicy: RealityRetentionPolicy = {},
): void {
  if (!storage) return
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key?.(index))
      .filter((key): key is string => !!key && key.startsWith(REALITY_STORAGE_PREFIX))
    for (const key of keys) {
      const raw = storage.getItem(key)
      if (!raw || isPurgeableRealitySession(raw, retentionPolicy)) {
        storage.removeItem(key)
        updateRealityQuotaCache(storage, key, null, raw)
      }
    }
    return
  }
  const loaded = loadRealityCheckSessions(project, storage, retentionPolicy)
  if (loaded.length === 0) {
    const key = realityCheckStorageKey(project)
    const previousRaw = storage.getItem(key)
    storage.removeItem(key)
    updateRealityQuotaCache(storage, key, null, previousRaw)
  }
}

function isPurgeableRealitySession(raw: string, retentionPolicy: RealityRetentionPolicy): boolean {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRealityCheckSession> | RealityCheckSession
    if ('session' in parsed) {
      return !migrateStoredSession(parsed) || isExpired(parsed.savedAt, retentionPolicy)
    }
    if (isRealityCheckSession(parsed)) return isExpired(parsed.createdAt, retentionPolicy)
    return true
  } catch {
    return true
  }
}

export function realityCheckStorageKey(project: Project): string {
  return `${REALITY_STORAGE_PREFIX}.${encodeURIComponent(realityProjectId(project))}`
}

export function checkRealityCheckQuota(
  storage: RealityCheckStorage | null = defaultRealityCheckStorage(),
  pendingKey?: string,
  pendingValue?: string,
  limitBytes = REALITY_STORAGE_WARN_BYTES,
): { usedBytes: number; limitBytes: number; nearLimit: boolean } {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') {
    const usedBytes = domStringBytes(pendingValue)
    return { usedBytes, limitBytes, nearLimit: usedBytes >= limitBytes * 0.8 }
  }
  const cachedBytes = realityQuotaCache.get(storage)
  if (cachedBytes !== undefined) {
    const existingPendingBytes = pendingKey ? domStringBytes(storage.getItem(pendingKey)) : 0
    const usedBytes = cachedBytes + domStringBytes(pendingValue) - existingPendingBytes
    return { usedBytes, limitBytes, nearLimit: usedBytes >= limitBytes * 0.8 }
  }
  const usedBytes = computeRealityStorageBytes(storage, pendingKey, pendingValue)
  const existingPendingBytes = pendingKey ? domStringBytes(storage.getItem(pendingKey)) : 0
  // computeRealityStorageBytes skips pendingKey and includes pendingValue; the
  // realityQuotaCache stores the current state, so subtract domStringBytes(pendingValue)
  // and add the current pendingKey bytes before the pending write lands.
  realityQuotaCache.set(storage, usedBytes - domStringBytes(pendingValue) + existingPendingBytes)
  return { usedBytes, limitBytes, nearLimit: usedBytes >= limitBytes * 0.8 }
}

function computeRealityStorageBytes(storage: RealityCheckStorage, pendingKey?: string, pendingValue?: string): number {
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') {
    return domStringBytes(pendingValue)
  }
  const length = storage.length
  let usedBytes = 0
  for (let i = 0; i < length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(REALITY_STORAGE_PREFIX)) continue
    if (key === pendingKey) continue
    usedBytes += domStringBytes(storage.getItem(key))
  }
  usedBytes += domStringBytes(pendingValue)
  return usedBytes
}

function updateRealityQuotaCache(storage: RealityCheckStorage, key: string, value: string | null, previousValue: string | null): void {
  if (!key.startsWith(REALITY_STORAGE_PREFIX)) return
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') return
  const cachedBytes = realityQuotaCache.get(storage)
  if (cachedBytes === undefined) {
    realityQuotaCache.set(storage, computeRealityStorageBytes(storage))
    return
  }
  const previousBytes = domStringBytes(previousValue)
  const nextBytes = domStringBytes(value)
  realityQuotaCache.set(storage, Math.max(0, cachedBytes - previousBytes + nextBytes))
}

function domStringBytes(value: string | null | undefined): number {
  return (value?.length ?? 0) * 2
}

function realityProjectId(project: Project): string {
  const name = project.name.trim()
  const stableName = name || `untitled-${projectContentFingerprint(project)}`
  return `${stableName}:${project.target}:${project.board}`
}

function projectContentFingerprint(project: Project): string {
  const text = JSON.stringify({
    schemaVersion: project.schemaVersion,
    target: project.target,
    board: project.board,
    components: project.components.map((component) => [component.instance, component.componentId]),
    nets: project.nets.map((net) => [net.id, [...net.endpoints].sort()]),
    behaviors: project.behaviors.map((behavior) => behavior.id),
  })
  // Non-cryptographic, non-unique fingerprint used only to keep unnamed local
  // storage keys stable enough for beginner Reality Check sessions.
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 33) ^ text.charCodeAt(i)) >>> 0
  }
  return (hash >>> 0).toString(36)
}

function serializeRealitySession(session: RealityCheckSession): RealityCheckSession {
  const imageRef = serializableRealityImageRef(session)
  const { imageRef: _transientImageRef, ...sessionWithoutImageRef } = session
  return {
    ...sessionWithoutImageRef,
    imageStored: !!imageRef,
    ...(imageRef ? { imageRef } : {}),
    consent: { ...session.consent },
    observations: session.observations.map((observation) => ({ ...observation })),
    findings: session.findings.map((finding) => ({
      ...finding,
      refs: [...finding.refs],
    })),
  }
}

function serializableRealityImageRef(session: RealityCheckSession): RealityImageRef | undefined {
  if (!session.consent.imageStorageAllowed) return undefined
  if (session.imageRef?.kind === 'project-attachment') return session.imageRef
  return undefined
}

function isRealityCheckSession(value: unknown): value is RealityCheckSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RealityCheckSession>
  const consent = candidate.consent
  return typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    (candidate.source === 'camera' || candidate.source === 'photo') &&
    !!consent &&
    typeof consent === 'object' &&
    typeof consent.cameraGranted === 'boolean' &&
    typeof consent.imageStorageAllowed === 'boolean' &&
    typeof consent.aiVisionAllowed === 'boolean' &&
    Array.isArray(candidate.observations) &&
    Array.isArray(candidate.findings)
}

/**
 * Creates a best-effort unique local session id. The timestamp branch is a
 * non-cryptographic fallback for runtimes without Web Crypto and is not safe
 * for secrets, authorization, or externally trusted identifiers.
 */
function secureRandomId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  const fallbackId = `${Date.now().toString(36)}-${performance.now().toString(36).replace('.', '')}`
  console.warn('Reality Check secure random source is unavailable; using non-cryptographic timestamp fallback id.', { fallbackId })
  return fallbackId
}

function defaultWindowTarget(): Pick<Window, 'addEventListener' | 'removeEventListener'> | null {
  return typeof window === 'undefined' ? null : window
}

function isExpired(timestamp: unknown, retentionPolicy: RealityRetentionPolicy = {}): boolean {
  if (typeof timestamp !== 'string') return true
  const time = Date.parse(timestamp)
  // retentionPolicy.educationMode extends REALITY_SESSION_MAX_AGE_MS from 30 days
  // to about 90 days for classroom/semester use unless realitySessionRetentionMs is longer.
  const retentionMs = retentionPolicy.educationMode
    ? Math.max(retentionPolicy.realitySessionRetentionMs ?? REALITY_SESSION_MAX_AGE_MS, REALITY_SESSION_MAX_AGE_MS * 3)
    : retentionPolicy.realitySessionRetentionMs ?? REALITY_SESSION_MAX_AGE_MS
  return !Number.isFinite(time) || Date.now() - time > retentionMs
}

function defaultRealityCheckStorage(): RealityCheckStorage | null {
  const candidate = globalThis as { localStorage?: RealityCheckStorage }
  return candidate.localStorage ?? null
}

function isRealityStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { name?: unknown; code?: unknown }
  return record.name === 'QuotaExceededError' ||
    record.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    record.name === 'QUOTA_EXCEEDED_ERR' ||
    (typeof record.code === 'number' && (record.code === 22 || record.code === 1014))
}

function prioritizeFindings(findings: RealityFinding[]): RealityFinding[] {
  return findings
    .map((finding) => {
      const severity: RealityFinding['severity'] = finding.kind === 'blocking' ? 'blocking' : finding.kind === 'warning' ? 'warning' : undefined
      return {
        ...finding,
        ...(severity ? { severity } : {}),
        riskScore: finding.riskScore ?? riskScoreForFinding(finding),
        dependencyGroup: finding.dependencyGroup ?? dependencyGroupForFinding(finding),
      }
    })
    .sort((a, b) =>
      severityRank(a) - severityRank(b) ||
      (b.riskScore ?? 0) - (a.riskScore ?? 0) ||
      dependencyRank(a.dependencyGroup) - dependencyRank(b.dependencyGroup))
}

function riskScoreForFinding(finding: RealityFinding): number {
  const text = `${finding.id} ${finding.title} ${finding.message}`.toLowerCase()
  if (/\b(short|polarity|voltage|power|ground)\b/.test(text)) return 100
  if (/\b(resistor|drc)\b/.test(text)) return 80
  if (/\b(wire|mismatch)\b/.test(text)) return 60
  if (finding.kind === 'uncertain') return 40
  return 10
}

function dependencyGroupForFinding(finding: RealityFinding): RealityFinding['dependencyGroup'] {
  const text = `${finding.id} ${finding.title}`.toLowerCase()
  if (/\b(privacy|camera)\b/.test(text)) return 'privacy'
  if (/\b(polarity|short|voltage|power|ground)\b/.test(text)) return 'safety-first'
  if (/\bwire\b/.test(text)) return 'wiring'
  return 'validation'
}

function severityRank(finding: RealityFinding): number {
  if (finding.kind === 'blocking') return 0
  if (finding.kind === 'warning') return 1
  if (finding.kind === 'uncertain') return 2
  return 3
}

function dependencyRank(group: RealityFinding['dependencyGroup']): number {
  if (group === 'safety-first') return 0
  if (group === 'privacy') return 1
  if (group === 'wiring') return 2
  return 3
}
