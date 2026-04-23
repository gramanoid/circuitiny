import { useState, useRef, useEffect } from 'react'
import { chat } from '../agent/chat'
import type { Msg } from '../agent/types'
import { PROVIDER_DEFAULTS, type ProviderType } from '../agent/types'

const LS_KEY = 'esp-ai:provider-cfg'

function loadCfg() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}
function saveCfg(o: object) { localStorage.setItem(LS_KEY, JSON.stringify(o)) }

const PROVIDER_MODELS: Record<ProviderType, string[]> = {
  ollama:     ['qwen3.5:latest', 'qwen3:8b', 'gemma4:e4b', 'llama3.2:latest'],
  openai:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic:  ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7'],
  openrouter: ['anthropic/claude-sonnet-4-6', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.5-flash'],
}

export default function ChatPane() {
  const saved = loadCfg()
  const [provider, setProvider] = useState<ProviderType>(saved.provider ?? 'ollama')
  const [model, setModel]       = useState<string>(saved.model ?? PROVIDER_DEFAULTS.ollama.defaultModel)
  const [apiKey, setApiKey]     = useState<string>(saved.apiKey ?? '')
  const [baseUrl, setBaseUrl]   = useState<string>(saved.baseUrl ?? '')
  const [showCfg, setShowCfg]   = useState(false)

  const [msgs, setMsgs]   = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy]   = useState(false)
  const scroller          = useRef<HTMLDivElement>(null)
  const streamIdx         = useRef<number | null>(null)

  useEffect(() => { scroller.current?.scrollTo({ top: 9e9 }) }, [msgs])

  function onProviderChange(p: ProviderType) {
    setProvider(p)
    const m = PROVIDER_MODELS[p][0]
    setModel(m)
    setBaseUrl('')
    saveCfg({ provider: p, model: m, apiKey, baseUrl: '' })
  }

  function onModelChange(m: string) {
    setModel(m)
    saveCfg({ provider, model: m, apiKey, baseUrl })
  }

  function onKeyChange(k: string) {
    setApiKey(k)
    saveCfg({ provider, model, apiKey: k, baseUrl })
  }

  function onBaseUrlChange(u: string) {
    setBaseUrl(u)
    saveCfg({ provider, model, apiKey, baseUrl: u })
  }

  const defaults = PROVIDER_DEFAULTS[provider]

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    const hist = [...msgs]
    streamIdx.current = null
    try {
      await chat(hist, text, {
        onMessage: (m) => setMsgs((prev) => {
          if (m.role === 'assistant' && streamIdx.current !== null) {
            const next = prev.slice(); next[streamIdx.current] = m; streamIdx.current = null; return next
          }
          return [...prev, m]
        }),
        onToken: (delta) => setMsgs((prev) => {
          if (streamIdx.current === null) {
            streamIdx.current = prev.length
            return [...prev, { role: 'assistant', content: delta }]
          }
          const next = prev.slice(); const i = streamIdx.current
          next[i] = { ...next[i], content: next[i].content + delta }
          return next
        }),
        onToolCall: () => {},
        onError: (err) => setMsgs((prev) => [...prev, { role: 'assistant', content: `⚠ ${err}` }])
      }, {
        provider,
        model,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || defaults.baseUrl,
      })
    } finally {
      setBusy(false)
      streamIdx.current = null
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
          {PROVIDER_MODELS[provider].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

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
        {msgs.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            Try: "Add an LED and wire it to GPIO4 with ground", then "run DRC".
          </div>
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
        <button onClick={send} disabled={busy || !input.trim()}
                style={{ background: '#2a3140', color: '#ddd', border: '1px solid #4a90d9',
                         borderRadius: 3, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
          Send
        </button>
      </div>
    </div>
  )
}

function Message({ m }: { m: Msg }) {
  if (m.role === 'tool') {
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
    return (
      <div style={{ margin: '3px 0', color: '#d0b3ff', fontSize: 10 }}>
        → calling {m.tool_calls.map((c) => c.function.name).join(', ')}
      </div>
    )
  }
  const bg = m.role === 'user' ? '#1f2a40' : '#1a1a1a'
  const tag = m.role === 'user' ? 'you' : 'agent'
  return (
    <div style={{ margin: '4px 0', padding: '6px 8px', background: bg,
                  borderRadius: 3, border: '1px solid #2a2a2a', whiteSpace: 'pre-wrap' }}>
      <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>{tag}</div>
      {m.content}
    </div>
  )
}
