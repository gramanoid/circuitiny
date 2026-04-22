import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { generate } from '../codegen/generate'

type Op = 'build' | 'flash' | 'monitor' | 'clean'
type Status = 'idle' | 'running' | 'done' | 'error'

export default function BuildPane() {
  const project = useStore((s) => s.project)
  const [ports, setPorts] = useState<string[]>([])
  const [port, setPort] = useState<string>('')
  const [status, setStatus] = useState<Status>('idle')
  const [currentOp, setCurrentOp] = useState<Op | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [log, setLog] = useState<Array<{ stream: 'stdout' | 'stderr' | 'meta'; text: string }>>([])
  const logRef = useRef<HTMLDivElement>(null)

  const { files } = useMemo(() => generate(project), [project])

  const refreshPorts = async () => {
    const list = await window.espAI.listSerialPorts()
    setPorts(list)
    if (!port && list.length > 0) setPort(list[0])
  }

  useEffect(() => { refreshPorts() }, [])

  useEffect(() => {
    const offLog = window.espAI.onIdfLog((e) => {
      if (e.runId !== runId) return
      setLog((prev) => [...prev.slice(-1500), { stream: e.stream, text: e.text }])
    })
    const offExit = window.espAI.onIdfExit((e) => {
      if (e.runId !== runId) return
      setLog((prev) => [...prev, { stream: 'meta', text: `\n── exit code ${e.code ?? 'null'}${e.signal ? ` (signal ${e.signal})` : ''} ──\n` }])
      setStatus(e.code === 0 ? 'done' : 'error')
      setRunId(null)
      setCurrentOp(null)
    })
    return () => { offLog(); offExit() }
  }, [runId])

  useEffect(() => {
    logRef.current?.scrollTo({ top: 9e9 })
  }, [log])

  const run = async (op: Op) => {
    if (status === 'running') return
    if ((op === 'flash' || op === 'monitor') && !port) {
      setLog((prev) => [...prev, { stream: 'meta', text: `(select a serial port first)\n` }])
      return
    }
    setLog([])
    setStatus('running')
    setCurrentOp(op)
    try {
      if (op === 'build' || op === 'flash') {
        const r = await window.espAI.projectWrite(project.name, project.target, files as unknown as Record<string, string>)
        setLog((prev) => [...prev, { stream: 'meta', text: `→ wrote project to ${r.dir}\n` }])
      }
      const { runId: rid, cmd } = await window.espAI.idfStart({
        name: project.name, target: project.target, op, port: port || undefined
      })
      setLog((prev) => [...prev, { stream: 'meta', text: `→ ${cmd}\n\n` }])
      setRunId(rid)
    } catch (err: any) {
      setLog((prev) => [...prev, { stream: 'stderr', text: `error: ${err?.message ?? String(err)}\n` }])
      setStatus('error')
      setCurrentOp(null)
    }
  }

  const stop = async () => {
    if (!runId) return
    await window.espAI.idfStop(runId)
  }

  const busy = status === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px',
                    borderBottom: '1px solid #222', flexWrap: 'wrap' }}>
        <button onClick={() => run('build')} disabled={busy} style={btn(busy, currentOp === 'build')}>▶ Build</button>
        <button onClick={() => run('flash')} disabled={busy || !port} style={btn(busy, currentOp === 'flash')}>⚡ Flash</button>
        <button onClick={() => run('monitor')} disabled={busy || !port} style={btn(busy, currentOp === 'monitor')}>📟 Monitor</button>
        <button onClick={() => run('clean')} disabled={busy} style={btn(busy, false, true)}>Clean</button>
        <button onClick={stop} disabled={!busy} style={stopBtn(busy)}>■ Stop</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        <span style={muted}>port</span>
        <select value={port} onChange={(e) => setPort(e.target.value)} style={select}>
          {ports.length === 0 && <option value="">(no devices)</option>}
          {ports.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={refreshPorts} style={ghostBtn} title="Rescan serial ports">↻</button>

        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>
          target <b style={{ color: '#ddd' }}>{project.target}</b> · {statusLabel(status, currentOp)}
        </div>
      </div>

      <div ref={logRef} style={{
        flex: 1, overflow: 'auto', padding: 8, fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 11, lineHeight: 1.4, background: '#0a0a0a', whiteSpace: 'pre-wrap'
      }}>
        {log.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            Build writes the project to <code>~/esp-ai/projects/{project.name}/</code>, runs <code>idf.py set-target</code> on first build, then <code>idf.py build</code>. Flash needs a selected serial port.
          </div>
        )}
        {log.map((l, i) => (
          <span key={i} style={{ color: l.stream === 'stderr' ? '#ff9b9b' : l.stream === 'meta' ? '#7fc97f' : '#ddd' }}>{l.text}</span>
        ))}
      </div>
    </div>
  )
}

function statusLabel(s: Status, op: Op | null): string {
  if (s === 'running' && op) return `running ${op}…`
  if (s === 'done') return 'done ✓'
  if (s === 'error') return 'error ✕'
  return 'idle'
}

const btn = (busy: boolean, active: boolean, subtle = false): React.CSSProperties => ({
  background: active ? '#203a20' : (subtle ? '#1a1a1a' : '#2a3140'),
  color: busy ? '#666' : '#fff',
  border: '1px solid ' + (active ? '#4a9d4a' : subtle ? '#333' : '#4a90d9'),
  borderRadius: 3, padding: '3px 10px', fontSize: 11,
  cursor: busy ? 'not-allowed' : 'pointer'
})
const stopBtn = (enabled: boolean): React.CSSProperties => ({
  background: enabled ? '#402020' : '#1a1a1a',
  color: enabled ? '#fff' : '#555',
  border: '1px solid ' + (enabled ? '#ff6b6b' : '#333'),
  borderRadius: 3, padding: '3px 10px', fontSize: 11,
  cursor: enabled ? 'pointer' : 'not-allowed'
})
const ghostBtn: React.CSSProperties = {
  background: 'transparent', color: '#888', border: '1px solid #333',
  borderRadius: 3, padding: '2px 6px', fontSize: 11, cursor: 'pointer'
}
const select: React.CSSProperties = {
  background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
  borderRadius: 3, padding: '2px 4px', fontSize: 11,
  fontFamily: "'SF Mono', Menlo, monospace"
}
const muted: React.CSSProperties = { color: '#888', fontSize: 10 }
