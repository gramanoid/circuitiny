import { create } from 'zustand'
import { type Project, emptyProject, type PinType } from './project/schema'

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
  selected: string | null
  pendingPin: PinRef | null    // first end of a wire being drawn
  draft: CatalogDraft

  setMode: (m: Mode) => void
  setProject: (p: Project) => void
  select: (instance: string | null) => void

  clickPin: (ref: PinRef) => void
  cancelWire: () => void
  removeNet: (id: string) => void

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
  selected: null,
  pendingPin: null,
  draft: newDraft(),

  setMode: (mode) => set({ mode }),
  setProject: (project) => set({ project }),
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
  const p = emptyProject('untitled', 'esp32')
  p.components.push({
    instance: 'led1',
    componentId: 'led-5mm-red',
    position: [0.04, 0.005, 0],
    pinAssignments: { anode: 'GPIO2', cathode: 'GND' }
  })
  return p
}
