// Anthropic Messages API client with tool use and streaming.
// Tool schema differs from OpenAI: uses `input_schema` instead of `parameters`,
// and tool results are `user` messages with a `tool_result` content block.

import { tools, execTool } from './tools'
import type { Msg, AgentCallbacks, ProviderConfig } from './types'

// Convert our OpenAI-format tool list to Anthropic format.
const anthropicTools = tools.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}))

// Convert the shared Msg[] conversation to Anthropic's messages array.
// System messages become the top-level `system` field; tool results become
// user messages with content blocks.
function toAnthropicMessages(conv: Msg[]): { system: string; messages: any[] } {
  let system = ''
  const messages: any[] = []

  for (const m of conv) {
    if (m.role === 'system') { system = m.content; continue }

    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content })
      continue
    }

    if (m.role === 'tool') {
      // Anthropic tool results are user messages with a tool_result block.
      const last = messages[messages.length - 1]
      const block = { type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: m.content }
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block)
      } else {
        messages.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        // Assistant message with tool_use blocks.
        const content: any[] = []
        if (m.content) content.push({ type: 'text', text: m.content })
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id ?? '',
            name: tc.function.name,
            input: typeof tc.function.arguments === 'string'
              ? safeJson(tc.function.arguments)
              : tc.function.arguments ?? {},
          })
        }
        messages.push({ role: 'assistant', content })
      } else {
        messages.push({ role: 'assistant', content: m.content })
      }
    }
  }
  return { system, messages }
}

export async function chatAnthropic(
  conv: Msg[],
  cfg: ProviderConfig,
  cb: AgentCallbacks
): Promise<void> {
  const baseUrl = cfg.baseUrl ?? 'https://api.anthropic.com'
  const maxLoops = cfg.maxToolLoops ?? 16

  for (let loop = 0; loop < maxLoops; loop++) {
    const { system, messages } = toAnthropicMessages(conv)

    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4096,
        system: system || undefined,
        messages,
        tools: anthropicTools,
        stream: true,
      }),
    })
    if (!resp.ok || !resp.body) {
      cb.onError(`Anthropic error ${resp.status}: ${await resp.text().catch(() => '')}`)
      return
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let acc = ''
    // Map block index → partial tool_use data
    const toolBlocks: Record<number, { id: string; name: string; args: string }> = {}

    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        let ev: any
        try { ev = JSON.parse(payload) } catch { continue }

        if (ev.type === 'content_block_start') {
          const blk = ev.content_block
          if (blk.type === 'tool_use') {
            toolBlocks[ev.index] = { id: blk.id, name: blk.name, args: '' }
          }
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta
          if (d.type === 'text_delta') {
            acc += d.text; cb.onToken(d.text)
          } else if (d.type === 'input_json_delta' && toolBlocks[ev.index]) {
            toolBlocks[ev.index].args += d.partial_json
          }
        } else if (ev.type === 'message_stop') {
          break outer
        }
      }
    }

    const toolCalls = Object.values(toolBlocks).length > 0
      ? Object.values(toolBlocks).map((tb) => ({
          id: tb.id,
          function: { name: tb.name, arguments: safeJson(tb.args) },
        }))
      : undefined

    const msg: Msg = { role: 'assistant', content: acc, ...(toolCalls ? { tool_calls: toolCalls } : {}) }
    conv.push(msg)
    cb.onMessage(msg)

    if (!toolCalls?.length) return

    for (const call of toolCalls) {
      const name = call.function.name
      const args = call.function.arguments ?? {}
      const result = await execTool(name, args)
      cb.onToolCall(name, args, result)
      const toolMsg: Msg = {
        role: 'tool', tool_name: name, name, tool_call_id: call.id,
        content: JSON.stringify(result),
      }
      conv.push(toolMsg)
      cb.onMessage(toolMsg)
    }
  }
  cb.onError(`Max tool loops (${cfg.maxToolLoops ?? 16}) reached`)
}

function safeJson(s: string) { try { return JSON.parse(s) } catch { return {} } }
