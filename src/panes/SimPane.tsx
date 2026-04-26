import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { runDrc } from '../drc'

const SPEEDS: Array<1 | 2 | 5 | 10> = [1, 2, 5, 10]

export default function SimPane() {
  const project    = useStore((s) => s.project)
  const simulating = useStore((s) => s.simulating)
  const simTime    = useStore((s) => s.simTime)
  const simLog     = useStore((s) => s.simLog)
  const simSpeed   = useStore((s) => s.simSpeed)
  const setSim     = useStore((s) => s.setSimulating)
  const setSpeed   = useStore((s) => s.setSimSpeed)
  const logRef     = useRef<HTMLDivElement>(null)

  const canRun = runDrc(project).errors.length === 0

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [simLog])

  const timeLabel = simTime < 1000
    ? `${simTime} ms`
    : `${(simTime / 1000).toFixed(2)} s`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f0f0f' }}>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderBottom: '1px solid #222', flexShrink: 0 }}>
        <button
          onClick={() => setSim(!simulating)}
          disabled={!simulating && !canRun}
          style={{
            ...btn,
            minWidth: 64,
            background: simulating ? '#3a1a1a' : (canRun ? '#1a3a1a' : 'transparent'),
            borderColor: simulating ? '#ff6b6b' : (canRun ? '#4a9d4a' : '#333'),
            color: (simulating || canRun) ? '#fff' : '#555',
            cursor: (simulating || canRun) ? 'pointer' : 'not-allowed',
          }}>
          {simulating ? '■ Stop' : '▶ Play'}
        </button>

        {simulating && (
          <button
            onClick={() => { setSim(false); setTimeout(() => setSim(true), 0) }}
            title="Restart from t=0"
            style={btn}>
            ↺ Reset
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Speed */}
        <span style={{ fontSize: 10, color: '#555' }}>speed</span>
        {SPEEDS.map((s) => (
          <button key={s} onClick={() => setSpeed(s)}
                  style={{ ...btn, ...(simSpeed === s ? activeBtn : {}), padding: '2px 6px' }}>
            {s}×
          </button>
        ))}

        {/* Clock */}
        <span style={{
          fontVariantNumeric: 'tabular-nums', fontSize: 11,
          color: simulating ? '#7edd7e' : '#444',
          minWidth: 60, textAlign: 'right',
          fontFamily: "'SF Mono', Menlo, monospace"
        }}>
          {simulating ? timeLabel : '—'}
        </span>
      </div>

      {/* Hint when idle */}
      {!simulating && (
        <div style={{ padding: '10px 12px', fontSize: 11, color: '#555', fontStyle: 'italic' }}>
          {canRun
            ? 'Press Play to run the firmware simulation. Click buttons in the 3D view to fire GPIO edges.'
            : 'Fix DRC errors before running the simulation.'}
        </div>
      )}

      {/* Log */}
      {simulating && (
        <div ref={logRef} style={{
          flex: 1, overflowY: 'auto', padding: '6px 10px',
          fontFamily: "'SF Mono', Menlo, monospace", fontSize: 11, lineHeight: '17px',
          color: '#9ecbff',
        }}>
          {simLog.length === 0
            ? <span style={{ color: '#444' }}>no output</span>
            : simLog.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('⚠') ? '#ffcc00' : '#9ecbff' }}>
                  {line}
                </div>
              ))}
        </div>
      )}
    </div>
  )
}

const btn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #444',
  borderRadius: 3,
  color: '#ccc',
  fontSize: 10,
  padding: '2px 8px',
  cursor: 'pointer',
  lineHeight: '18px',
  fontFamily: "'SF Mono', Menlo, monospace",
}

const activeBtn: React.CSSProperties = {
  borderColor: '#4a9d4a',
  color: '#7edd7e',
}
