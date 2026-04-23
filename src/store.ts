import { create } from 'zustand'
import { type Project, emptyProject, type PinType, type Behavior, type Target } from './project/schema'
import { catalog } from './catalog'

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
  showBoardPicker: boolean
  selected: string | null
  pendingPin: PinRef | null
  catalogVersion: number        // bumped when catalog registers new entries — drives re-render
  simulating: boolean
  simPhase: 0 | 1               // ticks at ~1 Hz while simulating (kept for legacy visuals)
  simTime: number               // elapsed simulated milliseconds
  simGpios: Record<string, boolean>  // GPIO label -> output state (board-pin label, e.g. "2", "16")
  simLog: string[]              // most recent simulation log lines
  draft: CatalogDraft

  setMode: (m: Mode) => void
  setProject: (p: Project) => void
  openBoardPicker: () => void
  createProject: (name: string, boardId: string) => void
  select: (instance: string | null) => void

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
  simStep: (dtMs: number, gpios: Record<string, boolean>, logs: string[]) => void

  addBehavior: () => string
  removeBehavior: (id: string) => void
  updateBehavior: (id: string, patch: Partial<Behavior>) => void

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

export const useStore = create<State>((set) => ({
  mode: 'project',
  project: seed(),
  showBoardPicker: false,
  selected: null,
  pendingPin: null,
  catalogVersion: 0,
  simulating: false,
  simPhase: 0,
  simTime: 0,
  simGpios: {},
  simLog: [],
  draft: newDraft(),

  setMode: (mode) => set({ mode }),
  setProject: (project) => set({ project }),
  openBoardPicker: () => set({ showBoardPicker: true }),
  createProject: (name, boardId) => {
    const board = catalog.getBoard(boardId)
    const target = (board?.target ?? 'esp32') as Target
    set({ project: emptyProject(name || 'untitled', boardId, target), showBoardPicker: false, selected: null, pendingPin: null })
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
    return { pendingPin: null, project: { ...s.project, nets } }
  }),
  cancelWire: () => set({ pendingPin: null }),
  removeNet: (id) => set((s) => ({
    project: { ...s.project, nets: s.project.nets.filter((n) => n.id !== id) }
  })),
  rewireBoardPin: (netId, toBoardPinId) => set((s) => ({
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
    // scatter new components in a line to the right of the board
    const x = 0.04 + (existing * 0.01)
    return {
      project: { ...s.project, components: [...s.project.components, {
        instance, componentId, position: [x, 0.005, 0.02], pinAssignments: {}
      }]},
      selected: instance
    }
  }),
  removeComponent: (instance) => set((s) => ({
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
    project: {
      ...s.project,
      components: s.project.components.map((c) =>
        c.instance === instance ? { ...c, position } : c)
    }
  })),
  bumpCatalog: () => set((s) => ({ catalogVersion: s.catalogVersion + 1 })),
  setSimulating: (b) => set({
    simulating: b, simPhase: 0,
    simTime: 0, simGpios: {}, simLog: b ? ['[sim] start'] : []
  }),
  tickSim: () => set((s) => ({ simPhase: s.simPhase === 0 ? 1 : 0 })),
  simStep: (dtMs, gpios, logs) => set((s) => ({
    simTime: s.simTime + dtMs,
    simPhase: s.simPhase === 0 ? 1 : 0,
    simGpios: gpios,
    simLog: [...s.simLog, ...logs].slice(-200)
  })),

  addBehavior: () => {
    const id = `beh${Date.now().toString(36)}`
    set((s) => ({
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
    project: { ...s.project, behaviors: s.project.behaviors.filter((b) => b.id !== id) }
  })),
  updateBehavior: (id, patch) => set((s) => ({
    project: {
      ...s.project,
      behaviors: s.project.behaviors.map((b) => b.id === id ? { ...b, ...patch } : b)
    }
  })),

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
  const p = emptyProject('untitled', 'esp32-devkitc-v4', 'esp32')
  p.components.push({
    instance: 'led1',
    componentId: 'led-5mm-red',
    position: [0.04, 0.005, 0],
    pinAssignments: { anode: 'GPIO2', cathode: 'GND' }
  })
  return p
}
