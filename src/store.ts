import { create } from 'zustand'
import { type Project, emptyProject } from './project/schema'

interface State {
  project: Project
  selected: string | null         // selected component instance id
  setProject: (p: Project) => void
  select: (instance: string | null) => void
}

export const useStore = create<State>((set) => ({
  project: seed(),
  selected: null,
  setProject: (project) => set({ project }),
  select: (selected) => set({ selected })
}))

// Seed with a placeholder DevKitC + one LED so the viewer has something to show.
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
