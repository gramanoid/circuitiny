// Unified chat entry point. Routes to the correct provider client based on cfg.provider.

import type { Msg, AgentCallbacks, ProviderConfig } from './types'
import { chatAnthropic } from './anthropic'
import { chatOpenAI } from './openai'
import { chat as chatOllama } from './ollama'

export const SYSTEM = `You are an ESP32 design copilot for hobbyists. The user has a 3D board viewer.
You manipulate the project by calling tools — never describe code or pin assignments in prose when you could just call the tool.

Workflow rule: when asked to add parts or wire things, call list_catalog first if you haven't yet, then add_component, then connect using exact pin refs like "led1.anode" and "board.gpio4".
After wiring changes, call run_drc to verify. Keep replies to the user short and focused.

Electronics safety rules — apply these automatically without waiting for the user to ask:
- LED (any colour): always add a current-limiting resistor (220 Ω–470 Ω for 3.3 V GPIO) in series between the GPIO and the anode. Wire: board.gpioX → resistor.in → resistor.out → led.anode → led.cathode → board.GND.
- Buzzer (passive): needs a flyback / current-limiting resistor (~100 Ω) in series if driven directly from a GPIO.
- Button / tactile switch: add a pull-up or pull-down resistor (10 kΩ) unless the board pin already has one configured.
- I²C bus: add 4.7 kΩ pull-up resistors on SDA and SCL if no other component on the net already provides them.
- Crystal / oscillator: add the specified load capacitors (usually 2 × 22 pF) to GND on each leg.
- Any inductive load (motor, relay coil): add a flyback diode across the coil, cathode toward the supply rail.

When you are about to add a component that needs a companion part, add the companion first, then wire everything together in the correct order. Tell the user briefly what you added and why.`

export async function chat(
  history: Msg[],
  userMessage: string,
  cb: AgentCallbacks,
  cfg: ProviderConfig
): Promise<Msg[]> {
  const conv: Msg[] = [
    ...(history.length === 0 ? [{ role: 'system' as const, content: SYSTEM }] : []),
    ...history,
    { role: 'user', content: userMessage },
  ]
  cb.onMessage({ role: 'user', content: userMessage })

  switch (cfg.provider) {
    case 'anthropic':
      await chatAnthropic(conv, cfg, cb)
      break
    case 'openai':
    case 'openrouter':
      await chatOpenAI(conv, cfg, cb)
      break
    case 'ollama':
    default:
      await chatOllama(history, userMessage, cb, { model: cfg.model, host: cfg.baseUrl, maxToolLoops: cfg.maxToolLoops })
      return conv  // ollama manages its own conv copy
  }

  return conv
}
