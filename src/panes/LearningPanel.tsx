import { useDeferredValue, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { runDrc } from '../drc'
import { getCheckpoint, getRecipe, getRecipeStep, recipeProgressLabel } from '../learning/recipes'

export default function LearningPanel() {
  const project = useStore((s) => s.project)
  const activeRecipeId = useStore((s) => s.activeRecipeId)
  const stepIndex = useStore((s) => s.recipeStepIndex)
  const visible = useStore((s) => s.guidanceVisible)
  const setStep = useStore((s) => s.setRecipeStep)
  const next = useStore((s) => s.nextRecipeStep)
  const previous = useStore((s) => s.previousRecipeStep)
  const exit = useStore((s) => s.exitGuidance)
  const simulating = useStore((s) => s.simulating)
  const simTime = useStore((s) => s.simTime)

  const deferredProject = useDeferredValue(project)
  const recipe = useMemo(() => getRecipe(activeRecipeId), [activeRecipeId])
  const step = useMemo(() => getRecipeStep(activeRecipeId, stepIndex), [activeRecipeId, stepIndex])
  const checkpoint = useMemo(() => getCheckpoint(recipe, step?.checkpointId), [recipe, step?.checkpointId])
  const drc = useMemo(() => runDrc(deferredProject), [deferredProject])

  useEffect(() => {
    clearCheckpointCaches()
  }, [activeRecipeId])

  if (!recipe || !visible || !step) return null

  const atFirst = stepIndex <= 0
  const atLast = stepIndex >= recipe.steps.length - 1
  const status = checkpointStatus(checkpoint?.kind, drc.errors.length, simulating, simTime, checkpoint?.afterMs)

  return (
    <section style={{
      borderBottom: '1px solid #222',
      background: '#101722',
      padding: 8,
      color: '#c8d8ee',
      fontSize: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#7fb0e6', fontSize: 9, textTransform: 'uppercase',
                        letterSpacing: '0.06em', fontWeight: 700 }}>
            Beginner path {recipeProgressLabel(recipe, stepIndex)}
          </div>
          <div style={{ color: '#eef5ff', fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {step.title}
          </div>
        </div>
        <button onClick={exit} title="Exit guided recipe" style={smallButton}>Exit</button>
      </div>

      <p style={{ margin: '0 0 6px', lineHeight: 1.4, color: '#b6c8de' }}>{step.body}</p>
      <div style={noteRow}><b>Why</b><span>{step.why}</span></div>
      <div style={noteRow}><b>Do</b><span>{step.action}</span></div>
      {checkpoint && (
        <div style={{ marginTop: 7, padding: 6, border: '1px solid #26384f', borderRadius: 4,
                      background: '#0b121c' }}>
          <div style={{ color: '#7fb0e6', fontWeight: 700 }}>{checkpoint.title}</div>
          <div style={{ color: '#8ea5bd', marginTop: 2, lineHeight: 1.35 }}>{checkpoint.expected}</div>
          {checkpoint.requiresInput && (
            <div style={{ color: '#bba86a', marginTop: 4 }}>{checkpoint.requiresInput}</div>
          )}
          <div style={{ color: status.color, marginTop: 4, fontFamily: "'SF Mono', Menlo, monospace" }}>
            {status.label}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={previous} disabled={atFirst} style={navButton(atFirst)} aria-label="Go to previous step">Back</button>
        <button onClick={() => setStep(0)} style={smallButton} aria-label="Restart learning sequence">Restart</button>
        <button onClick={next} disabled={atLast} style={{ ...navButton(atLast), marginLeft: 'auto' }} aria-label="Go to next step">
          Next
        </button>
      </div>
    </section>
  )
}

type CheckpointStatus = { label: string; color: string }

const CHECKPOINT_NOT_STARTED: CheckpointStatus = Object.freeze({ label: 'checkpoint: not started', color: '#62748a' })
const CHECKPOINT_DRC_OK: CheckpointStatus = Object.freeze({ label: 'checkpoint: DRC has no errors', color: '#7edd7e' })
const CHECKPOINT_PRESS_PLAY: CheckpointStatus = Object.freeze({ label: 'checkpoint: press Play in Sim', color: '#bba86a' })
const CHECKPOINT_SIM_STOPPED: CheckpointStatus = Object.freeze({ label: 'checkpoint: simulation stopped, press Play to continue', color: '#bba86a' })
const CHECKPOINT_OBSERVE_SIM: CheckpointStatus = Object.freeze({ label: 'checkpoint: observe the simulated behavior', color: '#7edd7e' })
const CHECKPOINT_OPEN_CODE: CheckpointStatus = Object.freeze({ label: 'checkpoint: open Code and compare behavior', color: '#9ecbff' })
const CHECKPOINT_RUN_BUILD: CheckpointStatus = Object.freeze({ label: 'checkpoint: run Build / Flash when ready', color: '#9ecbff' })
const CHECKPOINT_REVIEW_HW: CheckpointStatus = Object.freeze({ label: 'checkpoint: review before hardware', color: '#bba86a' })
const CHECKPOINT_UNKNOWN: CheckpointStatus = Object.freeze({ label: 'checkpoint: review current step', color: '#bba86a' })
const CHECKPOINT_CACHE_LIMIT = 64
const drcCheckpointCache = new Map<number, CheckpointStatus>()
const simAfterCheckpointCache = new Map<number, CheckpointStatus>()

function clearCheckpointCaches(): void {
  drcCheckpointCache.clear()
  simAfterCheckpointCache.clear()
}

function readLru<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key)
  if (value !== undefined) {
    cache.delete(key)
    cache.set(key, value)
  }
  return value
}

function writeLru<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (!cache.has(key) && cache.size >= CHECKPOINT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
  return value
}

function drcCheckpointStatus(drcErrors: number): CheckpointStatus {
  const cached = readLru(drcCheckpointCache, drcErrors)
  if (cached) return cached
  const status = Object.freeze({
    label: `checkpoint: fix ${drcErrors} DRC error${drcErrors === 1 ? '' : 's'}`,
    color: '#ff9b9b',
  })
  return writeLru(drcCheckpointCache, drcErrors, status)
}

function simAfterCheckpointStatus(afterMs: number): CheckpointStatus {
  const cached = readLru(simAfterCheckpointCache, afterMs)
  if (cached) return cached
  const status = Object.freeze({
    label: `checkpoint: running, watch until ${afterMs} ms`,
    color: '#bba86a',
  })
  return writeLru(simAfterCheckpointCache, afterMs, status)
}

function checkpointStatus(
  kind: string | undefined,
  drcErrors: number,
  simulating: boolean,
  simTime: number,
  afterMs?: number,
): CheckpointStatus {
  if (!kind) return CHECKPOINT_NOT_STARTED
  if (kind === 'drc') {
    return drcErrors === 0
      ? CHECKPOINT_DRC_OK
      : drcCheckpointStatus(drcErrors)
  }
  if (kind === 'simulation') {
    if (!simulating && simTime === 0) return CHECKPOINT_PRESS_PLAY
    if (!simulating && simTime > 0) return CHECKPOINT_SIM_STOPPED
    if (afterMs !== undefined && simTime < afterMs) return simAfterCheckpointStatus(afterMs)
    return CHECKPOINT_OBSERVE_SIM
  }
  if (kind === 'code') return CHECKPOINT_OPEN_CODE
  if (kind === 'build') return CHECKPOINT_RUN_BUILD
  if (kind === 'hardware') return CHECKPOINT_REVIEW_HW
  console.warn(`Unknown recipe checkpoint kind: ${kind}`)
  return CHECKPOINT_UNKNOWN
}

const noteRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr',
  gap: 6,
  lineHeight: 1.35,
  color: '#92a8bf',
  marginTop: 4,
}

const smallButton: React.CSSProperties = {
  background: 'transparent',
  color: '#8db7e6',
  border: '1px solid #2b4b70',
  borderRadius: 3,
  padding: '2px 7px',
  fontSize: 10,
  cursor: 'pointer',
}

const navButtonEnabled: React.CSSProperties = {
  background: '#163454',
  color: '#d7ecff',
  border: '1px solid #3f76ad',
  borderRadius: 3,
  padding: '3px 9px',
  fontSize: 10,
  cursor: 'pointer',
}

const navButtonDisabled: React.CSSProperties = {
  ...navButtonEnabled,
  background: 'transparent',
  color: '#425366',
  border: '1px solid #27313d',
  cursor: 'not-allowed',
}

const navButton = (disabled: boolean): React.CSSProperties => disabled ? navButtonDisabled : navButtonEnabled
