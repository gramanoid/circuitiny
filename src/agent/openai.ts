// OpenAI-compatible chat client (works for OpenAI and OpenRouter).
// Streams SSE chunks; iterates tool calls until the model stops.

import { tools, execTool, makeExecContext } from './tools'
import type { Msg, AgentCallbacks, ProviderConfig } from './types'

export async function chatOpenAI(
  conv: Msg[],
  cfg: ProviderConfig,
  cb: AgentCallbacks
): Promise<void> {
  const baseUrl = cfg.baseUrl ?? 'https://api.openai.com/v1'
  const maxLoops = cfg.maxToolLoops ?? 16
  const signal = cfg.signal
  const execCtx = makeExecContext(signal)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey ?? ''}`,
  }
  if (cfg.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://circuitiny.app'
    headers['X-Title'] = 'Circuitiny'
  }

  for (let loop = 0; loop < maxLoops; loop++) {
    if (signal?.aborted) { cb.onError('aborted'); return }
    let resp: Response
    try {
      const request = {
        model: cfg.model,
        messages: conv,
        tools,
        tool_choice: 'auto',
        ...openAiChatCompletionsReasoningPayload(cfg),
        stream: true,
      }
      resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal,
      })
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') { cb.onError('aborted'); return }
      cb.onError(`${cfg.provider} fetch error: ${e?.message ?? String(e)}`)
      return
    }
    if (!resp.ok || !resp.body) {
      cb.onError(`${cfg.provider} error ${resp.status}: ${await resp.text().catch(() => '')}`)
      return
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let acc = ''
    const toolCallAccum: Record<number, { id: string; name: string; args: string }> = {}

    try {
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
        if (payload === '[DONE]') break outer
        let chunk: any
        try { chunk = JSON.parse(payload) } catch { continue }
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        if (delta.content) { acc += delta.content; cb.onToken(delta.content) }
        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index ?? 0
          if (!toolCallAccum[idx]) toolCallAccum[idx] = { id: '', name: '', args: '' }
          if (tc.id)                toolCallAccum[idx].id   += tc.id
          if (tc.function?.name)    toolCallAccum[idx].name += tc.function.name
          if (tc.function?.arguments) toolCallAccum[idx].args += tc.function.arguments
        }
      }
    }
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') { cb.onError('aborted'); return }
      cb.onError(`${cfg.provider} stream error: ${e?.message ?? String(e)}`)
      return
    }

    const toolCalls = Object.values(toolCallAccum).length > 0
      ? Object.values(toolCallAccum).map((tc) => ({
          id: tc.id,
          function: { name: tc.name, arguments: safeJson(tc.args) },
        }))
      : undefined

    const msg: Msg = { role: 'assistant', content: acc, ...(toolCalls ? { tool_calls: toolCalls } : {}) }
    conv.push(msg)
    cb.onMessage(msg)

    if (!toolCalls?.length) return

    for (const call of toolCalls) {
      if (signal?.aborted) { cb.onError('aborted'); return }
      const name = call.function.name
      const args = call.function.arguments ?? {}
      const result = await execTool(name, args, execCtx)
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

function openAiChatCompletionsReasoningPayload(cfg: ProviderConfig): { reasoning_effort?: string } {
  if (cfg.provider !== 'openai') return {}
  const effort = cfg.reasoningEffort ?? defaultOpenAiReasoningEffort(cfg.model)
  const reasoningEffort = supportedOpenAiReasoningEffort(cfg.model, effort)
  return reasoningEffort ? { reasoning_effort: reasoningEffort } : {}
}

function supportsOpenAiReasoning(model: string): boolean {
  return GPT5_MODEL_PATTERN.test(model)
}

const GPT5_MODEL_PATTERN = /^gpt-5(?:$|[.-][a-z0-9][a-z0-9.-]*$)/

// Update when OpenAI releases models with different reasoning effort support.
const MODEL_REASONING_OVERRIDES: Record<string, Partial<Record<NonNullable<ProviderConfig['reasoningEffort']>, string>>> = {
  // gpt-5-pro always uses high reasoning in this UI; all visible effort choices
  // collapse to the only supported request value.
  'gpt-5-pro': {
    none: 'high',
    minimal: 'high',
    low: 'high',
    medium: 'high',
    high: 'high',
    xhigh: 'high',
  },
  'gpt-5.1': {
    none: 'none',
    minimal: 'low',
  },
}

function defaultOpenAiReasoningEffort(model: string): NonNullable<ProviderConfig['reasoningEffort']> {
  const normalized = model.trim().toLowerCase()
  if (normalized.startsWith('gpt-5-pro')) return 'high'
  if (normalized.startsWith('gpt-5.1')) return 'none'
  return 'medium'
}

function supportedOpenAiReasoningEffort(model: string, effort: NonNullable<ProviderConfig['reasoningEffort']>): string | undefined {
  const normalized = model.trim().toLowerCase()
  if (!supportsOpenAiReasoning(normalized)) return undefined
  // Precedence: codex-max xhigh passthrough, exact MODEL_REASONING_OVERRIDES,
  // longest-prefix family overrides, legacy none/minimal fallbacks, then defaults.
  const isGpt51 = normalized.startsWith('gpt-5.1')
  if (isGpt51 && !normalized.startsWith('gpt-5.1-codex-max') && effort === 'xhigh') {
    return 'high'
  }
  const exactOverride = MODEL_REASONING_OVERRIDES[normalized]?.[effort]
  if (exactOverride) return exactOverride
  // Longest prefix lets one override cover variants such as gpt-5-pro-preview
  // while more specific keys still beat general model-family keys.
  const override = Object.entries(MODEL_REASONING_OVERRIDES)
    .filter(([key]) => normalized.startsWith(key))
    .sort(([a], [b]) => b.length - a.length)[0]?.[1]?.[effort]
  if (override) return override
  // ChatPane migrates legacy none/minimal values for current users; keep these
  // provider-level fallbacks for older saved configs and direct API callers.
  if (effort === 'none') return isGpt51 ? 'none' : 'low'
  if (effort === 'minimal') return isGpt51 ? 'low' : 'minimal'
  if (effort === 'xhigh') return 'high'
  return effort
}

// Matches gpt-5 plus dot/dash variants such as gpt-5-pro, gpt-5.1, and gpt-5.1-preview.
// Future OpenAI naming changes may require revisiting the separator and suffix rules.
function isGpt5Model(model: string): boolean {
  return supportsOpenAiReasoning(model.trim().toLowerCase())
}
