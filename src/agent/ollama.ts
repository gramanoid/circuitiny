// Thin Ollama client that runs a tool-using chat loop.
// Uses POST /api/chat; iterates while the model returns tool_calls.

import { tools, execTool } from './tools'
import type { Msg, AgentCallbacks } from './types'

export type { Msg, AgentCallbacks }

export async function chat(
  history: Msg[],
  userMessage: string,
  cb: AgentCallbacks,
  opts: { model?: string; host?: string; maxToolLoops?: number } = {}
): Promise<Msg[]> {
  const model = opts.model ?? 'qwen3.5:latest'
  const host = opts.host ?? 'http://localhost:11434'
  const maxLoops = opts.maxToolLoops ?? 16

  // conv is managed by the caller (chat.ts) for non-ollama providers;
  // ollama manages it here because the system message was historically added here.
  const conv: Msg[] = [...history, { role: 'user', content: userMessage }]
  cb.onMessage({ role: 'user', content: userMessage })

  for (let loop = 0; loop < maxLoops; loop++) {
    const resp = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: conv, tools, stream: true })
    })
    if (!resp.ok || !resp.body) {
      cb.onError(`Ollama error ${resp.status}: ${await resp.text().catch(() => '')}`)
      return conv
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let acc = ''
    let toolCalls: Msg['tool_calls'] | undefined

    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let chunk: any
        try { chunk = JSON.parse(line) } catch { continue }
        const m = chunk.message as Msg | undefined
        if (m?.content) { acc += m.content; cb.onToken(m.content) }
        if (m?.tool_calls?.length) toolCalls = m.tool_calls
        if (chunk.done) break outer
      }
    }

    const msg: Msg = { role: 'assistant', content: acc, ...(toolCalls ? { tool_calls: toolCalls } : {}) }
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
      const toolMsg: Msg = { role: 'tool', tool_name: name, name, tool_call_id: call.id, content: JSON.stringify(result) }
      conv.push(toolMsg)
      cb.onMessage(toolMsg)
    }
  }
  cb.onError(`Max tool loops (${maxLoops}) reached`)
  return conv
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return {} } }
