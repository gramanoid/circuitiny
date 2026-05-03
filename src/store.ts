import { create } from 'zustand'
import { type Project, emptyProject, type PinType, type Behavior } from './project/schema'
import { catalog } from './catalog'
import type { PendingSequence } from './sim/evaluate'

export type Mode = 'project' | 'catalog-editor'

export interface DraftPin {
  id: string
  label: string
  type: PinType
  position: [number, number, number]   // world coords (meters), captured post-scale
  normal: [number, number, number]
}

export type Category = 'sensor' | 'actuator' | 'display' | 'input' | 'power' | 'misc'

export interface CatalogDraft {
  id: string
  name: string
  category: Category
  glbPath: string | null
  glbName: string | null
  glbData: Uint8Array | null
  scale: number                         // applied to model and pin coords
  pins: DraftPin[]
  selectedPin: string | null
}

export type PinRef = string  // "instance.pinId" or "board.pinId"

interface State {
  mode: Mode
  project: Project
  past: Project[]
  future: Project[]
  savedPath: string | null
  dirty: boolean                // true whenever project has unsaved changes
  showBoardPicker: boolean
  selected: string | null
  pendingPin: PinRef | null
  catalogVersion: number        // bumped when catalog registers new entries — drives re-render
  simulating: boolean
  simPhase: 0 | 1               // ticks at ~1 Hz while simulating (kept for legacy visuals)
  simTime: number               // elapsed simulated milliseconds
  simGpios: Record<string, boolean>  // GPIO label -> output state (board-pin label, e.g. "2", "16")
  simStrips: Record<string, Array<[number, number, number]>>  // instance → per-pixel [r,g,b]
  simLog: string[]              // most recent simulation log lines
  pendingEdges: Array<{ label: string; type: 'rising' | 'falling' }>
  simPendingSequences: PendingSequence[]
  simSpeed: 1 | 2 | 5 | 10     // time multiplier applied each tick
  draft: CatalogDraft

  setMode: (m: Mode) => void
  setProject: (p: Project) => void
  loadProject: (p: Project, path?: string) => void
  markSaved: (path: string) => void
  openBoardPicker: () => void
  createProject: (name: string, boardId: string) => void
  select: (instance: string | null) => void
  undo: () => void
  redo: () => void

  clickPin: (ref: PinRef) => void
  cancelWire: () => void
  removeNet: (id: string) => void
  rewireBoardPin: (netId: string, toBoardPinId: string) => void

  addComponent: (componentId: string) => void
  removeComponent: (instance: string) => void
  moveComponent: (instance: string, position: [number, number, number]) => void
  bumpCatalog: () => void
  setSimulating: (b: boolean) => void
  tickSim: () => void
  simStep: (dtMs: number, gpios: Record<string, boolean>, strips: Record<string, Array<[number, number, number]>>, logs: string[], pendingSequences: PendingSequence[]) => void
  pressButton: (boardPinLabel: string) => void
  releaseButton: (boardPinLabel: string) => void
  setSimSpeed: (s: 1 | 2 | 5 | 10) => void

  setCustomCode: (file: string, code: string) => void

  addBehavior: () => string
  removeBehavior: (id: string) => void
  updateBehavior: (id: string, patch: Partial<Behavior>) => void
  setBehavior: (b: Behavior) => void

  loadDraftGlb: (path: string, name: string, data: Uint8Array, suggestedScale?: number) => void
  setDraftMeta: (patch: Partial<Pick<CatalogDraft, 'id' | 'name' | 'category' | 'scale'>>) => void
  loadDraftFromBundle: (d: Partial<CatalogDraft>) => void
  addDraftPin: (position: [number, number, number], normal: [number, number, number]) => void
  updateDraftPin: (id: string, patch: Partial<DraftPin>) => void
  removeDraftPin: (id: string) => void
  selectDraftPin: (id: string | null) => void
  resetDraft: () => void
}

const newDraft = (): CatalogDraft => ({
  id: '', name: '', category: 'sensor',
  glbPath: null, glbName: null, glbData: null,
  scale: 1, pins: [], selectedPin: null
})

// Push current project onto the undo stack before a circuit mutation.
function snapshot(s: State) {
  return { past: [...s.past.slice(-49), s.project], future: [] as Project[] }
}

export const useStore = create<State>((set) => ({
  mode: 'project',
  project: seed(),
  past: [],
  future: [],
  savedPath: null,
  dirty: false,
  showBoardPicker: false,
  selected: null,
  pendingPin: null,
  catalogVersion: 0,
  simulating: false,
  simPhase: 0,
  simTime: 0,
  simGpios: {},
  simStrips: {},
  simLog: [],
  pendingEdges: [],
  simPendingSequences: [],
  simSpeed: 1,
  draft: newDraft(),

  setMode: (mode) => set({ mode }),
  setProject: (project) => set({ project, dirty: true }),
  loadProject: (project, path) => set({
    project, savedPath: path ?? null, dirty: false,
    past: [], future: [],
    mode: 'project', selected: null, pendingPin: null,
    simulating: false, simTime: 0, simGpios: {}, simStrips: {}, simLog: [], pendingEdges: [], simPendingSequences: []
  }),
  markSaved: (savedPath) => set({ savedPath, dirty: false }),
  openBoardPicker: () => set({ showBoardPicker: true }),
  createProject: (name, boardId) => {
    set({ project: emptyProject(name || 'untitled', boardId), savedPath: null, dirty: false, past: [], future: [], showBoardPicker: false, selected: null, pendingPin: null })
  },
  select: (selected) => set({ selected }),

  clickPin: (ref) => set((s) => {
    if (!s.pendingPin) return { pendingPin: ref }
    if (s.pendingPin === ref) return { pendingPin: null }
    // create net joining pendingPin -> ref. Merge into existing net if either endpoint already in one.
    const a = s.pendingPin, b = ref
    const nets = [...s.project.nets]
    const idxA = nets.findIndex((n) => n.endpoints.includes(a))
    const idxB = nets.findIndex((n) => n.endpoints.includes(b))
    if (idxA >= 0 && idxB >= 0 && idxA !== idxB) {
      nets[idxA] = { ...nets[idxA], endpoints: Array.from(new Set([...nets[idxA].endpoints, ...nets[idxB].endpoints])) }
      nets.splice(idxB, 1)
    } else if (idxA >= 0) {
      nets[idxA] = { ...nets[idxA], endpoints: Array.from(new Set([...nets[idxA].endpoints, b])) }
    } else if (idxB >= 0) {
      nets[idxB] = { ...nets[idxB], endpoints: Array.from(new Set([...nets[idxB].endpoints, a])) }
    } else {
      nets.push({ id: `net${nets.length + 1}`, endpoints: [a, b] })
    }
    return { ...snapshot(s), pendingPin: null, dirty: true, project: { ...s.project, nets } }
  }),
  cancelWire: () => set({ pendingPin: null }),
  removeNet: (id) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: { ...s.project, nets: s.project.nets.filter((n) => n.id !== id) }
  })),
  rewireBoardPin: (netId, toBoardPinId) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: {
      ...s.project,
      nets: s.project.nets.map((n) => n.id !== netId ? n : {
        ...n,
        endpoints: n.endpoints.map((e) => e.startsWith('board.') ? `board.${toBoardPinId}` : e)
      })
    }
  })),

  addComponent: (componentId) => set((s) => {
    const existing = s.project.components.filter((c) => c.componentId === componentId).length
    const base = componentId.split('-')[0].replace(/[^a-z0-9]/gi, '')
    let n = existing + 1
    const names = new Set(s.project.components.map((c) => c.instance))
    let instance = `${base}${n}`
    while (names.has(instance)) { n++; instance = `${base}${n}` }
    const x = 0.04 + (existing * 0.01)
    return {
      ...snapshot(s), dirty: true,
      project: { ...s.project, components: [...s.project.components, {
        instance, componentId, position: [x, 0.005, 0.02], pinAssignments: {}
      }]},
      selected: instance
    }
  }),
  removeComponent: (instance) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: {
      ...s.project,
      components: s.project.components.filter((c) => c.instance !== instance),
      nets: s.project.nets
        .map((n) => ({ ...n, endpoints: n.endpoints.filter((e) => !e.startsWith(`${instance}.`)) }))
        .filter((n) => n.endpoints.length >= 1)
    },
    selected: s.selected === instance ? null : s.selected
  })),
  moveComponent: (instance, position) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: {
      ...s.project,
      components: s.project.components.map((c) =>
        c.instance === instance ? { ...c, position } : c)
    }
  })),
  bumpCatalog: () => set((s) => ({ catalogVersion: s.catalogVersion + 1 })),
  setSimulating: (b) => set({
    simulating: b, simPhase: 0,
    simTime: 0, simGpios: {}, simStrips: {}, simLog: b ? ['[sim] start'] : [], pendingEdges: [], simPendingSequences: []
  }),
  tickSim: () => set((s) => ({ simPhase: s.simPhase === 0 ? 1 : 0 })),
  simStep: (dtMs, gpios, strips, logs, pendingSequences) => set((s) => ({
    simTime: s.simTime + dtMs,
    simPhase: s.simPhase === 0 ? 1 : 0,
    simGpios: gpios,
    simStrips: strips,
    simLog: [...s.simLog, ...logs].slice(-200),
    pendingEdges: [],
    simPendingSequences: pendingSequences,
  })),
  pressButton: (label) => set((s) => ({
    simGpios: { ...s.simGpios, [label]: false },
    pendingEdges: [...s.pendingEdges, { label, type: 'falling' as const }]
  })),
  releaseButton: (label) => set((s) => ({
    simGpios: { ...s.simGpios, [label]: true },
    pendingEdges: [...s.pendingEdges, { label, type: 'rising' as const }]
  })),
  setSimSpeed: (simSpeed) => set({ simSpeed }),

  setCustomCode: (file, code) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: { ...s.project, customCode: { ...s.project.customCode, [file]: code } }
  })),

  addBehavior: () => {
    const id = `beh${Date.now().toString(36)}`
    set((s) => ({
      ...snapshot(s), dirty: true,
      project: {
        ...s.project,
        behaviors: [...s.project.behaviors, {
          id, trigger: { type: 'timer', period_ms: 1000 }, actions: []
        }]
      }
    }))
    return id
  },
  removeBehavior: (id) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: { ...s.project, behaviors: s.project.behaviors.filter((b) => b.id !== id) }
  })),
  updateBehavior: (id, patch) => set((s) => ({
    ...snapshot(s), dirty: true,
    project: {
      ...s.project,
      behaviors: s.project.behaviors.map((b) => b.id === id ? { ...b, ...patch } : b)
    }
  })),
  setBehavior: (b) => set((s) => {
    const exists = s.project.behaviors.some((x) => x.id === b.id)
    return {
      ...snapshot(s), dirty: true,
      project: {
        ...s.project,
        behaviors: exists
          ? s.project.behaviors.map((x) => x.id === b.id ? b : x)
          : [...s.project.behaviors, b]
      }
    }
  }),

  undo: () => set((s) => {
    if (!s.past.length) return {}
    const prev = s.past[s.past.length - 1]
    return {
      project: prev,
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future].slice(0, 50),
      dirty: true,
    }
  }),
  redo: () => set((s) => {
    if (!s.future.length) return {}
    const next = s.future[0]
    return {
      project: next,
      past: [...s.past, s.project].slice(-50),
      future: s.future.slice(1),
      dirty: true,
    }
  }),

  loadDraftGlb: (glbPath, glbName, glbData, suggestedScale) =>
    set((s) => ({ draft: { ...s.draft, glbPath, glbName, glbData,
                           scale: suggestedScale ?? s.draft.scale } })),
  setDraftMeta: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  loadDraftFromBundle: (d) => set((s) => ({ draft: { ...newDraft(), ...d } })),
  addDraftPin: (position, normal) =>
    set((s) => {
      const id = `pin${s.draft.pins.length + 1}`
      const pin: DraftPin = { id, label: id, type: 'digital_io', position, normal }
      return { draft: { ...s.draft, pins: [...s.draft.pins, pin], selectedPin: id } }
    }),
  updateDraftPin: (id, patch) =>
    set((s) => ({
      draft: { ...s.draft, pins: s.draft.pins.map((p) => p.id === id ? { ...p, ...patch } : p) }
    })),
  removeDraftPin: (id) =>
    set((s) => ({
      draft: { ...s.draft, pins: s.draft.pins.filter((p) => p.id !== id),
               selectedPin: s.draft.selectedPin === id ? null : s.draft.selectedPin }
    })),
  selectDraftPin: (selectedPin) =>
    set((s) => ({ draft: { ...s.draft, selectedPin } })),
  resetDraft: () => set({ draft: newDraft() })
}))

function seed(): Project {
  const p = emptyProject('blink-button', 'freenove-esp32-wrover-dev')

  p.components.push(
    { instance: 'r1',   componentId: 'resistor-220r', position: [0.033, 0.005,  0.015], pinAssignments: {} },
    { instance: 'led1', componentId: 'led-5mm-red',   position: [0.048, 0.005,  0.015], pinAssignments: {} },
    { instance: 'btn1', componentId: 'button-6mm',    position: [0.055, 0.005, -0.010], pinAssignments: {} }
  )

  p.nets.push(
    { id: 'net1', endpoints: ['board.gpio4_l',  'r1.in']       },  // GPIO4 → resistor in
    { id: 'net2', endpoints: ['r1.out',         'led1.anode']  },  // resistor out → LED anode
    { id: 'net3', endpoints: ['led1.cathode',   'board.gnd_l0'] }, // LED cathode → GND
    { id: 'net4', endpoints: ['board.gpio13',   'btn1.a']      },  // GPIO13 → button A
    { id: 'net5', endpoints: ['btn1.b',         'board.gnd_r0'] }  // button B → GND
  )

  p.behaviors.push(
    {
      id: 'on_boot',
      trigger: { type: 'boot' },
      actions: [{ type: 'log', level: 'info', message: 'Circuitiny ready — hold button to light LED' }]
    },
    {
      id: 'on_press',
      trigger: { type: 'gpio_edge', source: 'btn1.a', edge: 'falling' },
      actions: [
        { type: 'set_output', target: 'led1.anode', value: 'on' },
        { type: 'log', level: 'info', message: 'button pressed — LED on' }
      ]
    },
    {
      id: 'on_release',
      trigger: { type: 'gpio_edge', source: 'btn1.a', edge: 'rising' },
      actions: [
        { type: 'set_output', target: 'led1.anode', value: 'off' },
        { type: 'log', level: 'info', message: 'button released — LED off' }
      ]
    }
  )

  return p
}
