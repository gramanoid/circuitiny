// Tool surface exposed to the local LLM. Small and typed.
// Each tool: JSON schema for the model + an executor that mutates the store and returns a compact result.

import { useStore } from '../store'
import { catalog } from '../catalog'
import { runDrc } from '../drc'
import { resolvePin } from '../project/pins'
import type { Project, Behavior, TriggerKind, Action } from '../project/schema'

// Per-turn context threaded through the agent loop — tracks repeat failures and
// carries an AbortSignal so long-running tools (fetch_url) can be cancelled.
export type ExecContext = { failedCalls: Map<string, number>; signal?: AbortSignal }
export function makeExecContext(signal?: AbortSignal): ExecContext {
  return { failedCalls: new Map(), signal }
}

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
  },
  {
    type: 'function',
    function: {
      name: 'think',
      description: 'Write private reasoning or a design plan. No side effects — use this to think through the problem, propose a BOM, or plan wiring before acting.',
      parameters: {
        type: 'object',
        properties: {
          reasoning: { type: 'string', description: 'Step-by-step reasoning, analysis, or design plan.' }
        },
        required: ['reasoning']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a URL and return its readable text content (first 6000 chars). Use to look up Espressif docs, component datasheets, or application notes.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch.' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_firmware',
      description: 'Read the content of a custom firmware file previously written by write_firmware.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path, e.g. "main/app_main.c"' }
        },
        required: ['file']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_firmware',
      description: 'Write firmware source code into the project. Use file "main/app_main.c" for the main application. The code appears immediately in the Code pane. Write complete, compilable ESP-IDF C code.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path, e.g. "main/app_main.c"' },
          code: { type: 'string', description: 'Full source code content for the file.' }
        },
        required: ['file', 'code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_behavior',
      description: 'Create or replace a behavior (trigger → actions). Use this to define the firmware logic the simulator will run. If a behavior with the same id already exists it is replaced.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Stable identifier for this behavior, e.g. "blink", "on_boot", "button_press". Used to update the same behavior later.'
          },
          trigger: {
            type: 'object',
            description: 'What causes the behavior to fire.',
            properties: {
              type: {
                type: 'string',
                enum: ['boot', 'timer', 'gpio_edge', 'wifi_connected'],
                description: '"boot" fires once at startup. "timer" fires every period_ms. "gpio_edge" fires when a pin changes. "wifi_connected" fires when Wi-Fi connects.'
              },
              period_ms: {
                type: 'number',
                description: 'Required for type "timer". Period in milliseconds, e.g. 500.'
              },
              source: {
                type: 'string',
                description: 'Required for type "gpio_edge". Pin ref that is the input, e.g. "btn1.a" or "board.gpio0".'
              },
              edge: {
                type: 'string',
                enum: ['rising', 'falling', 'both'],
                description: 'Required for type "gpio_edge".'
              }
            },
            required: ['type']
          },
          actions: {
            type: 'array',
            description: 'Ordered list of actions to perform when the trigger fires.',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['set_output', 'toggle', 'log', 'delay', 'sequence'],
                  description: '"set_output" drives a pin high or low. "toggle" flips a pin. "log" emits a message in the sim console. "delay" waits ms (note: delays are approximated in the simulator). "sequence" runs a sub-list of actions.'
                },
                target: {
                  type: 'string',
                  description: 'For set_output / toggle: pin ref to drive, e.g. "led1.anode" or "board.gpio2".'
                },
                value: {
                  type: 'string',
                  enum: ['on', 'off'],
                  description: 'For set_output: "on" = high, "off" = low.'
                },
                level: {
                  type: 'string',
                  enum: ['info', 'warn', 'error'],
                  description: 'For log action.'
                },
                message: {
                  type: 'string',
                  description: 'For log action.'
                },
                ms: {
                  type: 'number',
                  description: 'For delay action: milliseconds to wait.'
                },
                actions: {
                  type: 'array',
                  description: 'For sequence action: nested actions.',
                  items: { type: 'object' }
                }
              },
              required: ['type']
            }
          },
          debounce_ms: {
            type: 'number',
            description: 'Optional debounce in ms for gpio_edge triggers.'
          }
        },
        required: ['id', 'trigger', 'actions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_behavior',
      description: 'Remove a behavior by id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Behavior id to remove.' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_project',
      description: 'Save the current project to disk. If the project has been saved before it overwrites the existing file silently; otherwise it opens a native save dialog for the user to choose a location. Call this at the end of any session where you made meaningful changes.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_glb_models',
      description: 'List all 3D GLB models registered in the system — both built-in boards and catalog components. Use to know which physical models are available.',
      parameters: { type: 'object', properties: {} }
    }
  }
]

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function execTool(
  name: string,
  args: Record<string, any>,
  ctx?: ExecContext
): Promise<ToolResult> {
  const result = await executeInternal(name, args, ctx)

  // Repeated-failure guard — if the same (tool, args) fails twice, append a hint
  // so the model stops hammering the same bad call and either tries something
  // else or reports it to the user.
  if (ctx && result.ok === false) {
    const key = `${name}:${stableStringify(args)}`
    const count = (ctx.failedCalls.get(key) ?? 0) + 1
    ctx.failedCalls.set(key, count)
    if (count >= 2) {
      return {
        ok: false,
        error: `${result.error} — This exact call has now failed ${count} times. Stop retrying with identical arguments; try a different approach or tell the user you're stuck.`
      }
    }
  }
  return result
}

async function executeInternal(
  name: string,
  args: Record<string, any>,
  ctx?: ExecContext
): Promise<ToolResult> {
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
            behaviors: s.project.behaviors,
            drc: { errors: drc.errors.length, warnings: drc.warnings.length },
            customFirmwareFiles: Object.keys(s.project.customCode ?? {}),
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
        if (!catalog.getComponent(args.componentId)) {
          const ids = catalog.listComponents().map(c => c.id)
          const near = closestMatches(String(args.componentId ?? ''), ids, 5)
          return {
            ok: false,
            error: `unknown componentId "${args.componentId}". Closest catalog ids: [${near.join(', ')}]. Call list_catalog for the full list.`
          }
        }
        const before = s.project.components.length
        s.addComponent(args.componentId)
        const after = useStore.getState().project.components
        const added = after[after.length - 1]
        return { ok: true, data: { instance: added.instance, componentId: added.componentId, index: before } }
      }

      case 'remove_component': {
        if (!s.project.components.find(c => c.instance === args.instance)) {
          const instances = s.project.components.map(c => c.instance)
          return {
            ok: false,
            error: `no such instance "${args.instance}". Current instances: [${instances.join(', ') || '(none)'}].`
          }
        }
        s.removeComponent(args.instance)
        return { ok: true, data: { removed: args.instance } }
      }

      case 'connect': {
        const from = args.from as string, to = args.to as string
        if (!resolvePin(s.project, from)) return { ok: false, error: `unresolved pin: "${from}". ${pinHint(s.project, from)}` }
        if (!resolvePin(s.project, to))   return { ok: false, error: `unresolved pin: "${to}". ${pinHint(s.project, to)}` }
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

      case 'read_firmware': {
        const file = String(args.file ?? 'main/app_main.c')
        const code = s.project.customCode?.[file]
        if (code === undefined) return { ok: false, error: `No custom firmware found for "${file}". Use write_firmware to create it first.` }
        return { ok: true, data: { file, code } }
      }

      case 'write_firmware': {
        const file = String(args.file ?? 'main/app_main.c')
        const code = String(args.code ?? '')
        s.setCustomCode(file, code)
        return { ok: true, data: { file, bytes: code.length } }
      }

      case 'set_behavior': {
        const behavior: Behavior = {
          id: String(args.id),
          trigger: args.trigger as TriggerKind,
          actions: (args.actions ?? []) as Action[],
          ...(args.debounce_ms != null ? { debounce_ms: Number(args.debounce_ms) } : {})
        }
        s.setBehavior(behavior)
        const all = useStore.getState().project.behaviors
        return { ok: true, data: { id: behavior.id, totalBehaviors: all.length } }
      }

      case 'remove_behavior': {
        const id = String(args.id)
        if (!s.project.behaviors.find((b) => b.id === id)) {
          const ids = s.project.behaviors.map((b) => b.id)
          return { ok: false, error: `No behavior with id "${id}". Current ids: [${ids.join(', ') || '(none)'}].` }
        }
        s.removeBehavior(id)
        return { ok: true, data: { removed: id } }
      }

      case 'save_project': {
        if (!window.espAI?.saveProject) return { ok: false, error: 'save_project is only available in the Electron app.' }
        const { project: p, savedPath: sp } = useStore.getState()
        const path = await window.espAI.saveProject(p, p.name, sp ?? undefined)
        if (!path) return { ok: false, error: 'Save was cancelled by the user.' }
        useStore.getState().markSaved(path)
        return { ok: true, data: { savedTo: path } }
      }

      case 'think': {
        // Side-effect-free reasoning step — just acknowledge so the model continues.
        return { ok: true, data: { logged: true } }
      }

      case 'fetch_url': {
        const url = args.url as string
        try {
          const timeout = AbortSignal.timeout(12000)
          const signal = ctx?.signal
            ? (AbortSignal as any).any?.([timeout, ctx.signal]) ?? timeout
            : timeout
          const resp = await fetch(url, { signal })
          if (!resp.ok) return { ok: false, error: `HTTP ${resp.status} from ${url}` }
          const ct = resp.headers.get('content-type') ?? ''
          const raw = await resp.text()
          const text = ct.includes('html')
            ? raw.replace(/<style[\s\S]*?<\/style>/gi, '')
                 .replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<[^>]+>/g, ' ')
                 .replace(/\s{2,}/g, ' ')
                 .trim()
            : raw
          return { ok: true, data: { url, content: text.slice(0, 6000) } }
        } catch (e: any) {
          return { ok: false, error: e?.message ?? String(e) }
        }
      }

      case 'list_glb_models': {
        const boards = catalog.listBoards().map(b => ({
          type: 'board', id: b.id, name: b.name, glb: b.model, target: b.target
        }))
        const components = catalog.listComponents().map(c => ({
          type: 'component', id: c.id, name: c.name, glb: c.model, category: c.category
        }))
        return { ok: true, data: { boards, components } }
      }

      default:
        return { ok: false, error: `unknown tool: ${name}` }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

// ---- helpers ----

// Deterministic stringify so repeated calls with the same keys in different
// order still hash to the same failure key.
function stableStringify(o: any): string {
  if (o === null || typeof o !== 'object') return JSON.stringify(o)
  if (Array.isArray(o)) return '[' + o.map(stableStringify).join(',') + ']'
  const keys = Object.keys(o).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

function closestMatches(query: string, candidates: string[], n: number): string[] {
  const q = query.toLowerCase()
  return candidates
    .map(c => ({ c, d: levenshtein(q, c.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.c)
}

// Build a helpful hint for a bad pin ref: suggest valid owners if the owner is
// unknown, or the closest pin ids on the correct owner if only the pin part is off.
function pinHint(project: Project, ref: string): string {
  const parts = (ref ?? '').split('.')
  const owner = parts[0] ?? ''
  const pinId = parts[1] ?? ''
  const owners = ['board', ...project.components.map(c => c.instance)]

  if (owner !== 'board' && !project.components.find(c => c.instance === owner)) {
    return `Unknown owner. Valid owners: [${owners.join(', ')}]. Format: "owner.pinId".`
  }

  let pinIds: string[] = []
  if (owner === 'board') {
    const board = catalog.getBoard(project.board)
    pinIds = board?.pins.map(p => p.id) ?? []
  } else {
    const inst = project.components.find(c => c.instance === owner)
    const def = inst && catalog.getComponent(inst.componentId)
    pinIds = def?.pins.map(p => p.id) ?? []
  }
  const near = closestMatches(pinId, pinIds, 5)
  return `Closest pins on "${owner}": [${near.join(', ')}]. Call get_project or list_catalog for the full pin list.`
}
