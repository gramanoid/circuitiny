import { create } from 'zustand'
import { type Project, emptyProject } from './project/schema'

export type Mode = 'project' | 'catalog-editor'

export interface DraftPin {
  id: string
  label: string
  type: import('./project/schema').PinType
  position: [number, number, number]
  normal: [number, number, number]
}

export interface CatalogDraft {
  id: string
  name: string
  category: 'sensor' | 'actuator' | 'display' | 'input' | 'power' | 'misc'
  glbPath: string | null
  glbData: Uint8Array | null      // bytes from preload (rendered via blob URL)
  pins: DraftPin[]
  selectedPin: string | null
}

interface State {
  mode: Mode
  project: Project
  selected: string | null
  draft: CatalogDraft
  setMode: (m: Mode) => void
  setProject: (p: Project) => void
  select: (instance: string | null) => void

  // catalog draft mutators
  loadDraftGlb: (path: string, data: Uint8Array) => void
  setDraftMeta: (patch: Partial<Pick<CatalogDraft, 'id' | 'name' | 'category'>>) => void
  addDraftPin: (position: [number, number, number], normal: [number, number, number]) => void
  updateDraftPin: (id: string, patch: Partial<DraftPin>) => void
  removeDraftPin: (id: string) => void
  selectDraftPin: (id: string | null) => void
  resetDraft: () => void
}

const newDraft = (): CatalogDraft => ({
  id: '', name: '', category: 'sensor',
  glbPath: null, glbData: null, pins: [], selectedPin: null
})

export const useStore = create<State>((set) => ({
  mode: 'project',
  project: seed(),
  selected: null,
  draft: newDraft(),

  setMode: (mode) => set({ mode }),
  setProject: (project) => set({ project }),
  select: (selected) => set({ selected }),

  loadDraftGlb: (glbPath, glbData) =>
    set((s) => ({ draft: { ...s.draft, glbPath, glbData } })),
  setDraftMeta: (patch) =>
    set((s) => ({ draft: { ...s.draft, ...patch } })),
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
