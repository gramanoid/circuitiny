// Thin Ollama client that runs a tool-using chat loop.
// Uses POST /api/chat; iterates while the model returns tool_calls.

import { tools, execTool } from './tools'

export interface Msg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id?: string; function: { name: string; arguments: any } }>
  tool_name?: string
  tool_call_id?: string
  name?: string
}

export interface AgentCallbacks {
  onMessage: (m: Msg) => void
  onToolCall: (name: string, args: any, result: any) => void
  onError: (err: string) => void
}

const SYSTEM = `You are an ESP32 design copilot for hobbyists. The user has a 3D board viewer.
You manipulate the project by calling tools — never describe code or pin assignments in prose when you could just call the tool.

Workflow rule: when asked to add parts or wire things, call list_catalog first if you haven't yet, then add_component, then connect using exact pin refs like "led1.anode" and "board.gpio4".
After wiring changes, call run_drc to verify. Keep replies to the user short and focused.`

export async function chat(
  history: Msg[],
  userMessage: string,
  cb: AgentCallbacks,
  opts: { model?: string; host?: string; maxToolLoops?: number } = {}
): Promise<Msg[]> {
  const model = opts.model ?? 'qwen3.5:latest'
  const host = opts.host ?? 'http://localhost:11434'
  const maxLoops = opts.maxToolLoops ?? 6

  const conv: Msg[] = [
    ...(history.length === 0 ? [{ role: 'system' as const, content: SYSTEM }] : []),
    ...history,
    { role: 'user', content: userMessage }
  ]
  cb.onMessage({ role: 'user', content: userMessage })

  for (let loop = 0; loop < maxLoops; loop++) {
    const resp = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: conv, tools, stream: false })
    })
    if (!resp.ok) { cb.onError(`Ollama error ${resp.status}: ${await resp.text()}`); return conv }
    const data = await resp.json()
    const msg = data.message as Msg
    conv.push(msg)
    cb.onMessage(msg)

    const calls = msg.tool_calls ?? []
    if (calls.length === 0) return conv

    for (const call of calls) {
      const name = call.function.name
      const args = typeof call.function.arguments === 'string'
        ? safeJson(call.function.arguments)
        : call.function.arguments ?? {}
      const result = await execTool(name, args)
      cb.onToolCall(name, args, result)
      const toolMsg: Msg = {
        role: 'tool',
        tool_name: name,
        name,
        tool_call_id: call.id,
        content: JSON.stringify(result)
      }
      conv.push(toolMsg)
      cb.onMessage(toolMsg)
    }
  }
  cb.onError(`Max tool loops (${maxLoops}) reached`)
  return conv
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return {} } }
