import { useState, useRef, useEffect } from 'react'
import { chat, type Msg } from '../agent/ollama'

export default function ChatPane() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState('qwen3.5:latest')
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => { scroller.current?.scrollTo({ top: 9e9 }) }, [msgs])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    const hist = [...msgs]
    try {
      await chat(hist, text, {
        onMessage: (m) => setMsgs((prev) => [...prev, m]),
        onToolCall: () => {},
        onError: (err) => setMsgs((prev) => [...prev, { role: 'assistant', content: `⚠ ${err}` }])
      }, { model })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #222', fontSize: 10, color: '#888',
                    display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>model:</span>
        <select value={model} onChange={(e) => setModel(e.target.value)}
                style={{ background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
                         fontSize: 10, padding: '1px 4px' }}>
          <option>qwen3.5:latest</option>
          <option>qwen3:8b</option>
          <option>gemma4:e4b</option>
        </select>
      </div>

      <div ref={scroller} style={{ flex: 1, overflow: 'auto', padding: 8, fontSize: 11 }}>
        {msgs.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            Try: “Add an LED and wire it to GPIO4 with ground”, then “run DRC”.
          </div>
        )}
        {msgs.map((m, i) => <Message key={i} m={m} />)}
        {busy && <div style={{ color: '#888', fontStyle: 'italic' }}>thinking…</div>}
      </div>

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
        {parsed?.ok === false ? <span style={{ color: '#ff6b6b' }}>error: {parsed.error}</span>
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
