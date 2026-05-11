// Codex CLI provider — uses the local Codex ChatGPT login instead of an API key.
// Tool calling works via the same text protocol used for Claude Code.

import type { Msg, AgentCallbacks, ProviderConfig } from './types'
import { tools, execTool, makeExecContext } from './tools'

const TOOL_SPEC = tools
  .map((t) => {
    const props = Object.entries(t.function.parameters.properties ?? {})
      .map(([k, v]: [string, any]) => {
        const req = (t.function.parameters.required ?? []).includes(k) ? '' : '?'
        const enumNote = v.enum ? ` (${v.enum.join('|')})` : ''
        return `    ${k}${req}: ${v.type ?? 'any'}${enumNote}`
      })
      .join('\n')
    return `  ${t.function.name} — ${t.function.description}\n${props}`
  })
  .join('\n\n')

const TOOL_PROTOCOL = `
VISUAL CONTEXT:
Each Codex CLI request includes a screenshot of the current Circuitiny window. Use it to inspect the rendered 3D canvas, schematic, selected tabs, warnings, generated code, and visible UI state. Prefer get_project for exact IDs/nets, and use the screenshot for spatial/layout/visual details that the project JSON does not capture.

TOOL CALL PROTOCOL:
To call a tool output EXACTLY this on its own line — nothing before or after it on that line:
<tool_call>{"name":"TOOL_NAME","args":{ARGS_JSON}}</tool_call>

Do NOT use your built-in shell, file editing, or web tools. ONLY use the Circuitiny tools listed below via the format above.
After a tool call STOP — do not write more text. The result will appear as "ToolResult: ..." and you continue from there.

BEGINNER TEACHING RULES:
- Make a short plan before changing the circuit.
- Prefer local catalog parts before suggesting draft or external parts.
- Use recommend_parts when the requested part is goal-oriented or not obvious.
- Run run_drc after wiring changes and explain any remaining warnings in beginner language.
- Ask before importing/generated draft parts, flashing hardware, overwriting saved files, or making broad changes.
- After changes, explain what changed, why it matters, and how the learner can verify it in Sim / Code / Build.

TOOLS:
${TOOL_SPEC}
`

const TOOL_OPEN_TAG = '<tool_call>'
const TOOL_CLOSE_TAG = '</tool_call>'
const CODEX_CHAT_TIMEOUT_MS = 180_000
type ToolCallParseErrorHandler = (rawToolCall: string, error: unknown) => void
type ToolCallBlock = { raw: string; start: number; end: number }

function findToolCallCloseStart(text: string, from: number): number {
  let inString = false
  let escaping = false
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaping) {
        escaping = false
      } else if (ch === '\\') {
        escaping = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (text.startsWith(TOOL_CLOSE_TAG, i)) return i
  }
  return -1
}

function extractToolCallBlocks(text: string): ToolCallBlock[] {
  const blocks: ToolCallBlock[] = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf(TOOL_OPEN_TAG, cursor)
    if (start === -1) break
    const bodyStart = start + TOOL_OPEN_TAG.length
    const closeStart = findToolCallCloseStart(text, bodyStart)
    if (closeStart === -1) {
      console.warn('Incomplete Codex tool_call block without closing tag', {
        start,
        snippet: text.slice(bodyStart, Math.min(bodyStart + 100, text.length)),
      })
      cursor = bodyStart
      continue
    }
    blocks.push({
      raw: text.slice(bodyStart, closeStart).trim(),
      start,
      end: closeStart + TOOL_CLOSE_TAG.length,
    })
    cursor = closeStart + TOOL_CLOSE_TAG.length
  }
  return blocks
}

function stripToolCallBlocks(text: string, blocks: ToolCallBlock[]): string {
  if (blocks.length === 0) return text
  let out = ''
  let cursor = 0
  for (const block of blocks) {
    out += text.slice(cursor, block.start)
    cursor = block.end
  }
  return out + text.slice(cursor)
}

function parseToolCalls(blocks: ToolCallBlock[], onParseError?: ToolCallParseErrorHandler): Array<{ name: string; args: any }> {
  const calls: Array<{ name: string; args: any }> = []
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.raw)
      if (parsed.name) calls.push({ name: parsed.name, args: parsed.args ?? {} })
    } catch (error) {
      onParseError?.(block.raw, error)
    }
  }
  return calls
}

function formatConversation(conv: Msg[]): string {
  const lines: string[] = [
    TOOL_PROTOCOL,
  ]
  for (const m of conv) {
    if (m.role === 'system') {
      lines.push(`System: ${m.content}`)
    } else if (m.role === 'user') {
      lines.push(`Human: ${m.content}`)
    } else if (m.role === 'assistant') {
      if (m.content) lines.push(`Assistant: ${m.content}`)
      for (const tc of m.tool_calls ?? []) {
        lines.push(
          `${TOOL_OPEN_TAG}${JSON.stringify({ name: tc.function.name, args: toolCallArguments(tc.function.arguments) })}${TOOL_CLOSE_TAG}`
        )
      }
    } else if (m.role === 'tool') {
      lines.push(`ToolResult: ${m.content}`)
    }
  }
  return lines.join('\n')
}

function toolCallArguments(args: any): any {
  if (typeof args !== 'string') return args
  try {
    return JSON.parse(args)
  } catch {
    return args
  }
}

type CodexChatResult = Awaited<ReturnType<Window['espAI']['codexChat']>>

function emitVisibleText(text: string, cb: AgentCallbacks): void {
  const chunks = text.match(/\S+\s*/g) ?? [text]
  for (const chunk of chunks) cb.onToken(chunk)
}

async function codexChatWithTimeout(
  opts: Parameters<Window['espAI']['codexChat']>[0],
  timeoutMs: number
): Promise<CodexChatResult> {
  const runId = opts.runId ?? `codex-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const request = { ...opts, runId }
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let completed = false
  const claimComplete = (): boolean => {
    if (completed) return false
    completed = true
    return true
  }
  try {
    return await Promise.race([
      window.espAI.codexChat(request).then((result) => {
        claimComplete()
        return result
      }),
      new Promise<CodexChatResult>((resolve) => {
        timeoutId = setTimeout(() => {
          if (claimComplete()) {
            void window.espAI?.codexStop?.(runId)
            resolve({
              ok: false,
              error: `Codex CLI timed out after ${Math.round(timeoutMs / 1000)} seconds`,
            })
          }
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function chatCodexCli(
  conv: Msg[],
  cfg: ProviderConfig,
  cb: AgentCallbacks
): Promise<void> {
  if (!window.espAI?.codexChat) {
    cb.onError('codexChat IPC not available — only works inside Electron')
    return
  }

  const localConv = conv.slice()
  // 16 iterations balances learner exploration with preventing runaway loops; callers can override for longer tool chains.
  const maxLoops = cfg.maxToolLoops ?? 16
  const signal = cfg.signal
  const execCtx = makeExecContext(signal)
  const invocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  for (let loop = 0; loop < maxLoops; loop++) {
    if (signal?.aborted) { cb.onError('aborted'); return }

    const runId = `codex-${Date.now()}-${loop}-${Math.random().toString(36).slice(2)}`
    const abort = () => { void window.espAI?.codexStop?.(runId) }
    signal?.addEventListener('abort', abort, { once: true })
    let result: CodexChatResult
    try {
      result = await codexChatWithTimeout({
        runId,
        prompt: formatConversation(localConv),
        model: cfg.model || 'gpt-5.5',
        reasoningEffort: codexCliReasoningEffort(cfg.reasoningEffort),
        includeScreenshot: true,
      }, CODEX_CHAT_TIMEOUT_MS)
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : String(err))
      return
    } finally {
      signal?.removeEventListener('abort', abort)
    }

    if (signal?.aborted) { cb.onError('aborted'); return }
    if (!result.ok) { cb.onError(result.error ?? 'Codex CLI error'); return }

    const clean = (result.text ?? '').replace(/\x1b\[[0-9;]*m/g, '')
    const toolCallBlocks = extractToolCallBlocks(clean)
    const toolCalls = parseToolCalls(toolCallBlocks, (raw, error) => {
      console.warn('Skipping malformed Codex tool_call tag', { raw, error })
    })
    const visibleText = stripToolCallBlocks(clean, toolCallBlocks).trim()

    if (visibleText) emitVisibleText(visibleText, cb)

    const msg: Msg = {
      role: 'assistant',
      content: visibleText,
      ...(toolCalls.length
        ? {
            tool_calls: toolCalls.map((tc, i) => ({
              id: `codex-${invocationId}-${loop}-${i}`,
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
          }
        : {}),
    }
    localConv.push(msg)
    cb.onMessage(msg)

    if (!toolCalls.length) return

    for (const [i, call] of toolCalls.entries()) {
      if (signal?.aborted) { cb.onError('aborted'); return }
      const toolResult = await execTool(call.name, call.args, execCtx)
      cb.onToolCall(call.name, call.args, toolResult)
      const toolMsg: Msg = {
        role: 'tool',
        name: call.name,
        tool_call_id: `codex-${invocationId}-${loop}-${i}`,
        content: JSON.stringify(toolResult),
      }
      localConv.push(toolMsg)
      cb.onMessage(toolMsg)
    }
  }
  cb.onError(`Max tool loops (${maxLoops}) reached. Partial conversation tail: ${JSON.stringify(localConv.slice(-4))}`)
}

function codexCliReasoningEffort(effort: ProviderConfig['reasoningEffort']): Parameters<Window['espAI']['codexChat']>[0]['reasoningEffort'] {
  if (effort === 'none' || effort === 'minimal') return 'low'
  return effort ?? 'high'
}
