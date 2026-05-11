import { useEffect } from 'react'
import { useStore } from '../store'
import type { Project } from '../project/schema'
import { runDrc } from '../drc'
import { initialGpios, stepBehaviors } from './evaluate'
import { createStarterLayoutFromProject, projectWithPhysicalNets } from '../physical/breadboard'

const SIM_TICK_MS = 100

// Mount once in App. Keeps the sim loop alive regardless of which pane is visible.
export function useSimLoop() {
  const simulating = useStore((s) => s.simulating)
  const simMode    = useStore((s) => s.simMode)
  const mode       = useStore((s) => s.mode)
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
    // cachedProject/cachedPhysicalProject live for one simulation session.
    // projectForTick returns raw project state when physicalMode is false and
    // memoizes a physicalized project when true.
    let cachedProject: Project | null = null
    let cachedPhysicalProject: Project | null = null
    // Intentional referential cache: Zustand project updates create new Project objects, so cachedProject
    // safely invalidates projectWithPhysicalNets/createStarterLayoutFromProject when the circuit changes.
    const projectForTick = (current: Project, physicalMode: boolean): Project => {
      if (!physicalMode) {
        cachedProject = null
        cachedPhysicalProject = null
        return current
      }
      if (cachedProject === current && cachedPhysicalProject) return cachedPhysicalProject
      const physical = projectWithPhysicalNets(current, createStarterLayoutFromProject(current), true)
      cachedProject = current
      cachedPhysicalProject = physical
      return cachedPhysicalProject
    }
    const state = useStore.getState()
    const proj = projectForTick(state.project, state.mode === 'beginner-lab')
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
      const project = projectForTick(s.project, s.mode === 'beginner-lab')
      const step = stepBehaviors(project, s.simTime, s.simGpios, s.simStrips, dt, s.pendingEdges, s.simPendingSequences)
      s.simStep(dt, step.gpios, step.strips, step.logs, step.pendingSequences)
    }, SIM_TICK_MS)
    return () => window.clearInterval(id)
    // Re-seed on simulating/simMode/mode changes; project is intentionally read
    // via getState() each tick so edits do not restart the loop, while the DRC
    // check effect above handles stopping when project errors appear.
  }, [simulating, simMode, mode])
}
