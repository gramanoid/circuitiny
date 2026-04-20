// Tool surface exposed to the local LLM. Small and typed.
// Each tool: JSON schema for the model + an executor that mutates the store and returns a compact result.

import { useStore } from '../store'
import { catalog } from '../catalog'
import { runDrc } from '../drc'
import { resolvePin } from '../project/pins'

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: { type: 'object'; properties: Record<string, any>; required?: string[] }
  }
}

export const tools: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_project',
      description: 'Return the current project summary: board, components, nets, DRC status.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_catalog',
      description: 'List available components in the catalog (id, name, category, pin ids).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_component',
      description: 'Add a component instance to the project. Use an id from list_catalog.',
      parameters: {
        type: 'object',
        properties: { componentId: { type: 'string', description: 'Catalog component id, e.g. "led-5mm-red"' } },
        required: ['componentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_component',
      description: 'Remove a component instance and any nets touching it.',
      parameters: {
        type: 'object',
        properties: { instance: { type: 'string', description: 'Instance name like "led1"' } },
        required: ['instance']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'connect',
      description: 'Wire two pins together. Pin refs look like "instance.pinId" or "board.pinId" (e.g. "led1.anode", "board.gpio4").',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to:   { type: 'string' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_drc',
      description: 'Run design rule checks and return errors + warnings.',
      parameters: { type: 'object', properties: {} }
    }
  }
]

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function execTool(name: string, args: Record<string, any>): Promise<ToolResult> {
  const s = useStore.getState()
  try {
    switch (name) {
      case 'get_project': {
        const drc = runDrc(s.project)
        return {
          ok: true,
          data: {
            board: s.project.board,
            target: s.project.target,
            components: s.project.components.map(c => ({
              instance: c.instance, componentId: c.componentId, pinAssignments: c.pinAssignments
            })),
            nets: s.project.nets,
            drc: { errors: drc.errors.length, warnings: drc.warnings.length }
          }
        }
      }

      case 'list_catalog': {
        return {
          ok: true,
          data: {
            components: catalog.listComponents().map(c => ({
              id: c.id, name: c.name, category: c.category,
              pins: c.pins.map(p => ({ id: p.id, label: p.label, type: p.type }))
            })),
            boardPins: catalog.getBoard(s.project.board)?.pins.map(p => ({
              id: p.id, label: p.label, type: p.type
            })) ?? []
          }
        }
      }

      case 'add_component': {
        if (!catalog.getComponent(args.componentId)) return { ok: false, error: `unknown componentId ${args.componentId}` }
        const before = s.project.components.length
        s.addComponent(args.componentId)
        const after = useStore.getState().project.components
        const added = after[after.length - 1]
        return { ok: true, data: { instance: added.instance, componentId: added.componentId, index: before } }
      }

      case 'remove_component': {
        if (!s.project.components.find(c => c.instance === args.instance))
          return { ok: false, error: `no such instance ${args.instance}` }
        s.removeComponent(args.instance)
        return { ok: true, data: { removed: args.instance } }
      }

      case 'connect': {
        const from = args.from as string, to = args.to as string
        if (!resolvePin(s.project, from)) return { ok: false, error: `unresolved pin: ${from}` }
        if (!resolvePin(s.project, to))   return { ok: false, error: `unresolved pin: ${to}` }
        s.clickPin(from)
        s.clickPin(to)
        const after = useStore.getState().project
        const drc = runDrc(after)
        return {
          ok: true,
          data: {
            netCount: after.nets.length,
            drc: { errors: drc.errors, warnings: drc.warnings }
          }
        }
      }

      case 'run_drc': {
        const drc = runDrc(s.project)
        return { ok: true, data: drc }
      }

      default:
        return { ok: false, error: `unknown tool: ${name}` }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}
