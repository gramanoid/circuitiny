// Tool surface exposed to the local LLM. Small and typed.
// Each tool: JSON schema for the model + an executor that mutates the store and returns a compact result.

import { useStore } from '../store'
import { catalog } from '../catalog'
import { runDrc } from '../drc'
import { resolvePin } from '../project/pins'
import type { Project, Behavior, TriggerKind, Action, PinType } from '../project/schema'
import { getRecipe, getRecipeStep } from '../learning/recipes'
import { summarizeViolationsForLearner } from '../learning/drcExplanations'
import { recommendParts } from '../learning/partRecommendations'
import type { ComponentDef, SchematicSymbol } from '../project/component'
import { TEMPLATES } from '../templates'
import { candidatesFromDescription, parsePhotoCandidates } from '../parts/photoAnalysis'
import { lookupPartKnowledge, lookupPartKnowledgeWithWeb } from '../parts/retrieval'
import { recommendProjectsFromInventory } from '../parts/recommendations'
import type { ExaSearchResult, InventoryItem, PartKnowledgeRecord, PhotoCandidate, ProjectRecommendation } from '../parts/types'
import { componentFromModelAsset, modelAssetById, searchModelAssets, type ModelAssetCandidate } from '../modelLibrary'
import {
  buildCodexSceneContext,
  evaluateAgentActionPolicy,
  listAgentActionSessions,
  recordAgentActionSession,
  validationForAction,
  type AgentActionKind,
  type CodexAutonomyTier,
  type CodexSceneContext,
} from './visualBuildAgent'
import { addJumper, createStarterLayoutFromProject, runPhysicalDrc, styleJumper, type PhysicalDrcFinding } from '../physical/breadboard'
import { analyzeRealityCheck, createRealityCheckSession, realityReadiness, type RealityCheckSession, type RealityObservation } from '../reality/check'
import { identifyPart, type DatasheetSource, type PartIdentity } from '../identity/datasheets'
import { CatalogTrustError, DraftCatalogPartError } from '../codegen/trust'

type PartRecommendation = ReturnType<typeof recommendParts>[number]
const DRAFT_PIN_HORIZONTAL_SPACING_M = 0.003
const DRAFT_PIN_Y_OFFSET_M = -0.004
const VALID_DRAFT_PIN_TYPES: ReadonlySet<PinType> = new Set([
  'power_in', 'power_out', 'ground',
  'digital_io', 'digital_in', 'digital_out',
  'analog_in', 'analog_out',
  'i2c_sda', 'i2c_scl',
  'spi_mosi', 'spi_miso', 'spi_sck', 'spi_cs',
  'uart_tx', 'uart_rx',
  'i2s_bclk', 'i2s_lrclk', 'i2s_din', 'i2s_dout',
  'pwm', 'nc',
])

// Per-turn context threaded through the agent loop — tracks repeat failures and
// carries an AbortSignal so long-running tools (fetch_url) can be cancelled.
export type ExecContext = {
  failedCalls: Map<string, number>
  recommendedParts: Map<string, PartRecommendation>
  modelCandidates: Map<string, ModelAssetCandidate>
  signal?: AbortSignal
}
export function makeExecContext(signal?: AbortSignal): ExecContext {
  return { failedCalls: new Map(), recommendedParts: new Map(), modelCandidates: new Map(), signal }
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
      name: 'remove_net',
      description: 'Remove a net (wire connection) by its id. Call get_project first to see current net ids.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Net id, e.g. "net-3"' } },
        required: ['id']
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
      name: 'place_part',
      description: 'Place or move an existing component instance in the 3D scene.',
      parameters: {
        type: 'object',
        properties: {
          instance: { type: 'string', description: 'Existing component instance, e.g. "led1".' },
          position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        },
        required: ['instance', 'position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_part',
      description: 'Typed alias for place_part; move an existing component instance in the 3D scene.',
      parameters: {
        type: 'object',
        properties: {
          instance: { type: 'string', description: 'Existing component instance, e.g. "led1".' },
          position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        },
        required: ['instance', 'position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect_pins',
      description: 'Typed alias for connect; wire two schematic pins together using instance.pin or board.pin refs.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect_breadboard_holes',
      description: 'Validate a physical jumper between two breadboard holes in the starter layout and return readable color/path guidance.',
      parameters: {
        type: 'object',
        properties: {
          from_hole: { type: 'string', description: 'Breadboard hole id, e.g. "a1".' },
          to_hole: { type: 'string', description: 'Breadboard hole id, e.g. "j10".' },
          color: { type: 'string', description: 'Optional jumper color.' },
        },
        required: ['from_hole', 'to_hole'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_item',
      description: 'Delete one project item by kind: component instance, net id, or behavior id.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['component', 'net', 'behavior'] },
          id: { type: 'string' },
        },
        required: ['kind', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_catalog',
      description: 'Search the local catalog by beginner terms, exact ids, names, family, or category.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
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
      description: 'Private reasoning step, no side effects. Think through the problem before acting.',
      parameters: {
        type: 'object',
        properties: { reasoning: { type: 'string' } },
        required: ['reasoning']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a URL and return its text content. Use for Espressif docs or component datasheets.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
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
            properties: {
              type: { type: 'string', enum: ['boot', 'timer', 'gpio_edge', 'wifi_connected'] },
              period_ms: { type: 'number', description: 'ms period for timer trigger.' },
              source: { type: 'string', description: 'Pin ref for gpio_edge, e.g. "btn1.a".' },
              edge: { type: 'string', enum: ['rising', 'falling', 'both'] }
            },
            required: ['type']
          },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['set_output', 'toggle', 'log', 'delay', 'sequence', 'set_pixel', 'set_strip'] },
                target: { type: 'string', description: 'Pin ref for set_output/toggle (e.g. "led1.anode"), or instance name for set_pixel/set_strip (e.g. "strip1").' },
                value: { type: 'string', enum: ['on', 'off'] },
                level: { type: 'string', enum: ['info', 'warn', 'error'] },
                message: { type: 'string' },
                ms: { type: 'number' },
                actions: { type: 'array', items: { type: 'object' } },
                index: { type: 'number', description: 'LED index (0-based) for set_pixel.' },
                r: { type: 'number', description: 'Red channel 0-255 for set_pixel.' },
                g: { type: 'number', description: 'Green channel 0-255 for set_pixel.' },
                b: { type: 'number', description: 'Blue channel 0-255 for set_pixel.' },
                pixels: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Array of [r,g,b] tuples for set_strip, one per LED.' }
              },
              required: ['type']
            }
          },
          debounce_ms: { type: 'number' }
        },
        required: ['id', 'trigger', 'actions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'blink',
      description: 'Make a pin toggle on a timer. Shorthand — use instead of set_behavior when you just need a blinking LED or periodic toggle.',
      parameters: {
        type: 'object',
        properties: {
          pin:       { type: 'string', description: 'Pin ref to toggle, e.g. "led1.anode".' },
          period_ms: { type: 'number', description: 'Toggle interval in milliseconds, e.g. 500.' },
          id:        { type: 'string', description: 'Behavior id (default: "blink").' }
        },
        required: ['pin', 'period_ms']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_on_boot',
      description: 'Set a pin on or off when the device boots. Shorthand — use instead of set_behavior for simple boot-time pin initialisation.',
      parameters: {
        type: 'object',
        properties: {
          pin:   { type: 'string', description: 'Pin ref, e.g. "led1.anode".' },
          value: { type: 'string', enum: ['on', 'off'], description: '"on" or "off".' },
          id:    { type: 'string', description: 'Behavior id (default: "on_boot").' }
        },
        required: ['pin', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'on_button_press',
      description: 'Control a pin when a button is pressed. Shorthand — use instead of set_behavior for simple button→LED interactions.',
      parameters: {
        type: 'object',
        properties: {
          button_pin:  { type: 'string', description: 'Button pin ref to watch, e.g. "btn1.a".' },
          action_pin:  { type: 'string', description: 'Pin ref to control, e.g. "led1.anode".' },
          action:      { type: 'string', enum: ['toggle', 'on', 'off'], description: '"toggle", "on", or "off".' },
          edge:        { type: 'string', enum: ['falling', 'rising', 'both'], description: 'Edge to trigger on (default: "falling").' },
          debounce_ms: { type: 'number', description: 'Debounce in ms (default: 50).' },
          id:          { type: 'string', description: 'Behavior id (default: "button_press").' }
        },
        required: ['button_pin', 'action_pin', 'action']
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
  },
  {
    type: 'function',
    function: {
      name: 'app_snapshot',
      description: 'Return a compact snapshot of the currently rendered Circuitiny UI, including viewport size, device pixel ratio, and clickable/typeable elements with bounding boxes. Use with the attached screenshot before app_click/app_type/app_press_key. Internal agent-only tool; do not expose to untrusted or third-party callers.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'app_click',
      description: 'Internal agent-only UI automation. element_index from app_snapshot takes precedence when present; otherwise x/y CSS coordinates are used. Synthetic events may not trigger user-gesture-only browser APIs; do not expose this API to untrusted or third-party callers.',
      parameters: {
        type: 'object',
        properties: {
          element_index: { type: 'number', description: 'Index from app_snapshot.elements.' },
          x: { type: 'number', description: 'CSS pixel x coordinate relative to the app viewport.' },
          y: { type: 'number', description: 'CSS pixel y coordinate relative to the app viewport.' },
          click_count: { type: 'number', description: 'Number of clicks, default 1.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'app_type',
      description: 'Type text into the currently focused input/textarea/contenteditable element inside Circuitiny. Internal agent-only tool; synthetic events may differ from real gestures and must not be exposed to untrusted or third-party callers.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Literal text to enter.' },
          replace: { type: 'boolean', description: 'If true, replace existing value/selection instead of appending. Default true.' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'app_press_key',
      description: 'Press a key in the currently focused Circuitiny UI element, e.g. Enter, Escape, Tab, ArrowLeft, Backspace. Internal agent-only tool; synthetic events may differ from real gestures and must not be exposed to untrusted or third-party callers.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          meta: { type: 'boolean' },
          ctrl: { type: 'boolean' },
          shift: { type: 'boolean' },
          alt: { type: 'boolean' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plan_circuit',
      description: 'Pre-flight check before building a circuit. Validates component IDs against the catalog, warns about missing companion parts (resistor for LED, pull-ups for I2C), and returns a curated list of safe GPIO pins for the current board. Call this before the first add_component.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'One-sentence description of what the circuit should do.' },
          components: {
            type: 'array',
            items: { type: 'string' },
            description: 'Catalog component IDs you plan to use, e.g. ["led-5mm-red", "resistor-220r"].'
          },
          use_wifi: { type: 'boolean', description: 'True if the design uses Wi-Fi — excludes ADC2 pins from the safe GPIO list.' }
        },
        required: ['goal', 'components']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_parts',
      description: 'Recommend beginner-safe parts from a plain-English goal. Searches the local catalog first, then returns reviewed draft suggestions when the catalog does not cover the goal.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'What the learner wants to build, e.g. "tell when my plant needs water".' }
        },
        required: ['goal']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_draft_part',
      description: 'Create an AI-draft catalog component from a recommend_parts result after explicit learner approval. This writes component.json only; the learner must review pins/rendering in Catalog Editor before trusting it.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Same goal passed to recommend_parts.' },
          recommendation_id: { type: 'string', description: 'Recommendation id returned by recommend_parts.' },
          approved: { type: 'boolean', description: 'Must be true only after the learner explicitly approved draft creation.' }
        },
        required: ['goal', 'recommendation_id', 'approved']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_parts_photo',
      description: 'Analyze a parts photo result or plain description into unconfirmed candidate parts. Does not persist inventory. Use photo_path only when the learner selected a local photo in the app.',
      parameters: {
        type: 'object',
        properties: {
          photo_path: { type: 'string', description: 'Local photo path selected by the learner in Parts Lab.' },
          codex_result: { type: 'string', description: 'Raw JSON/text from Codex vision analysis.' },
          description: { type: 'string', description: 'Plain-English visible parts, file name, or learner notes.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'match_parts_database',
      description: 'Match a part name against local catalog first, then curated beginner parts. Returns confidence, pins, companions, render fallback, and safety notes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Part name or marking, e.g. "ssd1306 oled" or "soil moisture sensor".' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_parts_web',
      description: 'Use Exa web search for an unknown part, then return low-trust metadata and source links. Requires EXA_API_KEY in the app environment.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Part name, chip marking, module name, or datasheet search phrase.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_model_library',
      description: 'Search free/open electronics CAD model candidates. Returns source, license, format, conversion need, and review warnings before any download or catalog write.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Part name, family, or exact part number, e.g. "5mm LED", "JST 4 pin", or "USB-C connector".' },
          bundled_only: { type: 'boolean', description: 'True to include only redistributable/open bundled-ok candidates.' },
          native_only: { type: 'boolean', description: 'True to include only native GLB/glTF candidates that do not need STEP conversion.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_model_candidate',
      description: 'Install a searched model candidate as a draft catalog bundle after explicit learner approval. Native GLB/glTF can install now; STEP/STP/WRL requires a configured converter.',
      parameters: {
        type: 'object',
        properties: {
          candidate_id: { type: 'string', description: 'Candidate id returned by search_model_library.' },
          approved: { type: 'boolean', description: 'Must be true only after the learner explicitly approved download/import.' }
        },
        required: ['candidate_id', 'approved']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_projects_from_inventory',
      description: 'Recommend beginner-friendly projects from confirmed parts. Pass only parts the learner confirmed they have.',
      parameters: {
        type: 'object',
        properties: {
          parts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Confirmed part names or catalog ids.'
          },
          novelty: { type: 'string', enum: ['normal', 'higher'], description: 'Use "higher" when the learner asks for something cooler or more interesting.' }
        },
        required: ['parts']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_recipe_from_project',
      description: 'Create a project from a recommended template after learner approval. Runs DRC after loading. Only supports recommendations with a built-in template.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Recommendation id, e.g. "blink-led" or "button-led".' },
          approved: { type: 'boolean', description: 'Must be true only after learner approval.' }
        },
        required: ['project_id', 'approved']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_scene_context',
      description: 'Return Codex visual build-agent context: project, render coverage, DRC, physical DRC, and allowed scoped actions.',
      parameters: {
        type: 'object',
        properties: {
          autonomy_tier: { type: 'string', enum: ['explain-only', 'draft-edit', 'guided-edit', 'hardware-gated'] },
          include_physical_layout: { type: 'boolean', description: 'Set true only when physical DRC/layout summary is needed.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_agent_action',
      description: 'Check whether a scoped Codex action is allowed and what validation/approval it needs.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['inspect', 'add-part', 'place-part', 'move-part', 'delete-item', 'connect', 'connect-breadboard', 'behavior-change', 'code-change', 'catalog-import', 'camera-analysis', 'build', 'flash', 'monitor'] },
          autonomy_tier: { type: 'string', enum: ['explain-only', 'draft-edit', 'guided-edit', 'hardware-gated'] }
        },
        required: ['action', 'autonomy_tier']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_physical_drc',
      description: 'Run beginner physical breadboard checks using the current project starter physical layout.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'identify_part',
      description: 'Identify a part from text or markings and return datasheet/source confidence for beginner-safe review.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          sources: {
            type: 'array',
            description: 'Optional learner-approved datasheet/source excerpts.',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                title: { type: 'string' },
                vendor: { type: 'string' },
                retrievedAt: { type: 'string' },
                licenseNote: { type: 'string' },
                checksum: { type: 'string' },
                text: { type: 'string' }
              },
              required: ['url', 'title', 'retrievedAt', 'licenseNote']
            }
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_reality_check',
      description: 'Run local Reality Check from learner-confirmed observations. Canonical observation fields are id, kind, label, componentInstance, endpoints, confidence, notes, and polarityReversed. Snake_case aliases accepted by normalizeRealityObservation include component_instance, polarity_reversed, confidence_level, note_text, and endpoints. Observed wires use endpoints like "r1.out" and "led1.anode".',
      parameters: {
        type: 'object',
        properties: {
          observations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                kind: { type: 'string', enum: ['wire', 'part', 'polarity', 'rail', 'unknown'] },
                label: { type: 'string' },
                endpoints: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                componentInstance: { type: 'string' },
                polarityReversed: { type: 'boolean', description: 'Canonical flag for reversed polarity observations.' },
                notes: { type: 'string' }
              }
            }
          },
          session_type: { type: 'string', enum: ['camera', 'photo'] },
          camera_granted: { type: 'boolean' },
          image_storage_allowed: { type: 'boolean' },
          ai_vision_approved: { type: 'boolean' }
        },
        required: ['observations']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_agent_action_history',
      description: 'Return recent scoped Codex tool sessions with changed objects and validation results.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rollback_last_agent_action',
      description: 'Rollback the most recent project mutation using Circuitiny undo history.',
      parameters: { type: 'object', properties: {} }
    }
  }
]

export interface GetProjectResult {
  beginnerGuidance: {
    visible: boolean
    recipeId: string
    stepIndex: number
    stepTitle: string
    action: string
    refs: string[]
  } | null
  drc: { beginnerSummary: string[] }
}

export interface RecommendPartsResult {
  goal: string
  recommendations: PartRecommendation[]
}

export interface AnalyzePartsPhotoResult {
  candidates: PhotoCandidate[]
}

export interface MatchPartsDatabaseResult {
  query: string
  part: PartKnowledgeRecord
}

export interface SearchPartsWebResult {
  query: string
  results: ExaSearchResult[]
  part: PartKnowledgeRecord
}

export interface SearchModelLibraryResult {
  query: string
  candidates: ModelAssetCandidate[]
}

export interface ImportModelCandidateResult {
  componentId: string
  savedTo?: string | null
  conversionStatus?: string
  conversionLog?: string[]
  catalogMeta?: ComponentDef['catalogMeta']
}

export interface RecommendProjectsResult {
  parts: PartKnowledgeRecord[]
  recommendations: ProjectRecommendation[]
}

export interface CreateDraftPartResult {
  componentId: string
  savedTo?: string | null
  catalogMeta?: ComponentDef['catalogMeta']
  skipped?: 'already_in_catalog'
}

export interface GetSceneContextResult {
  context: CodexSceneContext
}

export interface RunPhysicalDrcResult {
  errors: number
  warnings: number
  findings: PhysicalDrcFinding[]
  physicalLayout: {
    placements: number
    jumpers: number
    template: string
  }
}

export interface IdentifyPartResult {
  identity: PartIdentity
  nextStep: string
}

export interface RunRealityCheckResult {
  session: RealityCheckSession
  readiness: 'blocked' | 'warn' | 'pass'
}

export interface RunDrcResult {
  errors: number
  warnings: number
}

export interface AgentActionHistoryResult {
  sessions: ReturnType<typeof listAgentActionSessions>
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function execTool(
  name: string,
  args: Record<string, any>,
  ctx?: ExecContext
): Promise<ToolResult> {
  const beforeProject = useStore.getState().project
  const result = await executeInternal(name, args, ctx)
  recordSuccessfulAction(name, result, beforeProject)

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

type Handler = (args: Record<string, any>, ctx?: ExecContext) => Promise<ToolResult>

async function handleGetProject(): Promise<ToolResult> {
  const { project, activeRecipeId, recipeStepIndex, selected, guidanceVisible } = useStore.getState()
  const drc = runDrc(project)
  const recipe = getRecipe(activeRecipeId)
  const recipeStep = getRecipeStep(activeRecipeId, recipeStepIndex)
  const allViolations = [...drc.errors, ...drc.warnings]
  return {
    ok: true,
    data: {
      board: project.board,
      target: project.target,
      selected,
      components: project.components.map(c => ({ instance: c.instance, componentId: c.componentId })),
      nets: project.nets.map(n => ({ id: n.id, endpoints: n.endpoints })),
      behaviors: project.behaviors.map(b => ({ id: b.id, trigger: b.trigger.type, actions: b.actions.length })),
      drc: { errors: drc.errors.length, warnings: drc.warnings.length,
             messages: allViolations.slice(0, 5),
             beginnerSummary: summarizeViolationsForLearner(allViolations) },
      beginnerGuidance: recipe && recipeStep ? {
        visible: guidanceVisible,
        recipeId: recipe.id,
        stepIndex: recipeStepIndex,
        stepTitle: recipeStep.title,
        action: recipeStep.action,
        refs: recipeStep.refs ?? [],
      } : null,
      customFirmwareFiles: Object.keys(project.customCode ?? {}),
    }
  }
}

async function handleListCatalog(): Promise<ToolResult> {
  return {
    ok: true,
    data: {
      components: catalog.listComponents().map(c => ({
        id: c.id, name: c.name, category: c.category, pins: c.pins.map(p => p.id)
      }))
    }
  }
}

async function handleAddComponent(args: Record<string, any>): Promise<ToolResult> {
  const s = useStore.getState()
  if (!catalog.getComponent(args.componentId)) {
    const ids = catalog.listComponents().map(c => c.id)
    const near = closestMatches(String(args.componentId ?? ''), ids, 5)
    return { ok: false, error: `unknown componentId "${args.componentId}". Closest catalog ids: [${near.join(', ')}]. Call list_catalog for the full list.` }
  }
  const before = s.project.components.length
  try {
    s.addComponent(args.componentId)
  } catch (error) {
    if (error instanceof DraftCatalogPartError || error instanceof CatalogTrustError) return { ok: false, error: error.message }
    throw error
  }
  const after = useStore.getState().project.components
  const added = after[after.length - 1]
  return { ok: true, data: { instance: added.instance, componentId: added.componentId, index: before } }
}

async function handleRemoveComponent(args: Record<string, any>): Promise<ToolResult> {
  const { project, removeComponent } = useStore.getState()
  if (!project.components.find(c => c.instance === args.instance)) {
    const instances = project.components.map(c => c.instance)
    return { ok: false, error: `no such instance "${args.instance}". Current instances: [${instances.join(', ') || '(none)'}].` }
  }
  removeComponent(args.instance)
  return { ok: true, data: { removed: args.instance } }
}

async function handleRemoveNet(args: Record<string, any>): Promise<ToolResult> {
  const { project, removeNet } = useStore.getState()
  const net = project.nets.find(n => n.id === args.id)
  if (!net) {
    const ids = project.nets.map(n => n.id)
    return { ok: false, error: `no such net "${args.id}". Current net ids: [${ids.join(', ') || '(none)'}].` }
  }
  removeNet(args.id)
  return { ok: true, data: { removed: args.id, endpoints: net.endpoints } }
}

async function handleConnect(args: Record<string, any>): Promise<ToolResult> {
  const s = useStore.getState()
  const from = args.from as string, to = args.to as string
  if (from === to) return { ok: false, error: `Cannot connect a pin to itself: "${from}". Provide two different pin refs.` }
  if (!resolvePin(s.project, from)) return { ok: false, error: `unresolved pin: "${from}". ${pinHint(s.project, from)}` }
  if (!resolvePin(s.project, to))   return { ok: false, error: `unresolved pin: "${to}". ${pinHint(s.project, to)}` }
  const alreadyConnected = s.project.nets.find(n => n.endpoints.includes(from) && n.endpoints.includes(to))
  if (alreadyConnected) {
    return { ok: false, error: `"${from}" and "${to}" are already on the same net ("${alreadyConnected.id}"). No change needed.` }
  }
  s.clickPin(from)
  s.clickPin(to)
  const after = useStore.getState().project
  const drc = runDrc(after)
  const newErrors = drc.errors.filter(e => e.involves.includes(from) || e.involves.includes(to))
  return {
    ok: true,
    data: {
      netCount: after.nets.length,
      drc: {
        errors: drc.errors.length,
        warnings: drc.warnings.length,
        messages: [...drc.errors, ...drc.warnings].slice(0, 5),
        ...(newErrors.length > 0 ? {
          newErrorsFromThisConnect: newErrors.map(e => ({ rule: e.id, message: e.message, fix: e.fixHint }))
        } : {})
      }
    }
  }
}

async function handlePlacePart(args: Record<string, any>): Promise<ToolResult> {
  const instance = String(args.instance ?? '').trim()
  const position = normalizePosition(args.position)
  if (!instance) return { ok: false, error: 'place_part requires instance.' }
  if (!position) return { ok: false, error: 'place_part position must be an array of three finite numbers.' }
  const { project, moveComponent } = useStore.getState()
  if (!project.components.some((component) => component.instance === instance)) {
    return { ok: false, error: `No component instance "${instance}" exists.` }
  }
  moveComponent(instance, position)
  return { ok: true, data: { instance, position } }
}

async function handleConnectBreadboardHoles(args: Record<string, any>): Promise<ToolResult> {
  const fromHole = String(args.from_hole ?? '').trim().toLowerCase()
  const toHole = String(args.to_hole ?? '').trim().toLowerCase()
  const layout = createStarterLayoutFromProject(useStore.getState().project)
  if (!layout.template.holes[fromHole]) return { ok: false, error: `Unknown breadboard hole "${fromHole}".` }
  if (!layout.template.holes[toHole]) return { ok: false, error: `Unknown breadboard hole "${toHole}".` }
  const nextLayout = addJumper(layout, {
    id: `agent-jumper-${layout.jumpers.length + 1}`,
    fromHole,
    toHole,
    ...(typeof args.color === 'string' && args.color.trim() ? { color: args.color.trim() } : {}),
  })
  const jumper = nextLayout.jumpers[nextLayout.jumpers.length - 1]
  const findings = runPhysicalDrc(nextLayout, useStore.getState().project)
  return {
    ok: true,
    data: {
      jumper: styleJumper(jumper, nextLayout.jumpers.length - 1),
      physicalDrc: {
        errors: findings.filter((finding) => finding.severity === 'error').length,
        warnings: findings.filter((finding) => finding.severity === 'warning').length,
      },
      note: 'Starter physical layout is regenerated from the project; use this as validated jumper guidance until persisted physical editing lands.',
    },
  }
}

async function handleDeleteItem(args: Record<string, any>): Promise<ToolResult> {
  const kind = String(args.kind ?? '')
  const id = String(args.id ?? '').trim()
  if (!id) return { ok: false, error: 'delete_item requires id.' }
  const store = useStore.getState()
  if (kind === 'component') return handleRemoveComponent({ instance: id })
  if (kind === 'net') return handleRemoveNet({ id })
  if (kind === 'behavior') {
    if (!store.project.behaviors.some((behavior) => behavior.id === id)) return { ok: false, error: `No behavior "${id}" exists.` }
    store.removeBehavior(id)
    return { ok: true, data: { removed: id, kind } }
  }
  return { ok: false, error: `delete_item kind must be component, net, or behavior; got "${kind}".` }
}

async function handleSearchCatalog(args: Record<string, any>): Promise<ToolResult> {
  const query = String(args.query ?? '').trim().toLowerCase()
  const limit = Math.max(1, Math.min(20, Number(args.limit) || 10))
  if (!query) return { ok: false, error: 'search_catalog requires query.' }
  const matches = catalog.listComponents()
    .filter((component) => [component.id, component.name, component.family, component.category, component.docs?.notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query))
    .slice(0, limit)
    .map((component) => ({
      id: component.id,
      name: component.name,
      family: component.family,
      category: component.category,
      pins: component.pins.map((pin) => pin.id),
      trust: component.catalogMeta?.trust ?? 'user-installed',
    }))
  return { ok: true, data: { query, matches } }
}

async function handleRunDrc(): Promise<ToolResult> {
  const { project } = useStore.getState()
  const drc = runDrc(project)
  return { ok: true, data: { errors: drc.errors.length, warnings: drc.warnings.length,
                             messages: [...drc.errors, ...drc.warnings].slice(0, 10) } }
}

async function handleReadFirmware(args: Record<string, any>): Promise<ToolResult> {
  const { project } = useStore.getState()
  const file = String(args.file ?? 'main/app_main.c')
  const code = project.customCode?.[file]
  if (code === undefined) return { ok: false, error: `No custom firmware found for "${file}". Use write_firmware to create it first.` }
  return { ok: true, data: { file, code } }
}

async function handleWriteFirmware(args: Record<string, any>): Promise<ToolResult> {
  const file = String(args.file ?? 'main/app_main.c')
  const code = String(args.code ?? '')
  if (!code.trim()) return { ok: false, error: 'write_firmware called with empty code. Include the full source in the "code" parameter.' }
  useStore.getState().setCustomCode(file, code)
  return { ok: true, data: { file, bytes: code.length } }
}

const VALID_TRIGGERS = ['boot', 'timer', 'gpio_edge', 'wifi_connected'] as const
const VALID_ACTIONS  = ['set_output', 'toggle', 'log', 'delay', 'sequence'] as const

async function handleSetBehavior(args: Record<string, any>): Promise<ToolResult> {
  const triggerType = args.trigger?.type
  if (!VALID_TRIGGERS.includes(triggerType)) {
    const near = closestMatches(String(triggerType ?? ''), [...VALID_TRIGGERS], 3)
    return { ok: false, error: `Invalid trigger type "${triggerType}". Valid types: [${VALID_TRIGGERS.join(', ')}]. Closest matches: [${near.join(', ')}].` }
  }
  if (triggerType === 'timer' && args.trigger.period_ms == null) {
    return { ok: false, error: 'timer trigger requires "period_ms" (number, ms). Example: { type: "timer", period_ms: 1000 }' }
  }
  if (triggerType === 'gpio_edge' && !args.trigger.source) {
    return { ok: false, error: 'gpio_edge trigger requires "source" (pin ref). Example: { type: "gpio_edge", source: "btn1.a", edge: "falling" }' }
  }

  const { project } = useStore.getState()
  const actions: any[] = args.actions ?? []
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    if (!VALID_ACTIONS.includes(a.type)) {
      const near = closestMatches(String(a.type ?? ''), [...VALID_ACTIONS], 3)
      return { ok: false, error: `actions[${i}]: invalid type "${a.type}". Valid types: [${VALID_ACTIONS.join(', ')}]. Closest: [${near.join(', ')}].` }
    }
    if (a.type === 'set_output') {
      if (!a.target) return { ok: false, error: `actions[${i}] set_output requires "target" (pin ref, e.g. "led1.anode").` }
      if (!['on', 'off'].includes(a.value)) return { ok: false, error: `actions[${i}] set_output requires "value": "on" or "off".` }
      if (!resolvePin(project, a.target)) return { ok: false, error: `actions[${i}] target "${a.target}" not found. ${pinHint(project, a.target)}` }
    }
    if (a.type === 'toggle') {
      if (!a.target) return { ok: false, error: `actions[${i}] toggle requires "target" (pin ref, e.g. "led1.anode").` }
      if (!resolvePin(project, a.target)) return { ok: false, error: `actions[${i}] target "${a.target}" not found. ${pinHint(project, a.target)}` }
    }
    if (a.type === 'delay' && a.ms == null) {
      return { ok: false, error: `actions[${i}] delay requires "ms" (number, milliseconds). Example: { type: "delay", ms: 500 }` }
    }
    if (a.type === 'log' && !a.message) {
      return { ok: false, error: `actions[${i}] log requires "message" (string). Example: { type: "log", level: "info", message: "hello" }` }
    }
  }

  const behavior: Behavior = {
    id: String(args.id),
    trigger: args.trigger as TriggerKind,
    actions: actions as Action[],
    ...(args.debounce_ms != null ? { debounce_ms: Number(args.debounce_ms) } : {})
  }
  useStore.getState().setBehavior(behavior)
  const all = useStore.getState().project.behaviors
  return { ok: true, data: { id: behavior.id, totalBehaviors: all.length } }
}

async function handleBlink(args: Record<string, any>): Promise<ToolResult> {
  const { project } = useStore.getState()
  const pin = String(args.pin ?? '')
  const periodMs = Number(args.period_ms)
  if (!pin) return { ok: false, error: 'blink requires "pin" (pin ref, e.g. "led1.anode").' }
  if (!Number.isFinite(periodMs) || periodMs <= 0) return { ok: false, error: 'blink requires "period_ms" > 0.' }
  if (!resolvePin(project, pin)) return { ok: false, error: `pin "${pin}" not found. ${pinHint(project, pin)}` }
  const id = String(args.id ?? 'blink')
  useStore.getState().setBehavior({
    id,
    trigger: { type: 'timer', period_ms: periodMs },
    actions: [{ type: 'toggle', target: pin }],
  })
  return { ok: true, data: { id, pin, period_ms: periodMs } }
}

async function handleSetOnBoot(args: Record<string, any>): Promise<ToolResult> {
  const { project } = useStore.getState()
  const pin = String(args.pin ?? '')
  const value = String(args.value ?? '')
  if (!pin) return { ok: false, error: 'set_on_boot requires "pin" (pin ref, e.g. "led1.anode").' }
  if (!['on', 'off'].includes(value)) return { ok: false, error: 'set_on_boot requires "value": "on" or "off".' }
  if (!resolvePin(project, pin)) return { ok: false, error: `pin "${pin}" not found. ${pinHint(project, pin)}` }
  const id = String(args.id ?? 'on_boot')
  useStore.getState().setBehavior({
    id,
    trigger: { type: 'boot' },
    actions: [{ type: 'set_output', target: pin, value: value as 'on' | 'off' }],
  })
  return { ok: true, data: { id, pin, value } }
}

async function handleOnButtonPress(args: Record<string, any>): Promise<ToolResult> {
  const { project } = useStore.getState()
  const buttonPin = String(args.button_pin ?? '')
  const actionPin = String(args.action_pin ?? '')
  const action    = String(args.action ?? '')
  const edge      = String(args.edge ?? 'falling')
  if (!buttonPin) return { ok: false, error: 'on_button_press requires "button_pin".' }
  if (!actionPin) return { ok: false, error: 'on_button_press requires "action_pin".' }
  if (!['toggle', 'on', 'off'].includes(action)) return { ok: false, error: 'on_button_press "action" must be "toggle", "on", or "off".' }
  if (!['falling', 'rising', 'both'].includes(edge)) return { ok: false, error: 'on_button_press "edge" must be "falling", "rising", or "both".' }
  if (!resolvePin(project, buttonPin)) return { ok: false, error: `button_pin "${buttonPin}" not found. ${pinHint(project, buttonPin)}` }
  if (!resolvePin(project, actionPin)) return { ok: false, error: `action_pin "${actionPin}" not found. ${pinHint(project, actionPin)}` }
  const id = String(args.id ?? 'button_press')
  const act = action === 'toggle'
    ? { type: 'toggle' as const, target: actionPin }
    : { type: 'set_output' as const, target: actionPin, value: action as 'on' | 'off' }
  useStore.getState().setBehavior({
    id,
    trigger: { type: 'gpio_edge', source: buttonPin, edge: edge as 'falling' | 'rising' | 'both' },
    actions: [act],
    ...(args.debounce_ms != null ? { debounce_ms: Number(args.debounce_ms) } : { debounce_ms: 50 }),
  })
  return { ok: true, data: { id, button_pin: buttonPin, action_pin: actionPin, action, edge } }
}

async function handleRemoveBehavior(args: Record<string, any>): Promise<ToolResult> {
  const { project, removeBehavior } = useStore.getState()
  const id = String(args.id)
  if (!project.behaviors.find(b => b.id === id)) {
    const ids = project.behaviors.map(b => b.id)
    return { ok: false, error: `No behavior with id "${id}". Current ids: [${ids.join(', ') || '(none)'}].` }
  }
  removeBehavior(id)
  return { ok: true, data: { removed: id } }
}

async function handleSaveProject(): Promise<ToolResult> {
  if (!window.espAI?.saveProject) return { ok: false, error: 'save_project is only available in the Electron app.' }
  const { project, savedPath, markSaved } = useStore.getState()
  const path = await window.espAI.saveProject(project, project.name, savedPath ?? undefined)
  if (!path) return { ok: false, error: 'Save was cancelled by the user.' }
  markSaved(path)
  return { ok: true, data: { savedTo: path } }
}

type AppElement = {
  index: number
  tag: string
  role: string | null
  label: string
  value?: string
  box: { x: number; y: number; width: number; height: number }
}

function isVisibleElement(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  const style = window.getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0
}

function elementLabel(el: Element): string {
  const placeholder = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.placeholder : undefined
  const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    ? el.value
    : undefined
  const label = [
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    placeholder,
    value,
    el.textContent,
  ].find((v) => v && v.trim())
  return (label ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
}

function appControlElements(): Element[] {
  const selector = [
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="tab"]',
    '[contenteditable="true"]',
    'canvas',
    'svg',
  ].join(',')
  return Array.from(document.querySelectorAll(selector))
    .filter(isVisibleElement)
    .filter(isInteractiveControlElement)
    .slice(0, 120)
}

// Treat large canvas/svg elements as interactive viewports while filtering tiny decorative icons.
const MIN_INTERACTIVE_AREA_PX = 12_000
const INTERACTIVE_ROLES = new Set(['button', 'tab', 'link', 'menuitem', 'checkbox', 'radio', 'switch', 'slider'])

function isInteractiveControlElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag !== 'canvas' && tag !== 'svg') return true

  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)
  if (style.pointerEvents === 'none') return false
  if (el.closest('button,a,[role="button"],[role="tab"]')) return false
  const role = el.getAttribute('role')
  if (role && INTERACTIVE_ROLES.has(role)) return true
  if ((el as HTMLElement).tabIndex >= 0) return true
  if ((el as HTMLElement).onclick || el.hasAttribute('onclick')) return true
  if (el.getAttribute('aria-label') || el.getAttribute('title')) return true
  return rect.width * rect.height >= MIN_INTERACTIVE_AREA_PX
}

function appElements(): AppElement[] {
  return appControlElements()
    .map((el, index) => {
      const rect = el.getBoundingClientRect()
      const value = 'value' in el ? String((el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value) : undefined
      return {
        index,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        label: elementLabel(el),
        ...(value ? { value: value.slice(0, 160) } : {}),
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }
    })
}

async function handleAppSnapshot(): Promise<ToolResult> {
  return {
    ok: true,
    data: {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      activeElement: document.activeElement ? elementLabel(document.activeElement) : null,
      elements: appElements(),
    },
  }
}

function targetFromArgs(args: Record<string, any>): Element | null {
  if (args.element_index != null && Number.isFinite(Number(args.element_index))) {
    // app_snapshot indices are live DOM positions; callers should click soon after the snapshot to avoid drift.
    return appControlElements()[Number(args.element_index)] ?? null
  }
  if (Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y))) {
    return document.elementFromPoint(Number(args.x), Number(args.y))
  }
  return null
}

function elementMetadata(el: Element) {
  const rect = el.getBoundingClientRect()
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: el instanceof HTMLElement ? Array.from(el.classList).slice(0, 6) : [],
    box: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  }
}

const APP_CLICK_EVENT_DELAY_MS = 12
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function handleAppClick(args: Record<string, any>): Promise<ToolResult> {
  // Internal agent automation only: synthetic events can differ from real user gestures and should not back production UI behavior.
  const el = targetFromArgs(args)
  if (!el) return { ok: false, error: 'No clickable target found. Call app_snapshot and pass element_index, or pass x/y CSS coordinates.' }
  const rect = el.getBoundingClientRect()
  const x = Number.isFinite(Number(args.x)) ? Number(args.x) : rect.left + rect.width / 2
  const y = Number.isFinite(Number(args.y)) ? Number(args.y) : rect.top + rect.height / 2
  const count = Math.max(1, Number(args.click_count ?? 1))
  ;(el as HTMLElement).focus()
  for (let i = 0; i < count; i++) {
    const eventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }
    el.dispatchEvent(new MouseEvent('pointerdown', eventInit))
    await sleep(APP_CLICK_EVENT_DELAY_MS)
    el.dispatchEvent(new MouseEvent('mousedown', eventInit))
    el.dispatchEvent(new MouseEvent('pointerup', eventInit))
    await sleep(APP_CLICK_EVENT_DELAY_MS)
    el.dispatchEvent(new MouseEvent('mouseup', eventInit))
    el.dispatchEvent(new MouseEvent('click', eventInit))
  }
  return { ok: true, data: { clicked: elementLabel(el), element: elementMetadata(el), x: Math.round(x), y: Math.round(y) } }
}

async function handleAppType(args: Record<string, any>): Promise<ToolResult> {
  const el = document.activeElement as HTMLElement | null
  if (!el) return { ok: false, error: 'No focused element. Call app_click on an input first.' }
  const text = String(args.text ?? '')
  const replace = args.replace !== false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = replace ? text : el.value + text
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, data: { typed: text.length, target: elementLabel(el) } }
  }
  if (el.isContentEditable) {
    const selection = window.getSelection()
    const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    const range = selectedRange && el.contains(selectedRange.commonAncestorContainer)
      ? selectedRange
      : document.createRange()
    if (!selectedRange || !el.contains(selectedRange.commonAncestorContainer)) {
      range.selectNodeContents(el)
      range.collapse(false)
    }
    if (replace) range.selectNodeContents(el)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    return { ok: true, data: { typed: text.length, target: elementLabel(el) } }
  }
  return { ok: false, error: `Focused element is not typeable: ${el.tagName.toLowerCase()}.` }
}

async function handleAppPressKey(args: Record<string, any>): Promise<ToolResult> {
  const key = String(args.key ?? '')
  if (!key) return { ok: false, error: 'key is required.' }
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  const init: KeyboardEventInit = {
    key,
    bubbles: true,
    cancelable: true,
    metaKey: !!args.meta,
    ctrlKey: !!args.ctrl,
    shiftKey: !!args.shift,
    altKey: !!args.alt,
  }
  target.dispatchEvent(new KeyboardEvent('keydown', init))
  target.dispatchEvent(new KeyboardEvent('keyup', init))
  return { ok: true, data: { key, target: elementLabel(target) || target.tagName.toLowerCase() } }
}

async function handleFetchUrl(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
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
    return { ok: true, data: { url, content: text.slice(0, 4000) } }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

async function handlePlanCircuit(args: Record<string, any>): Promise<ToolResult> {
  const { project } = useStore.getState()
  const board = catalog.getBoard(project.board)
  if (!board) return { ok: false, error: 'No board loaded in project. Cannot plan.' }

  const requestedIds: string[] = Array.isArray(args.components) ? args.components : []
  const useWifi: boolean = !!args.use_wifi

  const validComponents: string[] = []
  const unknownComponents: { id: string; suggestions: string[] }[] = []
  const warnings: string[] = []
  const checklist: string[] = []

  const allCatalogIds = catalog.listComponents().map(c => c.id)
  for (const id of requestedIds) {
    if (catalog.getComponent(id)) {
      validComponents.push(id)
      checklist.push(`✓ "${id}" found in catalog`)
    } else {
      const suggestions = closestMatches(id, allCatalogIds, 3)
      unknownComponents.push({ id, suggestions })
      checklist.push(`✗ "${id}" not in catalog — closest: [${suggestions.join(', ')}]. Call list_catalog for all IDs.`)
    }
  }

  // Companion checks
  const hasLed = validComponents.some(id => catalog.getComponent(id)?.pins.some(p => p.id === 'anode'))
  const hasResistor = validComponents.some(id => id.startsWith('resistor-'))
  if (hasLed && !hasResistor) {
    warnings.push('LED planned without a series resistor — add "resistor-220r" to protect the LED and GPIO')
    checklist.push('⚠ Add resistor-220r for the LED before wiring')
  }

  const hasI2cComp = validComponents.some(id =>
    catalog.getComponent(id)?.pins.some(p => p.type === 'i2c_sda' || p.type === 'i2c_scl')
  )
  const hasPullup4k = validComponents.some(id => /resistor-4k/i.test(id))
  if (hasI2cComp && !hasPullup4k) {
    warnings.push('I2C component planned without 4.7 kΩ pull-ups — add resistor-4k7 ×2 for SDA and SCL')
    checklist.push('⚠ Add resistor-4k7 (×2) for I2C pull-ups on SDA and SCL')
  }

  // Build safe GPIO list: exclude flash, strapping, input-only, USB, already-used, and ADC2 when Wi-Fi is on
  const usedBoardPins = new Set(
    project.nets.flatMap(n => n.endpoints)
      .filter(e => e.startsWith('board.'))
      .map(e => e.split('.')[1])
  )
  const restrictedGpios = new Set([
    ...board.flashPins,
    ...board.strappingPins,
    ...board.inputOnlyPins,
    ...(board.usbPins ?? []),
    ...(useWifi ? (board.adc2Pins ?? []) : []),
  ])
  const safeGpios = board.pins
    .filter(p => {
      if (['ground', 'power_in', 'power_out', 'nc'].includes(p.type)) return false
      if (usedBoardPins.has(p.id)) return false
      const gpioLabel = 'GPIO' + p.label
      if (restrictedGpios.has(gpioLabel)) return false
      return true
    })
    .map(p => ({ pinId: p.id, gpio: `GPIO${p.label}`, type: p.type }))

  if (safeGpios.length === 0) {
    warnings.push('No safe GPIO pins available on this board — all suitable pins are in use or restricted')
  }

  const hasErrors = unknownComponents.length > 0
  return {
    ok: true,
    data: {
      goal: args.goal ?? '(not specified)',
      validComponents,
      unknownComponents,
      warnings,
      safeGpios,
      checklist,
      nextStep: hasErrors
        ? 'Fix unknown component IDs before proceeding. Use the suggestions above or call list_catalog.'
        : warnings.length > 0
          ? 'Address the warnings above (add missing companion parts), then proceed with add_component.'
          : 'Plan validated. Proceed with add_component for each item in validComponents, using safeGpios for pin assignments.'
    }
  }
}

async function handleListGlbModels(): Promise<ToolResult> {
  const boards = catalog.listBoards().map(b => ({ type: 'board', id: b.id, name: b.name, glb: b.model, target: b.target }))
  const components = catalog.listComponents().map(c => ({ type: 'component', id: c.id, name: c.name, glb: c.model, category: c.category }))
  return { ok: true, data: { boards, components } }
}

function recommendationCacheKey(goal: string, recommendationId: string): string {
  return `${recommendationGoalCachePrefix(goal)}${recommendationId}`
}

function recommendationGoalCachePrefix(goal: string): string {
  return `${goal}::`
}

async function handleRecommendParts(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
  const goal = String(args.goal ?? '').trim()
  if (!goal) return { ok: false, error: 'recommend_parts requires a non-empty goal.' }
  const recommendations = recommendParts(goal)
  if (ctx) {
    const prefix = recommendationGoalCachePrefix(goal)
    for (const key of ctx.recommendedParts.keys()) {
      if (key.startsWith(prefix)) ctx.recommendedParts.delete(key)
    }
    for (const rec of recommendations) ctx.recommendedParts.set(recommendationCacheKey(goal, rec.id), rec)
  }
  return { ok: true, data: { goal, recommendations } }
}

async function handleCreateDraftPart(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
  if (args.approved !== true) {
    return { ok: false, error: 'create_draft_part requires approved: true after explicit learner approval.' }
  }
  const goal = String(args.goal ?? '').trim()
  const recommendationId = String(args.recommendation_id ?? '').trim()
  if (!goal || !recommendationId) return { ok: false, error: 'goal and recommendation_id are required.' }
  const rec = ctx?.recommendedParts.get(recommendationCacheKey(goal, recommendationId))
  if (!rec) return { ok: false, error: `No recommendation "${recommendationId}" found for goal "${goal}". Call recommend_parts again.` }
  if (rec.source === 'local-catalog' && rec.catalogMatchId) {
    return { ok: true, data: { componentId: rec.catalogMatchId, skipped: 'already_in_catalog' } }
  }

  const component = draftComponentFromRecommendation(rec)
  const json = JSON.stringify(component, null, 2)
  let dir: string | null = null
  const api = typeof window !== 'undefined' ? window.espAI : undefined
  if (api?.writeComponentJson) {
    try {
      dir = await api.writeComponentJson(component.id, json)
      if (!dir) return { ok: false, error: 'Failed to persist component: writeComponentJson returned no destination.' }
    } catch (err) {
      return { ok: false, error: `Failed to persist component: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
  catalog.registerComponent(component)
  useStore.getState().bumpCatalog()
  return { ok: true, data: { componentId: component.id, savedTo: dir, catalogMeta: component.catalogMeta } }
}

async function handleAnalyzePartsPhoto(args: Record<string, any>): Promise<ToolResult> {
  const photoPath = String(args.photo_path ?? '').trim()
  let sourceText = String(args.codex_result ?? '').trim()
  const description = String(args.description ?? '').trim()

  if (photoPath) {
    const api = typeof window !== 'undefined' ? window.espAI : undefined
    if (!api?.analyzePartsPhoto) {
      return { ok: false, error: 'Photo analysis is only available inside the Electron app.' }
    }
    const result = await api.analyzePartsPhoto({ path: photoPath, notes: description, reasoningEffort: 'medium' })
    if (!result.ok) return { ok: false, error: result.error ?? 'Photo analysis failed.' }
    sourceText = result.text ?? ''
  }

  if (!sourceText && !description) {
    return { ok: false, error: 'Provide photo_path, codex_result, or description. Candidates are unconfirmed until the learner approves them.' }
  }

  const candidates = sourceText ? parsePhotoCandidates(sourceText) : candidatesFromDescription(description)
  return {
    ok: true,
    data: {
      candidates,
      nextStep: 'Ask the learner which candidates they actually have before creating inventory or projects.',
    },
  }
}

async function handleMatchPartsDatabase(args: Record<string, any>): Promise<ToolResult> {
  const query = String(args.query ?? '').trim()
  if (!query) return { ok: false, error: 'match_parts_database requires query.' }
  const part = lookupPartKnowledge(query)
  return { ok: true, data: { query, part } }
}

async function handleSearchPartsWeb(args: Record<string, any>): Promise<ToolResult> {
  const query = String(args.query ?? '').trim()
  if (!query) return { ok: false, error: 'search_parts_web requires query.' }
  const api = typeof window !== 'undefined' ? window.espAI : undefined
  if (!api?.exaPartSearch) {
    return { ok: false, error: 'Exa web search is only available inside the Electron app.' }
  }
  const response = await api.exaPartSearch(query)
  if (!response.ok) return { ok: false, error: response.error ?? 'Exa web search failed.' }
  const results = response.results ?? []
  const part = await lookupPartKnowledgeWithWeb(query, async () => results)
  return {
    ok: true,
    data: {
      query,
      results,
      part,
      reviewRequired: true,
      nextStep: 'Treat web-derived details as draft metadata. Ask for confirmation before adding a part or creating a project.',
    },
  }
}

async function handleSearchModelLibrary(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
  const query = String(args.query ?? '').trim()
  if (!query) return { ok: false, error: 'search_model_library requires query.' }
  const result = searchModelAssets(query, {
    licenseUse: args.bundled_only === true ? ['bundled-ok'] : undefined,
    formats: args.native_only === true ? ['glb', 'gltf'] : undefined,
  })
  const candidates = result.candidates.slice(0, 8)
  if (ctx) {
    for (const candidate of candidates) ctx.modelCandidates.set(candidate.id, candidate)
  }
  return {
    ok: true,
    data: {
      query,
      candidates,
      counts: result.counts,
      nextStep: 'Show source, license, format, and conversion need. Ask the learner before import_model_candidate.',
    },
  }
}

async function handleImportModelCandidate(args: Record<string, any>, ctx?: ExecContext): Promise<ToolResult> {
  if (args.approved !== true) {
    return { ok: false, error: 'import_model_candidate requires approved: true after explicit learner approval.' }
  }
  const candidateId = String(args.candidate_id ?? '').trim()
  if (!candidateId) return { ok: false, error: 'candidate_id is required.' }
  const candidate = ctx?.modelCandidates.get(candidateId) ?? modelAssetById(candidateId)
  if (!candidate) return { ok: false, error: `No model candidate "${candidateId}" found. Call search_model_library first.` }
  if (candidate.licenseUse === 'blocked') return { ok: false, error: 'This model candidate is blocked by license or payment requirements.' }
  const component = componentFromModelAsset(candidate)
  const componentJson = JSON.stringify(component, null, 2)
  const api = typeof window !== 'undefined' ? window.espAI : undefined
  if (!api?.installModelAsset) {
    return { ok: false, error: 'Model import is only available inside the Electron app.' }
  }
  const installed = await api.installModelAsset({ asset: candidate, componentJson, approved: true })
  if (!installed.ok) {
    return {
      ok: false,
      error: installed.error ?? 'Model import failed.',
    }
  }
  const parsed = JSON.parse(installed.componentJson ?? componentJson) as ComponentDef
  catalog.registerComponent(parsed, installed.modelData ?? null)
  useStore.getState().bumpCatalog()
  return {
    ok: true,
    data: {
      componentId: parsed.id,
      savedTo: installed.savedTo ?? null,
      conversionStatus: installed.conversionStatus,
      conversionLog: installed.conversionLog ?? [],
      catalogMeta: parsed.catalogMeta,
      nextStep: 'Open Catalog Editor and review scale, pins, source, and license before trusting this part.',
    },
  }
}

async function handleRecommendProjectsFromInventory(args: Record<string, any>): Promise<ToolResult> {
  const rawParts = Array.isArray(args.parts) ? args.parts : []
  const partNames = rawParts.map((part) => String(part ?? '').trim()).filter(Boolean)
  if (partNames.length === 0) {
    return { ok: false, error: 'recommend_projects_from_inventory requires at least one confirmed part name.' }
  }
  const parts = Array.from(new Map(partNames.map((part) => {
    const knowledge = lookupPartKnowledge(part)
    return [knowledge.id, knowledge] as const
  })).values())
  const novelty = args.novelty === 'higher' ? 'higher' : 'normal'
  const recommendations = recommendProjectsFromInventory(parts, { novelty }).slice(0, 5)
  return { ok: true, data: { parts, recommendations } }
}

async function handleCreateRecipeFromProject(args: Record<string, any>): Promise<ToolResult> {
  if (args.approved !== true) {
    return { ok: false, error: 'create_recipe_from_project requires approved: true after explicit learner approval.' }
  }
  const projectId = String(args.project_id ?? '').trim()
  if (!projectId) return { ok: false, error: 'project_id is required.' }
  const template = TEMPLATES.find((entry) => entry.id === projectId)
  if (!template) {
    return {
      ok: false,
      error: `No built-in template exists for "${projectId}" yet. Explain the missing parts and ask before drafting a custom project.`,
    }
  }
  const store = useStore.getState()
  store.loadProject(template.project)
  useStore.getState().startRecipe(template.recipe.id)
  const drc = runDrc(useStore.getState().project)
  return {
    ok: true,
    data: {
      projectId,
      templateTitle: template.title,
      drc: { errors: drc.errors.length, warnings: drc.warnings.length },
      nextStep: 'Walk the learner through the active recipe and resolve DRC warnings before build or flash.',
    },
  }
}

async function handleGetSceneContext(args: Record<string, any>): Promise<ToolResult> {
  const { project, selected } = useStore.getState()
  const autonomyTier = normalizeAutonomyTier(args.autonomy_tier)
  const physicalLayout = args.include_physical_layout === true
    ? createStarterLayoutFromProject(project)
    : undefined
  return {
    ok: true,
    data: {
      context: buildCodexSceneContext({ project, selected, physicalLayout, autonomyTier }),
      nextStep: 'Use scoped Circuitiny tools only; run validation after edits before claiming readiness.',
    },
  }
}

async function handleCheckAgentAction(args: Record<string, any>): Promise<ToolResult> {
  const action = normalizeAgentAction(args.action)
  if (!action) {
    return {
      ok: false,
      error: `Invalid action "${String(args.action ?? '')}". Valid actions: ${VALID_AGENT_ACTIONS.join(', ')}.`,
    }
  }
  const autonomyTier = normalizeAutonomyTier(args.autonomy_tier)
  return { ok: true, data: evaluateAgentActionPolicy(action, autonomyTier) }
}

async function handleRunPhysicalDrc(): Promise<ToolResult> {
  const { project } = useStore.getState()
  const layout = createStarterLayoutFromProject(project)
  const findings = runPhysicalDrc(layout, project)
  return {
    ok: true,
    data: {
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
      findings,
      physicalLayout: {
        placements: layout.placements.length,
        jumpers: layout.jumpers.length,
        template: layout.template.id,
      },
    },
  }
}

async function handleIdentifyPart(args: Record<string, any>): Promise<ToolResult> {
  const query = String(args.query ?? '').trim()
  if (!query) return { ok: false, error: 'identify_part requires query.' }
  const sources = normalizeDatasheetSources(args.sources)
  const identity = identifyPart(query, sources)
  return {
    ok: true,
    data: {
      identity,
      nextStep: identity.reviewRequired
        ? 'Review source, pinout, voltage, and companion parts before using this for hardware.'
        : 'Reviewed local metadata is available for normal Circuitiny use.',
    },
  }
}

async function handleRunRealityCheck(args: Record<string, any>): Promise<ToolResult> {
  const rawObservations = Array.isArray(args.observations) ? args.observations : []
  if (rawObservations.length === 0) return { ok: false, error: 'run_reality_check requires at least one observation.' }
  const invalidObservationIndex = rawObservations.findIndex((observation) =>
    !observation || typeof observation !== 'object' || Array.isArray(observation))
  if (invalidObservationIndex >= 0) {
    return { ok: false, error: `Observation ${invalidObservationIndex + 1} must be an object.` }
  }
  const invalidEndpointIndex = rawObservations.findIndex((observation) => {
    const endpoints = (observation as { endpoints?: unknown }).endpoints
    return Array.isArray(endpoints) && endpoints.length !== 0 && (endpoints.length !== 2 || !hasValidEndpointPair(endpoints))
  })
  if (invalidEndpointIndex >= 0) {
    return { ok: false, error: `Observation ${invalidEndpointIndex + 1} endpoints must contain exactly two endpoints in instance.pin format.` }
  }
  const project = useStore.getState().project
  const invalidComponentIndex = rawObservations.findIndex((observation) => {
    const componentInstance = (observation as { componentInstance?: unknown; component_instance?: unknown }).componentInstance
      ?? (observation as { component_instance?: unknown }).component_instance
    return typeof componentInstance === 'string' &&
      (!isComponentInstanceRef(componentInstance) || !project.components.some((component) => component.instance === componentInstance))
  })
  if (invalidComponentIndex >= 0) {
    return { ok: false, error: `Observation ${invalidComponentIndex + 1} componentInstance must be a valid existing project component instance.` }
  }
  const observations = rawObservations.map(normalizeRealityObservation)
  const session = createRealityCheckSession(normalizeRealityImageSource(args.session_type), {
    cameraGranted: args.camera_granted === true,
    imageStorageAllowed: args.image_storage_allowed === true,
    aiVisionAllowed: args.ai_vision_approved === true,
  }, observations)
  const drcResult = runDrc(project)
  const analyzed = analyzeRealityCheck(project, session, drcResult)
  return {
    ok: true,
    data: {
      session: analyzed,
      readiness: realityReadiness(analyzed.findings),
    },
  }
}

async function handleGetAgentActionHistory(): Promise<ToolResult> {
  return { ok: true, data: { sessions: listAgentActionSessions() } satisfies AgentActionHistoryResult }
}

async function handleRollbackLastAgentAction(): Promise<ToolResult> {
  const store = useStore.getState()
  const before = store.project
  store.undo()
  const after = useStore.getState().project
  if (after === before) return { ok: false, error: 'No project history is available to rollback.' }
  return {
    ok: true,
    data: {
      project: after.name,
      changedObjects: changedObjectsBetween(before, after),
    },
  }
}

function normalizeRealityImageSource(value: unknown): 'camera' | 'photo' {
  if (value === 'camera') return 'camera'
  if (value === 'photo') return 'photo'
  console.warn('Unexpected Reality Check image source; defaulting to photo.', { value })
  return 'photo'
}

const ACTION_BY_TOOL: Partial<Record<string, AgentActionKind>> = {
  add_component: 'add-part',
  place_part: 'place-part',
  move_part: 'move-part',
  remove_component: 'delete-item',
  remove_behavior: 'delete-item',
  remove_net: 'delete-item',
  delete_item: 'delete-item',
  connect: 'connect',
  connect_pins: 'connect',
  connect_breadboard_holes: 'connect-breadboard',
  set_behavior: 'behavior-change',
  blink: 'behavior-change',
  set_on_boot: 'behavior-change',
  on_button_press: 'behavior-change',
  write_firmware: 'code-change',
  create_draft_part: 'catalog-import',
  import_model_candidate: 'catalog-import',
}

function recordSuccessfulAction(name: string, result: ToolResult, beforeProject: Project): void {
  if (!result.ok) return
  const action = ACTION_BY_TOOL[name]
  if (!action) return
  const afterProject = useStore.getState().project
  const changedObjects = changedObjectsBetween(beforeProject, afterProject)
  recordAgentActionSession({
    tool: name,
    action,
    changedObjects,
    validationResults: validationResultsForAction(action, afterProject),
    beginnerSummary: changedObjects.length > 0
      ? `${name} changed ${changedObjects.length} project item${changedObjects.length === 1 ? '' : 's'}.`
      : `${name} returned guidance without changing the saved project.`,
  })
}

function validationResultsForAction(action: AgentActionKind, project: Project): Record<string, boolean | { ok: boolean; artifacts?: string[]; files?: string[]; outputIds?: string[] }> {
  const results: Record<string, boolean | { ok: boolean; artifacts?: string[]; files?: string[]; outputIds?: string[] }> = {}
  for (const validation of validationForAction(action)) {
    if (validation === 'drc') {
      const drc = runDrc(project)
      results[validation] = { ok: drc.errors.length === 0, artifacts: [...drc.errors, ...drc.warnings].map((finding) => finding.id) }
    } else if (validation === 'physical-drc') {
      const findings = runPhysicalDrc(createStarterLayoutFromProject(project), project)
      results[validation] = { ok: findings.every((finding) => finding.severity !== 'error'), artifacts: findings.map((finding) => finding.id) }
    } else if (validation === 'code-inspection') {
      const files = Object.keys(project.customCode ?? {})
      results[validation] = { ok: files.length > 0, files }
    } else if (validation === 'source-license-review' || validation === 'catalog-draft-review') {
      results[validation] = true
    } else {
      results[validation] = false
    }
  }
  return results
}

function changedObjectsBetween(before: Project, after: Project): string[] {
  const changes: string[] = []
  const beforeComponents = new Map(before.components.map((component) => [component.instance, JSON.stringify(component)]))
  const afterComponents = new Map(after.components.map((component) => [component.instance, JSON.stringify(component)]))
  for (const [instance, component] of afterComponents) {
    const previous = beforeComponents.get(instance)
    if (!previous) changes.push(`component:${instance}`)
    else if (previous !== component) changes.push(`component:${instance}`)
  }
  for (const instance of beforeComponents.keys()) {
    if (!afterComponents.has(instance)) changes.push(`component:${instance}`)
  }

  const beforeNets = new Map(before.nets.map((net) => [net.id, JSON.stringify(net)]))
  const afterNets = new Map(after.nets.map((net) => [net.id, JSON.stringify(net)]))
  for (const [id, net] of afterNets) {
    const previous = beforeNets.get(id)
    if (!previous || previous !== net) changes.push(`net:${id}`)
  }
  for (const id of beforeNets.keys()) {
    if (!afterNets.has(id)) changes.push(`net:${id}`)
  }

  const beforeBehaviors = new Map(before.behaviors.map((behavior) => [behavior.id, JSON.stringify(behavior)]))
  const afterBehaviors = new Map(after.behaviors.map((behavior) => [behavior.id, JSON.stringify(behavior)]))
  for (const [id, behavior] of afterBehaviors) {
    const previous = beforeBehaviors.get(id)
    if (!previous || previous !== behavior) changes.push(`behavior:${id}`)
  }
  for (const id of beforeBehaviors.keys()) {
    if (!afterBehaviors.has(id)) changes.push(`behavior:${id}`)
  }

  const beforeFiles = before.customCode ?? {}
  const afterFiles = after.customCode ?? {}
  for (const file of new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)])) {
    if (beforeFiles[file] !== afterFiles[file]) changes.push(`code:${file}`)
  }
  return changes
}

function normalizePosition(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null
  const position = value.map(Number)
  return position.every(Number.isFinite) ? position as [number, number, number] : null
}

function draftComponentFromRecommendation(rec: ReturnType<typeof recommendParts>[number]): ComponentDef {
  const pinReviewNotes: string[] = []
  const pins = rec.importantPins.map((p, i) => ({
    id: p.id,
    label: p.label,
    type: normalizeDraftPinType(p.type, rec.id, pinReviewNotes),
    position: [
      (i - (rec.importantPins.length - 1) / 2) * DRAFT_PIN_HORIZONTAL_SPACING_M,
      DRAFT_PIN_Y_OFFSET_M,
      0,
    ] as [number, number, number],
    normal: [0, -1, 0] as [number, number, number],
  }))
  const reviewNotes = [
    `Draft created from goal: ${rec.beginnerBuild}`,
    'Review pin labels, voltage, and render before promoting.',
    'No 3D model assigned; add a GLB file in Catalog Editor for visualization.',
    ...(pins.length === 0 ? ['No pins detected; verify the part pinout before wiring.'] : []),
    ...pinReviewNotes,
  ]
  return {
    id: rec.id,
    name: rec.label,
    version: '0.1.0',
    category: categoryFromFamily(rec.family),
    model: '',
    scale: 1,
    pins,
    schematic: { symbol: symbolFromFamily(rec.family) },
    catalogMeta: {
      trust: 'ai-draft',
      confidence: rec.confidence,
      sourceUrls: rec.sourceLinks,
      retrievedAt: new Date().toISOString(),
      renderStrategy: rec.renderStrategy,
      reviewNotes,
    },
    docs: {
      notes: [
        rec.explanation,
        rec.voltageCaution,
        rec.currentCaution,
      ].filter(Boolean).join(' '),
    },
  }
}

function normalizeDraftPinType(type: string, componentId: string, reviewNotes: string[]): PinType {
  if (VALID_DRAFT_PIN_TYPES.has(type as PinType)) return type as PinType
  reviewNotes.push(`Pin type "${type}" on ${componentId} was normalized to digital_io; verify against the datasheet.`)
  return 'digital_io'
}

function categoryFromFamily(family: string): ComponentDef['category'] {
  const f = family.toLowerCase().trim()
  if (f.includes('display')) return 'display'
  if (f.includes('sensor')) return 'sensor'
  if (f.includes('input')) return 'input'
  if (f.includes('indicator')) return 'actuator'
  return 'misc'
}

function symbolFromFamily(family: string): SchematicSymbol {
  const f = family.toLowerCase().trim()
  if (f.includes('display')) return 'display'
  if (f.includes('sensor')) return 'sensor'
  if (f.includes('input')) return 'button'
  if (f.includes('indicator')) return 'led'
  return 'generic-rect'
}

const HANDLERS: Record<string, Handler> = {
  get_project:      () => handleGetProject(),
  list_catalog:     () => handleListCatalog(),
  add_component:    (args) => handleAddComponent(args),
  remove_component: (args) => handleRemoveComponent(args),
  remove_net:       (args) => handleRemoveNet(args),
  connect:          (args) => handleConnect(args),
  connect_pins:     (args) => handleConnect(args),
  place_part:       (args) => handlePlacePart(args),
  move_part:        (args) => handlePlacePart(args),
  connect_breadboard_holes: (args) => handleConnectBreadboardHoles(args),
  delete_item:      (args) => handleDeleteItem(args),
  search_catalog:   (args) => handleSearchCatalog(args),
  run_drc:          () => handleRunDrc(),
  read_firmware:    (args) => handleReadFirmware(args),
  write_firmware:   (args) => handleWriteFirmware(args),
  set_behavior:     (args) => handleSetBehavior(args),
  blink:            (args) => handleBlink(args),
  set_on_boot:      (args) => handleSetOnBoot(args),
  on_button_press:  (args) => handleOnButtonPress(args),
  remove_behavior:  (args) => handleRemoveBehavior(args),
  save_project:     () => handleSaveProject(),
  think:            () => Promise.resolve({ ok: true, data: { logged: true } }),
  fetch_url:        (args, ctx) => handleFetchUrl(args, ctx),
  list_glb_models:  () => handleListGlbModels(),
  app_snapshot:     () => handleAppSnapshot(),
  app_click:        (args) => handleAppClick(args),
  app_type:         (args) => handleAppType(args),
  app_press_key:    (args) => handleAppPressKey(args),
  plan_circuit:     (args) => handlePlanCircuit(args),
  recommend_parts:  (args, ctx) => handleRecommendParts(args, ctx),
  create_draft_part:(args, ctx) => handleCreateDraftPart(args, ctx),
  analyze_parts_photo: (args) => handleAnalyzePartsPhoto(args),
  match_parts_database: (args) => handleMatchPartsDatabase(args),
  search_parts_web: (args) => handleSearchPartsWeb(args),
  search_model_library: (args, ctx) => handleSearchModelLibrary(args, ctx),
  import_model_candidate: (args, ctx) => handleImportModelCandidate(args, ctx),
  recommend_projects_from_inventory: (args) => handleRecommendProjectsFromInventory(args),
  create_recipe_from_project: (args) => handleCreateRecipeFromProject(args),
  get_scene_context: (args) => handleGetSceneContext(args),
  check_agent_action: (args) => handleCheckAgentAction(args),
  run_physical_drc: () => handleRunPhysicalDrc(),
  identify_part: (args) => handleIdentifyPart(args),
  run_reality_check: (args) => handleRunRealityCheck(args),
  get_agent_action_history: () => handleGetAgentActionHistory(),
  rollback_last_agent_action: () => handleRollbackLastAgentAction(),
}

async function executeInternal(
  name: string,
  args: Record<string, any>,
  ctx?: ExecContext
): Promise<ToolResult> {
  const handler = HANDLERS[name]
  if (!handler) return { ok: false, error: `unknown tool: ${name}` }
  try {
    return await handler(args, ctx)
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

function normalizeAutonomyTier(value: unknown): CodexAutonomyTier {
  if (value === 'explain-only' || value === 'draft-edit' || value === 'guided-edit' || value === 'hardware-gated') {
    return value
  }
  return 'guided-edit'
}

const VALID_AGENT_ACTIONS = [
  'inspect',
  'add-part',
  'place-part',
  'move-part',
  'delete-item',
  'connect',
  'connect-breadboard',
  'behavior-change',
  'code-change',
  'catalog-import',
  'camera-analysis',
  'build',
  'flash',
  'monitor',
] as const satisfies readonly AgentActionKind[]

type AssertNoMissingAgentActions<T extends never> = T
type _MissingAgentActions = AssertNoMissingAgentActions<Exclude<AgentActionKind, typeof VALID_AGENT_ACTIONS[number]>>

function normalizeAgentAction(value: unknown): AgentActionKind | null {
  if (typeof value !== 'string') return null
  return (VALID_AGENT_ACTIONS as readonly string[]).includes(value) ? value as AgentActionKind : null
}

function normalizeRealityObservation(value: unknown, index: number): RealityObservation {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const normalized = {
    componentInstance: record.componentInstance ?? record.component_instance,
    confidence: record.confidence ?? record.confidence_level,
    notes: record.notes ?? record.note_text,
    polarityReversed: record.polarityReversed ?? record.polarity_reversed,
  }
  const rawEndpoints = Array.isArray(record.endpoints) ? record.endpoints.map((endpoint) => String(endpoint)) : []
  const endpoints = rawEndpoints.length === 2 && isPinRef(rawEndpoints[0]) && isPinRef(rawEndpoints[1])
    ? [rawEndpoints[0], rawEndpoints[1]] as [string, string]
    : undefined
  return {
    id: String(record.id ?? `obs-${index + 1}`),
    kind: normalizeObservationKind(record.kind),
    label: String(record.label ?? `Observation ${index + 1}`),
    ...(endpoints ? { endpoints } : {}),
    ...(typeof normalized.componentInstance === 'string' ? { componentInstance: normalized.componentInstance } : {}),
    ...(normalized.polarityReversed === true ? { polarityReversed: true } : {}),
    confidence: normalizeObservationConfidence(normalized.confidence ?? 'low'),
    ...(typeof normalized.notes === 'string' ? { notes: normalized.notes } : {}),
  }
}

function isPinRef(value: string): boolean {
  const parts = value.trim().split('.')
  const owner = parts[0]?.trim() ?? ''
  const pin = parts[1]?.trim() ?? ''
  const ownerPart = /^[A-Za-z](?:[A-Za-z0-9]|[-_](?=[A-Za-z0-9]))*$/
  // Pin IDs may start with digits for board rails such as board.3v3.
  const pinPart = /^[A-Za-z0-9](?:[A-Za-z0-9]|[-_](?=[A-Za-z0-9]))*$/
  return parts.length === 2 &&
    owner.length >= 1 &&
    owner.length <= 64 &&
    pin.length >= 1 &&
    pin.length <= 64 &&
    ownerPart.test(owner) &&
    pinPart.test(pin)
}

function isComponentInstanceRef(value: string): boolean {
  return /^[A-Za-z](?:[A-Za-z0-9]|[-_](?=[A-Za-z0-9]))*$/.test(value.trim())
}

function hasValidEndpointPair(endpoints: unknown[]): boolean {
  return endpoints.length >= 2 &&
    typeof endpoints[0] === 'string' &&
    typeof endpoints[1] === 'string' &&
    isPinRef(endpoints[0]) &&
    isPinRef(endpoints[1])
}

function normalizeDatasheetSources(value: unknown): DatasheetSource[] {
  if (!Array.isArray(value)) return []
  return value
    .map((source): DatasheetSource | null => {
      if (!source || typeof source !== 'object') return null
      const record = source as Record<string, unknown>
      const url = typeof record.url === 'string' ? record.url.trim() : ''
      const title = typeof record.title === 'string' ? record.title.trim() : ''
      const retrievedAt = typeof record.retrievedAt === 'string' ? record.retrievedAt.trim() : ''
      const licenseNote = typeof record.licenseNote === 'string' ? record.licenseNote.trim() : ''
      if (!url || !title || !retrievedAt || !licenseNote) return null
      return {
        url,
        title,
        retrievedAt,
        licenseNote,
        ...(typeof record.vendor === 'string' && record.vendor.trim() ? { vendor: record.vendor.trim() } : {}),
        ...(typeof record.checksum === 'string' && record.checksum.trim() ? { checksum: record.checksum.trim() } : {}),
        ...(typeof record.text === 'string' ? { text: record.text } : {}),
      }
    })
    .filter((source): source is DatasheetSource => !!source)
}

function normalizeObservationKind(value: unknown): RealityObservation['kind'] {
  if (value === 'wire' || value === 'part' || value === 'polarity' || value === 'rail' || value === 'unknown') return value
  return 'unknown'
}

function normalizeObservationConfidence(value: unknown): RealityObservation['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'low'
}
