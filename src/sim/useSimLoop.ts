import { useEffect } from 'react'
import { useStore } from '../store'
import { runDrc } from '../drc'
import { initialGpios, stepBehaviors } from './evaluate'

const SIM_TICK_MS = 100

// Mount once in App. Keeps the sim loop alive regardless of which pane is visible.
export function useSimLoop() {
  const simulating = useStore((s) => s.simulating)
  const simMode    = useStore((s) => s.simMode)
  const project    = useStore((s) => s.project)
  const setSim     = useStore((s) => s.setSimulating)

  // Stop sim if DRC errors appear while running (e.g. user edits wiring mid-sim).
  useEffect(() => {
    if (!simulating || simMode !== 'js') return
    if (runDrc(project).errors.length > 0) setSim(false)
  }, [simulating, simMode, project, setSim])

  // Seed GPIOs and start interval on sim start; clean up on stop.
  useEffect(() => {
    if (!simulating || simMode !== 'js') return
    const proj = useStore.getState().project
    const preflight = runDrc(proj).warnings.map((w) => `⚠ [preflight] ${w.message}`)
    const seed = initialGpios(proj)
    const first = stepBehaviors(proj, 0, seed, {}, 0)
    useStore.setState((s) => ({
      simGpios: first.gpios,
      simStrips: first.strips,
      simLog: [...s.simLog, ...preflight, ...first.logs].slice(-200),
      simPendingSequences: first.pendingSequences,
    }))
    const id = window.setInterval(() => {
      const s = useStore.getState()
      if (!s.simulating) return
      const dt = SIM_TICK_MS * s.simSpeed
      const step = stepBehaviors(s.project, s.simTime, s.simGpios, s.simStrips, dt, s.pendingEdges as import('./evaluate').GpioEdge[], s.simPendingSequences)
      s.simStep(dt, step.gpios, step.strips, step.logs, step.pendingSequences)
    }, SIM_TICK_MS)
    return () => window.clearInterval(id)
    // Intentional: only re-seed when simulating flips; live project edits are
    // picked up each tick via getState() above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating])
}
