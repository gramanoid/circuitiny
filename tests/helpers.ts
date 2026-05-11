// Shared project builder for tests — keeps test bodies short.

import type { Project, Net, Behavior } from '../src/project/schema'
import type { RealityCheckStorage } from '../src/reality/check'

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    name: 'test',
    target: 'esp32',
    board: 'esp32-devkitc-v4',
    components: [],
    nets: [],
    behaviors: [],
    app: { wifi: { enabled: false }, log_level: 'info' },
    ...overrides,
  }
}

// Minimal seed: btn1 (gpio4) → led1 through r1 (gpio16)
export function makeSeedProject(): Project {
  return makeProject({
    components: [
      { instance: 'r1',   componentId: 'resistor-220r', position: [0,0,0], pinAssignments: {} },
      { instance: 'led1', componentId: 'led-5mm-red',   position: [0,0,0], pinAssignments: {} },
      { instance: 'btn1', componentId: 'button-6mm',    position: [0,0,0], pinAssignments: {} },
    ],
    nets: [
      { id: 'net1', endpoints: ['board.gpio16', 'r1.in'] },
      { id: 'net2', endpoints: ['r1.out', 'led1.anode'] },
      { id: 'net3', endpoints: ['led1.cathode', 'board.gnd_l'] },
      { id: 'net4', endpoints: ['board.gpio4', 'btn1.a'] },
      { id: 'net5', endpoints: ['btn1.b', 'board.gnd_r'] },
    ],
  })
}

export function memoryStorage(): RealityCheckStorage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    clear: () => values.clear(),
  }
}
