import { useState, useRef, useEffect, useMemo } from 'react'
import { marked } from 'marked'
import { chat } from '../agent/chat'
import type { Msg } from '../agent/types'
import { PROVIDER_DEFAULTS, type ProviderConfig, type ProviderType } from '../agent/types'
import { loadChatHistory, saveChatHistory, clearChatHistory } from '../agent/chatSession'
import { useStore } from '../store'

const LS_KEY     = 'circuitiny:provider-cfg'
const LS_EXPERT  = 'circuitiny:expert-mode'
const LS_NOTICE  = 'circuitiny:provider-notice'

const STARTER_PROMPTS = [
  'Blink an LED every second',
  'Turn an LED on when a button is pressed',
  'Read a temperature sensor and log the value',
  'Build a traffic light with red, yellow, and green LEDs',
]

// ReasoningEffort and REASONING_EFFORTS hide legacy 'none'/'minimal' UI choices;
// ProviderConfig still accepts them for migration compatibility and maps them to 'low'.
type ReasoningEffort = Exclude<NonNullable<ProviderConfig['reasoningEffort']>, 'none' | 'minimal'>
const REASONING_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']

interface SavedProviderConfig {
  provider?: ProviderType
  model?: string
  apiKey?: string
  baseUrl?: string
  reasoningEffort?: ReasoningEffort | 'none' | 'minimal'
}

interface ProviderNotice {
  type: 'info'
  message: string
  previous?: 'minimal' | 'none'
  next?: 'low'
  provider?: string
  model?: string
}

interface LoadedProviderConfig {
  config: SavedProviderConfig
  migrationNotice: ProviderNotice | null
}

function loadCfg(): LoadedProviderConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return parseSavedProviderConfig(raw ? JSON.parse(raw) : {})
  } catch (error) {
    console.error('Failed to parse saved provider config.', { error, key: LS_KEY })
    return { config: {}, migrationNotice: null }
  }
}
function saveCfg(o: object): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o))
    return true
  } catch (error) {
    console.warn('Failed to save provider config.', { error, key: LS_KEY })
    return false
  }
}

function parseSavedProviderConfig(value: unknown): LoadedProviderConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { config: {}, migrationNotice: null }
  const record = value as Record<string, unknown>
  const out: SavedProviderConfig = {}
  let migrationNotice: ProviderNotice | null = null
  if (typeof record.provider === 'string' && record.provider in PROVIDER_DEFAULTS) out.provider = record.provider as ProviderType
  if (typeof record.model === 'string') out.model = record.model
  if (typeof record.apiKey === 'string') out.apiKey = record.apiKey
  if (typeof record.baseUrl === 'string') out.baseUrl = record.baseUrl
  if (record.reasoningEffort === 'minimal' || record.reasoningEffort === 'none') {
    out.reasoningEffort = 'low'
    migrationNotice = buildReasoningEffortMigrationNotice(record.reasoningEffort, record.provider, record.model)
  } else if (typeof record.reasoningEffort === 'string') {
    out.reasoningEffort = REASONING_EFFORTS.includes(record.reasoningEffort as ReasoningEffort)
      ? record.reasoningEffort as ReasoningEffort
      : 'medium'
  }
  return { config: out, migrationNotice }
}

function currentReasoningEffort(value: SavedProviderConfig['reasoningEffort']): ReasoningEffort {
  if (value === 'none' || value === 'minimal') return 'low'
  return value ?? 'medium'
}

function buildReasoningEffortMigrationNotice(previous: 'minimal' | 'none', provider: unknown, model: unknown): ProviderNotice {
  const message = `Reasoning effort "${previous}" was migrated to "low".`
  const detail = {
    previous,
    next: 'low' as const,
    provider: typeof provider === 'string' ? provider : undefined,
    model: typeof model === 'string' ? model : undefined,
  }
  console.info('reasoning_effort_migrated', detail)
  return { type: 'info', message, ...detail }
}

function storeProviderNotice(notice: ProviderNotice): boolean {
  try {
    localStorage.setItem(LS_NOTICE, JSON.stringify(notice))
    return true
  } catch (error) {
    console.warn('Failed to store provider migration notice.', { error, notice })
    return false
  }
}

function loadProviderNotice(): { type: 'info'; message: string } | null {
  try {
    const raw = localStorage.getItem(LS_NOTICE)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.type === 'info' && typeof parsed.message === 'string'
      ? { type: 'info', message: parsed.message }
      : null
  } catch (error) {
    console.warn('Failed to load provider notice.', { error, key: LS_NOTICE })
    return null
  }
}

const FALLBACK_MODELS: Record<ProviderType, string[]> = {
  ollama:      [],
  openai:      [PROVIDER_DEFAULTS.openai.defaultModel],
  anthropic:   ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7'],
  openrouter:  ['anthropic/claude-sonnet-4-6', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.5-flash'],
  claudecode:  ['sonnet', 'opus', 'haiku'],
  codexcli:    [PROVIDER_DEFAULTS.codexcli.defaultModel],
}

async function fetchModels(provider: ProviderType, apiKey: string, baseUrl: string): Promise<string[]> {
  if (provider === 'claudecode') return FALLBACK_MODELS.claudecode
  if (provider === 'codexcli') return FALLBACK_MODELS.codexcli
  try {
    const sig = AbortSignal.timeout(5000)
    if (provider === 'ollama') {
      const base = baseUrl.replace(/\/$/, '') || 'http://localhost:11434'
      const res = await fetch(`${base}/api/tags`, { signal: sig })
      if (!res.ok) return []
      const data = await res.json()
      return (data.models as { name: string }[]).map((m) => m.name).sort()
    }
    if (provider === 'openai') {
      if (!apiKey) return FALLBACK_MODELS.openai
      const base = baseUrl.replace(/\/$/, '') || 'https://api.openai.com'
      const res = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` }, signal: sig
      })
      if (!res.ok) return FALLBACK_MODELS.openai
      const data = await res.json()
      return (data.data as { id: string }[])
        .map((m) => m.id)
        .filter((id) => /^(gpt-|o1|o3|chatgpt)/.test(id))
        .sort()
    }
    if (provider === 'anthropic') {
      if (!apiKey) return FALLBACK_MODELS.anthropic
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, signal: sig
      })
      if (!res.ok) return FALLBACK_MODELS.anthropic
      const data = await res.json()
      return (data.data as { id: string }[]).map((m) => m.id).sort().reverse()
    }
    if (provider === 'openrouter') {
      if (!apiKey) return FALLBACK_MODELS.openrouter
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }, signal: sig
      })
      if (!res.ok) return FALLBACK_MODELS.openrouter
      const data = await res.json()
      return (data.data as { id: string }[]).map((m) => m.id).sort()
    }
  } catch { /* fall through */ }
  return FALLBACK_MODELS[provider]
}

export default function ChatPane() {
  const loaded = useMemo(() => loadCfg(), [])
  const saved = loaded.config
  const migrationNoticeRef = useRef<ProviderNotice | null>(loaded.migrationNotice)
  const [provider, setProvider]     = useState<ProviderType>(saved.provider ?? 'ollama')
  const [model, setModel]           = useState<string>(saved.model ?? PROVIDER_DEFAULTS.ollama.defaultModel)
  const [apiKey, setApiKey]         = useState<string>(saved.apiKey ?? '')
  const [baseUrl, setBaseUrl]       = useState<string>(saved.baseUrl ?? '')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(currentReasoningEffort(saved.reasoningEffort))
  const [showCfg, setShowCfg]       = useState(false)
  const [expertMode, setExpertMode] = useState<boolean>(() => localStorage.getItem(LS_EXPERT) === 'true')
  const [dynamicModels, setDynamicModels] = useState<string[]>([])
  const [notice, setNotice] = useState(() => loadProviderNotice())

  const projectName = useStore((s) => s.project.name)

  // DisplayMsg adds an optional _sid marker used only during streaming to
  // identify the in-progress bubble. It is stripped before saving to history.
  type DisplayMsg = Msg & { _sid?: string }

  const [msgs, setMsgs]   = useState<DisplayMsg[]>(() => loadChatHistory(projectName))
  const [input, setInput] = useState('')
  const [busy, setBusy]   = useState(false)
  const scroller          = useRef<HTMLDivElement>(null)
  const streamSid         = useRef<string | null>(null)   // set in onToken body, not inside updater
  const abortRef          = useRef<AbortController | null>(null)

  // Load history when project switches
  useEffect(() => {
    setMsgs(loadChatHistory(projectName))
  }, [projectName])

  // Fetch available models whenever provider, key, or endpoint changes
  useEffect(() => {
    setDynamicModels([])
    fetchModels(provider, apiKey, baseUrl).then((list) => {
      setDynamicModels(list)
      setModel((current) => (list.length > 0 && !list.includes(current)) ? list[0] : current)
    })
  }, [provider, apiKey, baseUrl])

  useEffect(() => {
    const migratedNotice = migrationNoticeRef.current
    migrationNoticeRef.current = null
    if (migratedNotice) {
      // Show the migration even when persistence is unavailable; only saved recall depends on localStorage.
      setNotice({ type: 'info', message: migratedNotice.message })
    }
    saveCfg({ provider, model, apiKey, baseUrl, reasoningEffort })
    if (migratedNotice) {
      storeProviderNotice(migratedNotice)
    }
  }, [provider, model, apiKey, baseUrl, reasoningEffort])

  // Persist history whenever messages change (strip streaming markers before saving)
  useEffect(() => {
    saveChatHistory(projectName, msgs.map(({ _sid: _, ...m }) => m))
  }, [projectName, msgs])

  useEffect(() => { scroller.current?.scrollTo({ top: 9e9 }) }, [msgs])

  function onProviderChange(p: ProviderType) {
    setProvider(p)
    const m = FALLBACK_MODELS[p][0] ?? ''
    setModel(m)
    setBaseUrl('')
  }

  function onModelChange(m: string) {
    setModel(m)
  }

  function onKeyChange(k: string) {
    setApiKey(k)
  }

  function onBaseUrlChange(u: string) {
    setBaseUrl(u)
  }

  function onReasoningEffortChange(effort: ReasoningEffort) {
    setReasoningEffort(effort)
  }

  function dismissProviderNotice() {
    try {
      localStorage.removeItem(LS_NOTICE)
    } catch (error) {
      console.warn('Failed to dismiss provider notice from storage.', { error, key: LS_NOTICE })
    }
    setNotice(null)
  }

  function toggleExpert() {
    const next = !expertMode
    setExpertMode(next)
    localStorage.setItem(LS_EXPERT, String(next))
    setMsgs([])  // reset conversation when switching modes
  }

  const defaults = PROVIDER_DEFAULTS[provider]

  function stop() {
    abortRef.current?.abort()
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    // Strip internal _sid markers before sending history to the model.
    const hist: Msg[] = msgs.map(({ _sid: _, ...m }) => m)
    streamSid.current = null
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await chat(hist, text, {
        onToken: (delta) => {
          // Assign the streaming session ID here (outside the updater) so the
          // updater stays a pure function — safe for React concurrent re-runs.
          if (streamSid.current === null) streamSid.current = `s${Date.now()}`
          const sid = streamSid.current
          setMsgs((prev) => {
            const idx = prev.findIndex((m) => m._sid === sid)
            if (idx === -1) return [...prev, { role: 'assistant', content: delta, _sid: sid }]
            const next = prev.slice()
            next[idx] = { ...next[idx], content: next[idx].content + delta }
            return next
          })
        },
        onMessage: (m) => {
          const sid = streamSid.current
          if (m.role === 'assistant') streamSid.current = null
          setMsgs((prev) => {
            if (m.role === 'assistant' && sid) {
              const idx = prev.findIndex((msg) => msg._sid === sid)
              if (idx !== -1) {
                const next = prev.slice()
                next[idx] = m   // replace streaming bubble with final message (no _sid)
                return next
              }
            }
            return [...prev, m]
          })
        },
        onToolCall: () => {},
        onError: (err) => setMsgs((prev) => [
          ...prev,
          { role: 'assistant', content: err === 'aborted' ? '⏸ stopped' : `⚠ ${err}` },
        ]),
      }, {
        provider,
        model,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || defaults.baseUrl,
        reasoningEffort,
        expertMode,
        signal: ac.signal,
      })
    } finally {
      setBusy(false)
      streamSid.current = null
      abortRef.current = null
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#111', color: '#ccc', border: '1px solid #333',
    borderRadius: 3, padding: '3px 6px', fontSize: 10, width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── header bar ── */}
      <div style={{ padding: '4px 8px', borderBottom: '1px solid #222', fontSize: 10,
                    color: '#888', display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={provider} onChange={(e) => onProviderChange(e.target.value as ProviderType)}
                style={{ ...inputStyle, width: 'auto' }}>
          {(Object.keys(PROVIDER_DEFAULTS) as ProviderType[]).map((p) => (
            <option key={p} value={p}>{PROVIDER_DEFAULTS[p].label}</option>
          ))}
        </select>

        <select value={model} onChange={(e) => onModelChange(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
          {(dynamicModels.length > 0 ? dynamicModels : [model])
            .map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <select value={reasoningEffort} onChange={(e) => onReasoningEffortChange(e.target.value as ReasoningEffort)}
                title="AI model reasoning effort"
                style={{ ...inputStyle, width: 72 }}>
          {REASONING_EFFORTS.map((effort) => (
            <option key={effort} value={effort}>{effort}</option>
          ))}
        </select>

        <button onClick={toggleExpert}
                title={expertMode ? 'Expert mode ON — click to disable' : 'Enable expert mode (deep research loop)'}
                style={{ background: expertMode ? '#0d2a1a' : 'none',
                         border: `1px solid ${expertMode ? '#2ecc71' : '#333'}`,
                         borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
                         color: expertMode ? '#2ecc71' : '#666', fontWeight: expertMode ? 700 : 400 }}>
          Expert
        </button>

        <button onClick={() => { clearChatHistory(projectName); setMsgs([]) }}
                title="Clear chat history"
                style={{ background: 'none', border: '1px solid #333',
                         borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
                         color: '#666' }}>
          ✕
        </button>

        <button onClick={() => setShowCfg((v) => !v)}
                title="API key / endpoint"
                style={{ background: 'none', border: '1px solid #333',
                         borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
                         color: (defaults.needsKey && !apiKey) ? '#ff9500' : '#888' }}>
          ⚙
        </button>
      </div>

      {/* ── expanded config panel ── */}
      {showCfg && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid #222', fontSize: 10,
                      background: '#0d0d0d', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {defaults.needsKey && (
            <label style={{ color: '#999' }}>
              API key
              <input type="password" value={apiKey} onChange={(e) => onKeyChange(e.target.value)}
                     placeholder={`${defaults.label} API key`}
                     style={{ ...inputStyle, marginTop: 2 }} />
            </label>
          )}
          <label style={{ color: '#999' }}>
            Endpoint {!defaults.needsKey && '(optional)'}
            <input type="text" value={baseUrl} onChange={(e) => onBaseUrlChange(e.target.value)}
                   placeholder={defaults.baseUrl}
                   style={{ ...inputStyle, marginTop: 2 }} />
          </label>
        </div>
      )}

      {/* ── message list ── */}
      <div ref={scroller} style={{ flex: 1, overflow: 'auto', padding: 8, fontSize: 11 }}>
        {notice && (
          <div role="status" aria-live="polite"
               style={{ marginBottom: 8, padding: '6px 8px', background: '#101a24',
                        border: '1px solid #31516d', borderRadius: 4, color: '#aacbe8',
                        display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{notice.message}</span>
            <button onClick={dismissProviderNotice}
                    style={{ background: 'transparent', color: '#aacbe8', border: '1px solid #31516d',
                             borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        )}
        {msgs.length === 0 && (
          expertMode ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>
              Expert mode: describe your goal and the agent will research, plan, and wire the circuit autonomously.
            </div>
          ) : (
            <div>
              <div style={{ color: '#555', fontSize: 10, marginBottom: 8 }}>Not sure where to start? Try one of these:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {STARTER_PROMPTS.map((p) => (
                  <button key={p} onClick={() => setInput(p)}
                          style={{ background: '#161b24', color: '#a8c4e8',
                                   border: '1px solid #2a3a50', borderRadius: 4,
                                   padding: '6px 10px', fontSize: 10, cursor: 'pointer',
                                   textAlign: 'left', lineHeight: 1.3 }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        {msgs.map((m, i) => <Message key={i} m={m} />)}
        {busy && <div style={{ color: '#888', fontStyle: 'italic' }}>thinking…</div>}
      </div>

      {/* ── input bar ── */}
      <div style={{ borderTop: '1px solid #222', padding: 6, display: 'flex', gap: 4 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
               disabled={busy}
               placeholder="ask the agent…"
               style={{ flex: 1, background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
                        borderRadius: 3, padding: '6px 8px', fontSize: 12 }} />
        {busy ? (
          <button onClick={stop}
                  style={{ background: '#402a2a', color: '#ddd', border: '1px solid #d94a4a',
                           borderRadius: 3, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
            Stop
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim()}
                  style={{ background: '#2a3140', color: '#ddd', border: '1px solid #4a90d9',
                           borderRadius: 3, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}

function Message({ m }: { m: Msg }) {
  const [thinkOpen, setThinkOpen] = useState(false)
  const html = useMemo(() => {
    if (m.role !== 'user' && m.role !== 'assistant') return ''
    return marked.parse(m.content, { async: false }) as string
  }, [m.role, m.content])

  if (m.role === 'tool') {
    // think results carry no user-visible information — suppress them
    if (m.tool_name === 'think') return null
    let parsed: any = null; try { parsed = JSON.parse(m.content) } catch {}
    return (
      <div style={{ margin: '3px 0', padding: 4, background: '#161616', border: '1px solid #2a2a2a',
                    borderRadius: 3, color: '#888', fontSize: 10 }}>
        <b>tool:{m.tool_name}</b>{' '}
        {parsed?.ok === false
          ? <span style={{ color: '#ff6b6b' }}>error: {parsed.error}</span>
          : <span style={{ color: '#7fc97f' }}>ok</span>}
      </div>
    )
  }

  if (m.tool_calls?.length) {
    const thinkCall = m.tool_calls.find((c) => c.function.name === 'think')
    const otherCalls = m.tool_calls.filter((c) => c.function.name !== 'think')
    return (
      <div style={{ margin: '3px 0', fontSize: 10 }}>
        {thinkCall && (
          <div style={{ marginBottom: 2 }}>
            <button onClick={() => setThinkOpen((v) => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                             color: '#7a9', fontSize: 10, padding: 0 }}>
              {thinkOpen ? '▾' : '▸'} reasoning…
            </button>
            {thinkOpen && (
              <div style={{ marginTop: 3, padding: '5px 8px', background: '#0d1f0d',
                            border: '1px solid #1a3a1a', borderRadius: 3,
                            color: '#7fb87a', whiteSpace: 'pre-wrap', fontSize: 10 }}>
                {thinkCall.function.arguments?.reasoning ?? ''}
              </div>
            )}
          </div>
        )}
        {otherCalls.length > 0 && (
          <div style={{ color: '#d0b3ff' }}>
            → calling {otherCalls.map((c) => c.function.name).join(', ')}
          </div>
        )}
      </div>
    )
  }

  const bg = m.role === 'user' ? '#1f2a40' : '#1a1a1a'
  const tag = m.role === 'user' ? 'you' : 'agent'
  return (
    <div style={{ margin: '4px 0', padding: '6px 8px', background: bg,
                  borderRadius: 3, border: '1px solid #2a2a2a' }}>
      <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>{tag}</div>
      <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
