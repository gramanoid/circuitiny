import { describe, it, expect } from 'vitest'
import { catalog } from '../src/catalog'
import type { BoardDef } from '../src/project/component'

describe('catalog — boards', () => {
  it('registers all 5 boards', () => {
    const ids = catalog.listBoards().map((b) => b.id)
    expect(ids).toContain('esp32-devkitc-v4')
    expect(ids).toContain('esp32s3-devkitc-1')
    expect(ids).toContain('esp32c3-devkitm-1')
    expect(ids).toContain('esp32c6-devkitc-1')
    expect(ids).toContain('xiao-esp32s3')
  })

  it('each board has the correct target field', () => {
    expect(catalog.getBoard('esp32-devkitc-v4')?.target).toBe('esp32')
    expect(catalog.getBoard('esp32s3-devkitc-1')?.target).toBe('esp32s3')
    expect(catalog.getBoard('esp32c3-devkitm-1')?.target).toBe('esp32c3')
    expect(catalog.getBoard('esp32c6-devkitc-1')?.target).toBe('esp32c6')
    expect(catalog.getBoard('xiao-esp32s3')?.target).toBe('esp32s3')
  })

  it('esp32-devkitc-v4 has 26 pins', () => {
    expect(catalog.getBoard('esp32-devkitc-v4')?.pins).toHaveLength(26)
  })

  it('esp32s3-devkitc-1 has 38 pins', () => {
    expect(catalog.getBoard('esp32s3-devkitc-1')?.pins).toHaveLength(38)
  })

  it('esp32c3-devkitm-1 has 22 pins', () => {
    expect(catalog.getBoard('esp32c3-devkitm-1')?.pins).toHaveLength(22)
  })

  it('esp32c6-devkitc-1 has 30 pins', () => {
    expect(catalog.getBoard('esp32c6-devkitc-1')?.pins).toHaveLength(30)
  })

  it('xiao-esp32s3 has 14 pins', () => {
    expect(catalog.getBoard('xiao-esp32s3')?.pins).toHaveLength(14)
  })

  it('strapping pins are non-empty on all boards', () => {
    for (const board of catalog.listBoards()) {
      expect(board.strappingPins.length, `${board.id} strappingPins`).toBeGreaterThan(0)
    }
  })

  it('flash pins are defined on all boards', () => {
    for (const board of catalog.listBoards()) {
      expect(board.flashPins.length, `${board.id} flashPins`).toBeGreaterThan(0)
    }
  })

  it('esp32 input-only pins include GPIO34 and GPIO39', () => {
    const board = catalog.getBoard('esp32-devkitc-v4')!
    expect(board.inputOnlyPins).toContain('GPIO34')
    expect(board.inputOnlyPins).toContain('GPIO39')
  })

  it('returns undefined for unknown board', () => {
    expect(catalog.getBoard('nonexistent')).toBeUndefined()
  })

  it('can remove dynamically registered boards and their GLB URL', () => {
    const base = catalog.getBoard('esp32-devkitc-v4')!
    const board: BoardDef = {
      ...base,
      id: 'test-dynamic-board',
      name: 'Test Dynamic Board',
    }
    const previousRevoke = URL.revokeObjectURL
    const previousCreate = URL.createObjectURL
    const revoked: string[] = []
    URL.createObjectURL = () => 'blob:test-dynamic-board'
    URL.revokeObjectURL = (url: string) => { revoked.push(url) }
    try {
      catalog.registerBoard(board, new Uint8Array([1, 2, 3]))
      expect(catalog.getBoard('test-dynamic-board')).toBeDefined()
      expect(catalog.getGlbUrl('test-dynamic-board')).toBe('blob:test-dynamic-board')

      catalog.removeBoard('test-dynamic-board')

      expect(catalog.getBoard('test-dynamic-board')).toBeUndefined()
      expect(catalog.getGlbUrl('test-dynamic-board')).toBeUndefined()
      expect(revoked).toEqual(['blob:test-dynamic-board'])
    } finally {
      URL.revokeObjectURL = previousRevoke
      URL.createObjectURL = previousCreate
      catalog.removeBoard('test-dynamic-board')
    }
  })
})

describe('catalog — components', () => {
  it('registers led-5mm-red, resistor-220r, button-6mm', () => {
    expect(catalog.getComponent('led-5mm-red')).toBeDefined()
    expect(catalog.getComponent('resistor-220r')).toBeDefined()
    expect(catalog.getComponent('button-6mm')).toBeDefined()
  })

  it('led has sim role "led"', () => {
    expect(catalog.getComponent('led-5mm-red')?.sim?.role).toBe('led')
  })

  it('button has sim role "button"', () => {
    expect(catalog.getComponent('button-6mm')?.sim?.role).toBe('button')
  })

  it('resistor has exactly 2 pins', () => {
    expect(catalog.getComponent('resistor-220r')?.pins).toHaveLength(2)
  })

  it('built-in components carry trusted catalog metadata', () => {
    for (const id of ['led-5mm-red', 'resistor-220r', 'capacitor-100nf', 'button-6mm']) {
      const component = catalog.getComponent(id)
      expect(component, `component ${id} should exist`).toBeDefined()
      expect(component!.catalogMeta?.trust, component!.id).toBe('builtin')
      expect(component!.catalogMeta?.confidence, component!.id).toBe('high')
      expect(component!.catalogMeta?.renderStrategy, component!.id).toBe(component!.model ? 'catalog-glb' : 'primitive')
    }
  })

  it('returns undefined for unknown component', () => {
    expect(catalog.getComponent('nonexistent')).toBeUndefined()
  })
})
