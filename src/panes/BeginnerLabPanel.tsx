import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { runDrc } from '../drc'
import { beginnerIdentitySummary, identifyPart, type PartIdentity } from '../identity/datasheets'
import { createStarterLayoutFromProject, derivePhysicalNets, runPhysicalDrc } from '../physical/breadboard'
import {
  analyzeRealityCheck,
  createRealityCheckSession,
  disposeRealityCheckSession,
  installRealityImageUnloadCleanup,
  loadRealityCheckSessions,
  purgeOldRealityCheckSessions,
  realityReadiness,
  realityCheckStorageKey,
  registerRealitySessionImageRef,
  saveRealityCheckSession,
  type RealityCheckSession,
  type RealityObservation,
} from '../reality/check'
import { parseWireObservations } from '../parsers/wireObservations'
import { getRecipe, recipeForProject } from '../learning/recipes'
import {
  codexTutorRecommendation,
  evaluateRecipeProgress,
  progressiveMilestoneHints,
  recommendFollowUpExperiments,
  summarizeRecipeResume,
  toVerifiedRecipe,
  type VerifiedEvidence,
} from '../learning/verifiedRecipes'
import {
  buildCodexSceneContext,
  evaluateAgentActionPolicy,
  listAgentActionSessions,
  type CodexAutonomyTier,
  type CodexReasoningEffort,
  type AgentActionKind,
} from '../agent/visualBuildAgent'
import {
  AGENT_AUTONOMY_TIERS,
  AGENT_REASONING_EFFORTS,
  loadAgentPrefs,
  saveAgentPrefs,
} from '../agent/agentPrefs'
import { COLORS, styles } from './BeginnerLabPanel.styles'
import type { Project } from '../project/schema'

const ACTIONS: AgentActionKind[] = ['inspect', 'add-part', 'place-part', 'move-part', 'delete-item', 'connect', 'connect-breadboard', 'behavior-change', 'code-change', 'catalog-import', 'camera-analysis', 'build', 'flash', 'monitor']
const CONTROL_CLASS = 'beginner-lab-control'

export default function BeginnerLabPanel() {
  const photoInput = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  const photoLoadId = useRef(0)
  const photoPreviewRef = useRef<string | null>(null)
  const photoSourceRef = useRef<'photo' | 'camera'>('photo')
  const realityRef = useRef<RealityCheckSession | null>(null)
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selected)
  const activeRecipeId = useStore((s) => s.activeRecipeId)
  const deferredProject = useDeferredValue(project)
  const deferredSelected = useDeferredValue(selected)
  const deferredActiveRecipeId = useDeferredValue(activeRecipeId)
  const [partQuery, setPartQuery] = useState('led-5mm-red')
  const [identity, setIdentity] = useState<PartIdentity | null>(null)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [observationText, setObservationText] = useState('r1.out -> led1.anode')
  const [photoName, setPhotoName] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [reality, setReality] = useState<RealityCheckSession | null>(null)
  const [realityError, setRealityError] = useState<string | null>(null)
  const [cameraGranted, setCameraGranted] = useState(false)
  const [imageStorageAllowed, setImageStorageAllowed] = useState(false)
  const [aiVisionAllowed, setAiVisionAllowed] = useState(false)
  const initialAgentPrefs = useMemo(() => loadAgentPrefs(), [])
  const [autonomy, setAutonomy] = useState<CodexAutonomyTier>(initialAgentPrefs.autonomy)
  const [effort, setEffort] = useState<CodexReasoningEffort>(initialAgentPrefs.effort)
  const deferredAutonomy = useDeferredValue(autonomy)
  const projectSessionKey = useMemo(() => realityCheckStorageKey(project), [project])

  useEffect(() => () => {
    mounted.current = false
    clearPhotoPreviewRef(photoPreviewRef)
    disposeRealityCheckSession(realityRef.current)
  }, [])

  useEffect(() => {
    return installRealityImageUnloadCleanup()
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => saveAgentPrefs(autonomy, effort), 250)
    return () => window.clearTimeout(timeout)
  }, [autonomy, effort])

  useEffect(() => {
    photoLoadId.current += 1
    clearPhotoPreviewRef(photoPreviewRef)
    photoSourceRef.current = 'photo'
    setPhotoPreview(null)
    setPhotoName(null)
    if (photoInput.current) photoInput.current.value = ''
    setRealityError(null)
    disposeRealityCheckSession(realityRef.current)
    purgeOldRealityCheckSessions(project)
    const loaded = loadRealityCheckSessions(project)[0] ?? null
    setRealitySession(loaded)
  }, [projectSessionKey])

  const {
    drc,
    physicalLayout,
    physicalNets,
    physicalFindings,
    sceneContext,
  } = useDerivedBeginnerProjectState(deferredProject, deferredSelected, deferredAutonomy, reality)
  const recipe = useMemo(() => getRecipe(deferredActiveRecipeId) ?? recipeForProject(deferredProject), [deferredActiveRecipeId, deferredProject])
  const verifiedRecipe = useMemo(() => recipe ? toVerifiedRecipe(recipe) : null, [recipe])
  const recipeEvidence = useMemo(() => {
    if (!verifiedRecipe) return {}
    const sharedEvidence = recipeSharedEvidence(drc, physicalFindings, reality)
    return Object.fromEntries(verifiedRecipe.milestones.map((milestone) => [
      milestone.id,
      sharedEvidence.filter((evidence) =>
        milestone.requiredEvidence.includes(evidence.kind) ||
        milestone.supportingEvidence.includes(evidence.kind) ||
        milestone.blockingEvidence.includes(evidence.kind)),
    ]))
  }, [drc, physicalFindings, reality, verifiedRecipe])
  const recipeProgress = useMemo(() => verifiedRecipe ? evaluateRecipeProgress(verifiedRecipe, recipeEvidence) : [], [recipeEvidence, verifiedRecipe])
  const recipeMilestonesById = useMemo(() => new Map(verifiedRecipe?.milestones.map((milestone) => [milestone.id, milestone]) ?? []), [verifiedRecipe])
  const recipeResume = useMemo(() => verifiedRecipe ? summarizeRecipeResume(verifiedRecipe, recipeProgress) : null, [recipeProgress, verifiedRecipe])
  const currentRecipeMilestone = recipeResume?.currentMilestoneId ? recipeMilestonesById.get(recipeResume.currentMilestoneId) ?? null : null
  const currentRecipeEvaluation = recipeResume?.currentMilestoneId
    ? recipeProgress.find((evaluation) => evaluation.milestoneId === recipeResume.currentMilestoneId) ?? null
    : null
  const tutorAdvice = currentRecipeMilestone && currentRecipeEvaluation
    ? codexTutorRecommendation(currentRecipeMilestone, currentRecipeEvaluation, autonomy)
    : null
  const followUps = useMemo(() => recipe ? recommendFollowUpExperiments(recipe, recipeProgress) : [], [recipe, recipeProgress])
  const actionSessions = listAgentActionSessions()

  function setRealitySession(next: RealityCheckSession | null): void {
    realityRef.current = next
    setReality(next)
  }

  function runIdentity() {
    try {
      setIdentityError(null)
      setIdentity(identifyPart(partQuery))
    } catch (error) {
      setIdentity(null)
      setIdentityError(errorMessage(error, 'Part identity lookup failed.'))
    }
  }

  function runReality() {
    let observations: RealityObservation[]
    try {
      observations = parseWireObservations(observationText)
    } catch (parseError) {
      disposeRealityCheckSession(realityRef.current)
      setRealitySession(null)
      setRealityError(errorMessage(parseError, 'Failed to parse observations.'))
      return
    }
    setRealityError(null)
    const validationError = realityObservationValidationError(observations)
    if (validationError) {
      disposeRealityCheckSession(realityRef.current)
      setRealitySession(null)
      setRealityError(validationError)
      return
    }
    disposeRealityCheckSession(realityRef.current)
    const hasImageRef = !!photoPreviewRef.current
    const source = hasImageRef ? photoSourceRef.current : cameraGranted ? 'camera' as const : 'photo' as const
    const imageRef = photoPreviewRef.current ? { kind: 'blob-url' as const, url: photoPreviewRef.current } : undefined
    const session = createRealityCheckSession(source, {
      cameraGranted: source === 'camera' ? cameraGranted : false,
      imageStorageAllowed,
      aiVisionAllowed,
    }, observations, imageRef)
    registerRealitySessionImageRef(session)
    const currentDrc = runDrc(project)
    const analyzed = analyzeRealityCheck(project, session, currentDrc)
    setRealitySession(analyzed)
    saveRealityCheckSession(project, analyzed)
  }

  async function loadRealityPhoto(file: File | null) {
    if (!file) return
    const loadId = ++photoLoadId.current
    try {
      setRealityError(null)
      if (!mounted.current) return
      const previewUrl = URL.createObjectURL(file)
      if (!mounted.current || photoLoadId.current !== loadId) {
        URL.revokeObjectURL(previewUrl)
        return
      }
      clearPhotoPreviewRef(photoPreviewRef)
      photoSourceRef.current = 'photo'
      photoPreviewRef.current = previewUrl
      setPhotoName(file.name)
      setPhotoPreview(previewUrl)
    } catch (error) {
      if (!mounted.current || photoLoadId.current !== loadId) return
      clearPhotoPreviewRef(photoPreviewRef)
      setPhotoName(null)
      setPhotoPreview(null)
      setRealityError(errorMessage(error, 'Could not load the selected photo.'))
    }
  }

  async function requestCameraAccess() {
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      setRealityError('Camera capture is not available in this browser. Choose a photo instead.')
      return
    }
    const loadId = ++photoLoadId.current
    let stream: MediaStream | null = null
    try {
      setRealityError(null)
      stream = await mediaDevices.getUserMedia({ video: true })
      const previewUrl = await captureCameraFrame(stream)
      if (!mounted.current || photoLoadId.current !== loadId) {
        URL.revokeObjectURL(previewUrl)
        return
      }
      clearPhotoPreviewRef(photoPreviewRef)
      photoSourceRef.current = 'camera'
      photoPreviewRef.current = previewUrl
      setPhotoName('Camera capture')
      setPhotoPreview(previewUrl)
      setCameraGranted(true)
    } catch (error) {
      if (!mounted.current || photoLoadId.current !== loadId) return
      setCameraGranted(false)
      setRealityError(errorMessage(error, 'Camera permission was not granted. Choose a photo instead.'))
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }

  function handleClearPhoto() {
    photoLoadId.current += 1
    disposeRealityCheckSession(realityRef.current)
    setRealitySession(null)
    setPhotoName(null)
    clearPhotoPreviewRef(photoPreviewRef)
    photoSourceRef.current = 'photo'
    setPhotoPreview(null)
    if (photoInput.current) photoInput.current.value = ''
  }

  return (
    <div style={styles.root}>
      <section style={styles.section}>
        <Header title="Reality Check" meta={reality ? realityReadiness(reality.findings) : photoName ? 'photo ready' : 'not run'} />
        <input ref={photoInput}
               type="file"
               aria-label="Select a photo for Reality Check"
               accept="image/png,image/jpeg,image/webp"
               style={{ display: 'none' }}
               onChange={(event) => loadRealityPhoto(event.target.files?.item(0) ?? null)} />
        <div style={styles.row}>
          <button className={CONTROL_CLASS} style={styles.primaryButton} onClick={() => photoInput.current?.click()}>
            {photoName ? 'Change Photo' : 'Choose Photo'}
          </button>
          <button className={CONTROL_CLASS} style={styles.secondaryButton} onClick={requestCameraAccess}>
            {cameraGranted ? 'Camera Approved' : 'Use Camera'}
          </button>
          {photoName && <button className={CONTROL_CLASS} style={styles.secondaryButton} onClick={handleClearPhoto}>Clear Photo</button>}
        </div>
        <div style={{ ...styles.findings, marginTop: 0, marginBottom: 8 }}>
          <label style={consentStyle}>
            <input type="checkbox" checked={imageStorageAllowed} onChange={(event) => setImageStorageAllowed(event.target.checked)} />
            <span>Allow this Reality Check to save image references with the project</span>
          </label>
          <label style={consentStyle}>
            <input type="checkbox" checked={aiVisionAllowed} onChange={(event) => setAiVisionAllowed(event.target.checked)} />
            <span>Allow AI vision analysis for this check</span>
          </label>
        </div>
        {photoPreview && (
          <div style={styles.photoStrip}>
            <img src={photoPreview} alt={photoName ?? 'Reality Check photo'} style={styles.photoThumb} />
            <span style={styles.muted}>{photoName}. Image stays local; observations below are learner-confirmed.</span>
          </div>
        )}
        <textarea value={observationText}
                  className={CONTROL_CLASS}
                  aria-label="Wire observations"
                  onChange={(event) => setObservationText(event.target.value)}
                  placeholder="Examples: r1.out -> led1.anode; polarity led1 reversed"
                  style={styles.textarea} />
        <button className={CONTROL_CLASS} style={styles.primaryButton} onClick={runReality}>Check Observed Wires</button>
        {realityError && <ErrorText message={realityError} />}
        <FindingList items={reality?.findings.map((finding) => ({
          id: finding.id,
          tone: finding.kind,
          title: finding.title,
          body: `${finding.message} ${finding.nextAction}`,
        })) ?? []} empty="Add one observed wire per line." />
      </section>

      <section style={styles.section}>
        <Header title="Part Identity" meta={identity?.state ?? 'review first'} />
        <div style={styles.row}>
          <input className={CONTROL_CLASS} aria-label="Part query" value={partQuery} onChange={(event) => setPartQuery(event.target.value)} style={styles.input} />
          <button className={CONTROL_CLASS} style={styles.primaryButton} onClick={runIdentity}>Identify</button>
        </div>
        {identityError && <ErrorText message={identityError} />}
        <FindingList items={(identity ? beginnerIdentitySummary(identity) : []).map((line, index) => ({
          id: `identity-${index}`,
          tone: identity?.reviewRequired ? 'warning' : 'pass',
          title: index === 0 ? line : 'Evidence',
          body: index === 0 ? identity?.knowledge.explanation ?? '' : line,
        }))} empty="Search a part name, marking, or goal." />
      </section>

      <section style={styles.section}>
        <Header title="Physical Breadboard" meta={`${physicalFindings.length} findings`} />
        <div style={styles.metrics}>
          <Metric label="placements" value={physicalLayout.placements.length} />
          <Metric label="jumpers" value={physicalLayout.jumpers.length} />
          <Metric label="physical nets" value={physicalNets.length} />
          <Metric label="DRC errors" value={physicalFindings.filter((finding) => finding.severity === 'error').length} />
        </div>
        <FindingList items={withTruncation(physicalFindings.map((finding) => ({
          id: finding.id,
          tone: finding.severity === 'error' ? 'blocking' : finding.severity,
          title: finding.title,
          body: `${finding.message} ${finding.beginnerFix}`,
        })), 6)} empty="Starter layout has no physical findings." />
      </section>

      <section style={styles.section}>
        <Header title="Codex Build Agent" meta={effort} />
        <div style={styles.row}>
          <select className={CONTROL_CLASS} aria-label="Autonomy tier" value={autonomy} onChange={(event) => {
            const value = event.target.value
            if ((AGENT_AUTONOMY_TIERS as readonly string[]).includes(value)) setAutonomy(value as CodexAutonomyTier)
          }} style={styles.input}>
            {AGENT_AUTONOMY_TIERS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className={CONTROL_CLASS} aria-label="Reasoning effort" value={effort} onChange={(event) => {
            const value = event.target.value
            if ((AGENT_REASONING_EFFORTS as readonly string[]).includes(value)) setEffort(value as CodexReasoningEffort)
          }} style={styles.input}>
            {AGENT_REASONING_EFFORTS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div style={styles.actionGrid}>
          {ACTIONS.map((action) => {
            const policy = evaluateAgentActionPolicy(action, autonomy)
            return (
              <div key={action} style={policy.allowed ? styles.actionAllowed : styles.actionBlocked}
                   title={policy.reason}>
                {action}{policy.approvalRequired ? ' approval' : ''}
              </div>
            )
          })}
        </div>
        <div style={styles.muted}>
          DRC {sceneContext.validationSummary.drcErrors}/{sceneContext.validationSummary.drcWarnings};
          physical {sceneContext.validationSummary.physicalDrcErrors}/{sceneContext.validationSummary.physicalDrcWarnings}
        </div>
        <FindingList items={actionSessions.slice(0, 4).map((session) => ({
          id: session.id,
          tone: Object.values(session.validationResults).every((result) => result === true || (typeof result === 'object' && result.ok)) ? 'pass' : 'warning',
          title: `${session.tool}: ${session.action}`,
          body: `${session.beginnerSummary} Changed: ${session.changedObjects.join(', ') || 'none'}.`,
        }))} empty="Codex action history will appear after scoped tools change the project." />
      </section>

      <section style={styles.section}>
        <Header title="Verified Recipe" meta={verifiedRecipe?.id ?? 'none'} />
        {recipeResume && <div style={styles.muted}>{recipeResume.message}</div>}
        {recipeResume && recipeResume.recheckActions.length > 0 && (
          <FindingList items={recipeResume.recheckActions.map((action, index) => ({
            id: `resume-${index}`,
            tone: 'warning',
            title: 'Resume check',
            body: action,
          }))} empty="No resume checks needed yet." />
        )}
        {tutorAdvice && (
          <FindingList items={[{
            id: 'codex-tutor',
            tone: tutorAdvice.canPerform ? tutorAdvice.approvalRequired ? 'warning' : 'pass' : 'neutral',
            title: tutorAdvice.title,
            body: tutorAdvice.detail,
          }]} empty="Codex tutor advice appears once a milestone is active." />
        )}
        <FindingList items={withTruncation(recipeProgress.map((milestone) => ({
          id: milestone.milestoneId,
          tone: milestone.status === 'complete' ? 'pass' : milestone.status === 'blocked' ? 'blocking' : 'warning',
          title: `${recipeMilestonesById.get(milestone.milestoneId)?.title ?? milestone.milestoneId}: ${milestone.status}`,
          body: progressiveMilestoneHints(recipeMilestonesById.get(milestone.milestoneId) ?? {
            id: milestone.milestoneId,
            title: milestone.milestoneId,
            action: milestone.nextHint,
            why: 'Recipe milestone',
            requiredEvidence: milestone.missingEvidence,
            supportingEvidence: [],
            blockingEvidence: [],
            hints: [milestone.nextHint],
            expectedObservation: 'Complete the proof step shown in the recipe.',
          }, milestone).join(' '),
        })), 8)} empty="Start a beginner recipe or open a template with a recipe." />
        {followUps.length > 0 && (
          <FindingList items={followUps.map((item) => ({
            id: item.id,
            tone: 'pass',
            title: item.title,
            body: `${item.reason} ${item.experiment}`,
          }))} empty="Follow-up experiments appear after proof steps are complete." />
        )}
      </section>

      <section style={styles.section}>
        <Header title="Current Project Gates" meta={`${drc.errors.length} errors`} />
        <FindingList items={withTruncation([...drc.errors, ...drc.warnings].map((finding) => ({
          id: finding.id,
          tone: finding.severity === 'error' ? 'blocking' : 'warning',
          title: finding.id,
          body: finding.message,
        })), 8)} empty="DRC is clean." />
      </section>
    </div>
  )
}

function useDerivedBeginnerProjectState(
  project: Project,
  selected: string | null | undefined,
  autonomyTier: CodexAutonomyTier,
  reality: RealityCheckSession | null,
) {
  const drc = useMemo(() => runDrc(project), [project])
  const physicalLayout = useMemo(() => createStarterLayoutFromProject(project), [project])
  const physicalNets = useMemo(() => derivePhysicalNets(physicalLayout), [physicalLayout])
  const physicalFindings = useMemo(() => runPhysicalDrc(physicalLayout, project), [physicalLayout, project])
  const sceneContext = useMemo(() => buildCodexSceneContext({
    project,
    selected,
    physicalLayout,
    realityFindings: reality?.findings,
    autonomyTier,
    precomputedDrc: drc,
    precomputedPhysicalDrc: physicalFindings,
    precomputedPhysicalNetCount: physicalNets.length,
  }), [autonomyTier, drc, physicalFindings, physicalLayout, physicalNets.length, project, reality?.findings, selected])

  return { drc, physicalLayout, physicalNets, physicalFindings, sceneContext }
}

function recipeSharedEvidence(
  drc: ReturnType<typeof runDrc>,
  physicalFindings: ReturnType<typeof runPhysicalDrc>,
  reality: RealityCheckSession | null,
): VerifiedEvidence[] {
  const drcBlocked = drc.errors[0]
  const physicalBlocked = physicalFindings.find((finding) => finding.severity === 'error')
  const realityState = reality ? realityReadiness(reality.findings) : null
  const projectBlocked = drc.errors.find((finding) => finding.id.startsWith('project.'))
  return [
    {
      kind: 'project',
      state: projectBlocked ? 'blocked' : 'pass',
      title: 'Project open',
      detail: projectBlocked?.message ?? 'A Circuitiny project is active.',
    },
    {
      kind: 'drc',
      state: drcBlocked ? 'blocked' : 'pass',
      title: 'DRC',
      detail: drcBlocked?.message ?? 'No DRC errors.',
    },
    {
      kind: 'physical-drc',
      state: physicalBlocked ? 'blocked' : 'pass',
      title: 'Physical DRC',
      detail: physicalBlocked?.message ?? 'No physical breadboard errors.',
    },
    ...(realityState ? [{
      kind: 'reality-check' as const,
      // RealityCheckSession readiness is stricter than VerifiedEvidence: 'warn' means
      // realityReadiness found visible uncertainty, so it becomes failed evidence.
      state: realityState === 'blocked' ? 'blocked' as const : realityState === 'warn' ? 'fail' as const : 'pass' as const,
      title: 'Reality Check',
      detail: reality?.findings[0]?.message ?? 'Visible build matches current checks.',
    }] : []),
  ]
}

function clearPhotoPreviewRef(photoPreviewRef: { current: string | null }): void {
  const preview = photoPreviewRef.current
  if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
  photoPreviewRef.current = null
}

async function captureCameraFrame(stream: MediaStream): Promise<string> {
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Camera preview failed.'))
    })
    await video.play().catch(() => undefined)
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Camera frame capture is not available in this browser.')
    ctx.drawImage(video, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => {
        if (next) resolve(next)
        else reject(new Error('Could not capture camera frame.'))
      }, 'image/jpeg', 0.88)
    })
    return URL.createObjectURL(blob)
  } finally {
    video.pause()
    video.srcObject = null
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function ErrorText({ message }: { message: string }) {
  return <div role="alert" style={styles.errorText}>{message}</div>
}

function Header({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={styles.header}>
      <span>{title}</span>
      <span style={styles.meta}>{meta}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricLabel}>{label}</div>
    </div>
  )
}

function FindingList({ items, empty }: { items: Array<{ id: string; tone: string; title: string; body: string }>; empty: string }) {
  const styleForTone = (tone: string): React.CSSProperties => {
    return KNOWN_TONE_STYLES[tone] ?? DEFAULT_TONE_STYLE
  }
  if (items.length === 0) return <div style={styles.empty}>{empty}</div>
  return (
    <div style={styles.findings}>
      {items.map((item) => (
        <article key={item.id} style={styleForTone(item.tone)}>
          <div style={styles.findingTitle}>{item.title}</div>
          <div style={styles.findingBody}>{item.body}</div>
        </article>
      ))}
    </div>
  )
}

const KNOWN_TONE_STYLES: Record<string, React.CSSProperties> = {
  blocking: { ...styles.finding, borderColor: COLORS.errorBorder },
  error: { ...styles.finding, borderColor: COLORS.errorBorder },
  warning: { ...styles.finding, borderColor: COLORS.buttonPrimaryBorder },
  uncertain: { ...styles.finding, borderColor: COLORS.buttonPrimaryBorder },
  pass: { ...styles.finding, borderColor: COLORS.successBorder },
  confirmed: { ...styles.finding, borderColor: COLORS.successBorder },
  neutral: { ...styles.finding, borderColor: COLORS.borderStrong },
}

const DEFAULT_TONE_STYLE = KNOWN_TONE_STYLES.neutral

function withTruncation<T extends { id: string; tone: string; title: string; body: string }>(items: T[], limit: number): Array<T | { id: string; tone: string; title: string; body: string }> {
  if (items.length <= limit) return items
  return [
    ...items.slice(0, limit),
    {
      id: `truncated-${items.length}-${limit}`,
      tone: 'neutral',
      title: `Showing ${limit} of ${items.length}`,
      body: `${items.length - limit} more item${items.length - limit === 1 ? '' : 's'} hidden in this compact view.`,
    },
  ]
}

const consentStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: COLORS.textSoft,
  lineHeight: 1.35,
}

function realityObservationValidationError(observations: RealityObservation[]): string | null {
  const invalid = observations
    .map((observation, index) => ({ observation, index }))
    .filter(({ observation }) =>
      observation.kind === 'unknown' ||
      (observation.kind === 'wire' && !observation.endpoints) ||
      (observation.kind === 'polarity' && (!observation.componentInstance || !observation.polarityReversed)))
  // Notes-only parser warnings are intentionally not valid Reality Check evidence;
  // analysis needs at least a concrete endpoint, component, polarity, part, or rail.
  const hasValidObservation = observations.some((observation) =>
    observation.kind !== 'unknown' &&
    (observation.endpoints || observation.polarityReversed || observation.componentInstance || observation.kind === 'part' || observation.kind === 'rail'))
  const malformed = invalid.length > 0
    ? ` Malformed observation${invalid.length === 1 ? '' : 's'}: ${invalid.map(({ index, observation }) => `#${index + 1} ${observation.notes ?? observation.label}`).join('; ')}.`
    : ''
  if (hasValidObservation) return invalid.length > 0 ? `Fix malformed observations before running Reality Check.${malformed}` : null
  return `Enter a wire observation like "r1.out -> led1.anode" or a polarity check like "polarity led1 reversed".${malformed}`
}
