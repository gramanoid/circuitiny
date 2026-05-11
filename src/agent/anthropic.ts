// Anthropic Messages API client with tool use and streaming.
// Tool schema differs from OpenAI: uses `input_schema` instead of `parameters`,
// and tool results are `user` messages with a `tool_result` content block.

import { tools, execTool, makeExecContext } from './tools'
import type { Msg, AgentCallbacks, ProviderConfig } from './types'

// Convert our OpenAI-format tool list to Anthropic format.
// Mark the last tool with cache_control so the entire tool list is cached.
const anthropicTools = tools.map((t, i) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
  ...(i === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
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
  const signal = cfg.signal
  const execCtx = makeExecContext(signal)

  for (let loop = 0; loop < maxLoops; loop++) {
    if (signal?.aborted) { cb.onError('aborted'); return }
    const { system, messages } = toAnthropicMessages(conv)
    const effectiveMaxTokens = cfg.max_tokens ?? 8192

    let resp: Response
    try {
      resp = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey ?? '',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: effectiveMaxTokens,
          system: system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : undefined,
          messages,
          tools: anthropicTools,
          ...anthropicReasoningPayload(cfg, effectiveMaxTokens),
          stream: true,
        }),
        signal,
      })
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') { cb.onError('aborted'); return }
      cb.onError(`Anthropic fetch error: ${e?.message ?? String(e)}`)
      return
    }
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
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') { cb.onError('aborted'); return }
      cb.onError(`Anthropic stream error: ${e?.message ?? String(e)}`)
      return
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

// Expected Anthropic model formats include family names (sonnet/opus/haiku),
// numeric versions in both family-first and version-first order, optional date
// suffixes, and preview/research tags. anthropicThinkingPatternsForTest keeps
// those naming boundaries covered by regression tests as new models appear.
const CLAUDE_THINKING_FAMILIES = ['haiku', 'sonnet', 'opus'] as const
const CLAUDE_THINKING_FAMILY_PATTERN = `(?:${CLAUDE_THINKING_FAMILIES.join('|')})`
const CLAUDE_37_SONNET_PATTERN = /^(?:claude-3-7-sonnet|claude-sonnet-3-7)(?:-(?:\d{8}|latest))?$/i
const CLAUDE_4_THINKING_PATTERN = new RegExp(String.raw`^claude-(?:(?:${CLAUDE_THINKING_FAMILY_PATTERN}-4(?:-\d{1,2})?)|(?:4(?:-\d{1,2})?-${CLAUDE_THINKING_FAMILY_PATTERN}))(?:-\d{8})?(?:-(?:preview|research))?$`, 'i')
const CLAUDE_ADAPTIVE_THINKING_PATTERN = new RegExp(String.raw`^claude-(?:(?:${CLAUDE_THINKING_FAMILY_PATTERN})-(\d+)(?:-(\d{1,2}))?|(\d+)(?:-(\d{1,2}))?-(?:${CLAUDE_THINKING_FAMILY_PATTERN}))(?:-(\d{8}))?(?:-(?:preview|research))?$`, 'i')
const CLAUDE_PREVIEW_THINKING_PATTERN = new RegExp(String.raw`^claude-${CLAUDE_THINKING_FAMILY_PATTERN}-(?:preview|research)(?:-\d{8})?$`, 'i')
const DEBUG_ANTHROPIC_THINKING = false

export const anthropicThinkingPatternsForTest = Object.freeze({
  claude37Sonnet: CLAUDE_37_SONNET_PATTERN,
  claude4Thinking: CLAUDE_4_THINKING_PATTERN,
  claudeAdaptiveThinking: CLAUDE_ADAPTIVE_THINKING_PATTERN,
  claudePreviewThinking: CLAUDE_PREVIEW_THINKING_PATTERN,
})

type AnthropicReasoningPayload =
  | { thinking: { type: 'adaptive' }; output_config: { effort: Exclude<NonNullable<ProviderConfig['reasoningEffort']>, 'none' | 'minimal'> } }
  | { thinking: { type: 'enabled'; budget_tokens: number } }
  | { thinking: { type: 'disabled' } }
  | Record<string, never>

function anthropicReasoningPayload(cfg: ProviderConfig, effectiveMaxTokens = cfg.max_tokens ?? 8192): AnthropicReasoningPayload {
  const effort = cfg.reasoningEffort ?? 'medium'
  if (effort === 'none' || effort === 'minimal') return {}
  const model = (cfg.model ?? '').trim()
  if (!model) return {}
  // ProviderConfig['reasoningEffort'] budgets: 1024 is Anthropic's extended-thinking minimum;
  // 4096/6144/8191 are Circuitiny tiers balancing cost, latency, and context use, with xhigh as the Codex extension.
  const budgetByEffort = {
    low: 1024,
    medium: 4096,
    high: 6144,
    xhigh: 8191, // ProviderConfig['reasoningEffort'] xhigh stays one token below an 8192 boundary.
  } satisfies Record<Exclude<NonNullable<ProviderConfig['reasoningEffort']>, 'none' | 'minimal'>, number>
  const thinkingSupport = parseAnthropicThinkingSupport(model)
  if (thinkingSupport === 'none') {
    if (DEBUG_ANTHROPIC_THINKING) {
      console.debug('Anthropic model does not match thinking support patterns.', { model, normalized: normalizeClaudeModelId(model) })
    }
    return {}
  }
  if (thinkingSupport === 'adaptive') {
    return { thinking: { type: 'adaptive' }, output_config: { effort } }
  }
  // Legacy thinking models require manual budgets; clamp against the same response
  // cap sent in max_tokens so default configs cannot request more thinking than fits.
  const maxTokens = effectiveMaxTokens
  const availableForThinking = Math.max(0, maxTokens - 1024)
  const rawBudget = budgetByEffort[effort]
  if (availableForThinking < 1024) {
    console.warn('Anthropic thinking disabled because max_tokens leaves insufficient response space.', { model, maxTokens, rawBudget, availableForThinking })
    return { thinking: { type: 'disabled' } }
  }
  const budget = Math.max(1024, Math.min(rawBudget, availableForThinking))
  const budgetWarnings = [
    rawBudget > availableForThinking ? 'requested thinking budget exceeds available response space' : '',
    budget >= availableForThinking - 256 ? 'thinking budget is close to max_tokens response cap' : '',
  ].filter(Boolean)
  if (budgetWarnings.length > 0) {
    console.warn(`Anthropic thinking budget warning: ${budgetWarnings.join('; ')}.`, { model, maxTokens, rawBudget, budget, availableForThinking })
  }
  return { thinking: { type: 'enabled', budget_tokens: budget } }
}

export type AnthropicThinkingSupport = 'none' | 'legacy' | 'adaptive'

export function parseAnthropicThinkingSupport(model: string): AnthropicThinkingSupport {
  const normalized = normalizeClaudeModelId(model)
  if (CLAUDE_PREVIEW_THINKING_PATTERN.test(normalized)) return 'adaptive'
  if (CLAUDE_37_SONNET_PATTERN.test(normalized)) return 'legacy'
  const parsed = parseAdaptiveThinkingVersion(normalized)
  if (parsed) {
    if (parsed.major > 4 || (parsed.major === 4 && parsed.minor >= 6)) return 'adaptive'
    return parsed.major >= 4 ? 'legacy' : 'none'
  }
  if (CLAUDE_4_THINKING_PATTERN.test(normalized)) return 'legacy'
  if (DEBUG_ANTHROPIC_THINKING) {
    console.debug('Anthropic thinking support patterns did not match.', {
      model,
      normalized,
      testedPatterns: Object.keys(anthropicThinkingPatternsForTest),
    })
  }
  return 'none'
}

function normalizeClaudeModelId(model: string): string {
  return model.trim().toLowerCase()
}

function parseAdaptiveThinkingVersion(model: string): { major: number; minor: number } | null {
  const match = model.match(CLAUDE_ADAPTIVE_THINKING_PATTERN)
  if (!match) return null
  const defaultedMajor = !match[1] && !match[3]
  const rawMajor = match[1] ?? match[3] ?? '0'
  const rawMinorCandidate = match[2] ?? match[4] ?? '0'
  const parsedMajor = Number.parseInt(rawMajor, 10)
  const parsedMinor = /^\d{1,2}$/.test(rawMinorCandidate) ? Number.parseInt(rawMinorCandidate, 10) : 0
  const major = Number.isFinite(parsedMajor) ? parsedMajor : 0
  const minor = Number.isFinite(parsedMinor) ? parsedMinor : 0
  if (DEBUG_ANTHROPIC_THINKING && (defaultedMajor || (major === 0 && minor === 0))) {
    console.debug('Anthropic thinking version parse used fallback values.', {
      model,
      rawMajor,
      rawMinorCandidate,
      major,
      minor,
    })
  }
  return { major, minor }
}
