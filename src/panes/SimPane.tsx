import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { runDrc } from '../drc'
import { generate } from '../codegen/generate'

const SPEEDS: Array<1 | 2 | 5 | 10> = [1, 2, 5, 10]

export default function SimPane() {
  const project    = useStore((s) => s.project)
  const simulating = useStore((s) => s.simulating)
  const simTime    = useStore((s) => s.simTime)
  const simLog     = useStore((s) => s.simLog)
  const simSpeed   = useStore((s) => s.simSpeed)
  const simMode    = useStore((s) => s.simMode)
  const nativeCompileStatus = useStore((s) => s.nativeCompileStatus)
  const nativeCompileError  = useStore((s) => s.nativeCompileError)
  const nativeBinaryPath    = useStore((s) => s.nativeBinaryPath)
  const nativeRunId         = useStore((s) => s.nativeRunId)
  const setSim              = useStore((s) => s.setSimulating)
  const setSpeed            = useStore((s) => s.setSimSpeed)
  const setSimMode          = useStore((s) => s.setSimMode)
  const setNativeCompile    = useStore((s) => s.setNativeCompile)
  const setNativeRunId      = useStore((s) => s.setNativeRunId)
  const logRef = useRef<HTMLDivElement>(null)

  const canRun = runDrc(project).errors.length === 0

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [simLog])

  const timeLabel = simTime < 1000
    ? `${simTime} ms`
    : `${(simTime / 1000).toFixed(2)} s`

  // ── Native mode: compile ────────────────────────────────────────────────
  async function handleCompile() {
    const api = (window as any).espAI
    if (!api?.simCompile) return
    setNativeCompile('compiling', null, null)
    try {
      const { files } = generate(project)
      const appMainC = project.customCode?.['main/app_main.c'] ?? files['main/app_main.c']
      const result = await api.simCompile(project.name, appMainC)
      if (result.ok) {
        setNativeCompile('ready', null, result.binaryPath)
        useStore.setState((s) => ({
          simLog: [...s.simLog, '[compile] firmware compiled successfully'].slice(-200),
        }))
      } else {
        setNativeCompile('error', result.error ?? 'unknown error', null)
        useStore.setState((s) => ({
          simLog: [...s.simLog, `[compile] error: ${result.error}`].slice(-200),
        }))
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      setNativeCompile('error', msg, null)
      useStore.setState((s) => ({
        simLog: [...s.simLog, `[compile] exception: ${msg}`].slice(-200),
      }))
    }
  }

  // ── Native mode: play / stop ────────────────────────────────────────────
  async function handleNativePlay() {
    const api = (window as any).espAI
    if (!api?.simStart || !nativeBinaryPath) return
    setSim(true)
    const { runId } = await api.simStart(nativeBinaryPath)
    setNativeRunId(runId)
  }

  async function handleNativeStop() {
    const api = (window as any).espAI
    if (!api?.simStop) return
    if (nativeRunId) await api.simStop(nativeRunId)
    setSim(false)
    setNativeRunId(null)
  }

  // ── JS mode: play / stop ────────────────────────────────────────────────
  function handleJsPlay()  { setSim(true) }
  function handleJsStop()  { setSim(false) }

  const compileLabel =
    nativeCompileStatus === 'compiling' ? '⟳ Compiling…' :
    nativeCompileStatus === 'ready'     ? '✓ Compiled' :
    nativeCompileStatus === 'error'     ? '✗ Error' :
    '⬡ Compile'

  const nativeCanPlay = nativeCompileStatus === 'ready' && canRun && !simulating

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f0f0f' }}>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 0, padding: '6px 10px 0',
                    borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        {(['js', 'native'] as const).map((m) => (
          <button key={m} onClick={() => { if (simulating) return; setSimMode(m) }}
                  style={{
                    ...btn,
                    borderRadius: m === 'js' ? '3px 0 0 3px' : '0 3px 3px 0',
                    borderColor: simMode === m ? '#5a8af5' : '#333',
                    color:       simMode === m ? '#5a8af5' : '#555',
                    padding: '2px 10px',
                    cursor: simulating ? 'not-allowed' : 'pointer',
                  }}>
            {m === 'js' ? 'Behavior' : 'Firmware'}
          </button>
        ))}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderBottom: '1px solid #222', flexShrink: 0 }}>

        {simMode === 'native' ? (
          <>
            {/* Compile */}
            <button
              onClick={handleCompile}
              disabled={simulating || nativeCompileStatus === 'compiling'}
              style={{
                ...btn, minWidth: 96,
                background: nativeCompileStatus === 'ready'     ? '#1a2a3a' :
                            nativeCompileStatus === 'error'     ? '#3a1a1a' :
                            nativeCompileStatus === 'compiling' ? '#1a1a2a' : 'transparent',
                borderColor: nativeCompileStatus === 'ready'     ? '#5a8af5' :
                             nativeCompileStatus === 'error'     ? '#ff6b6b' :
                             nativeCompileStatus === 'compiling' ? '#555'    : '#444',
                color: nativeCompileStatus === 'ready'     ? '#5a8af5' :
                       nativeCompileStatus === 'error'     ? '#ff6b6b' :
                       nativeCompileStatus === 'compiling' ? '#888'    : '#aaa',
                cursor: (simulating || nativeCompileStatus === 'compiling') ? 'not-allowed' : 'pointer',
              }}>
              {compileLabel}
            </button>

            {/* Play / Stop */}
            {!simulating ? (
              <button
                onClick={handleNativePlay}
                disabled={!nativeCanPlay}
                style={{
                  ...btn, minWidth: 64,
                  background: nativeCanPlay ? '#1a3a1a' : 'transparent',
                  borderColor: nativeCanPlay ? '#4a9d4a' : '#333',
                  color: nativeCanPlay ? '#fff' : '#555',
                  cursor: nativeCanPlay ? 'pointer' : 'not-allowed',
                }}>
                ▶ Run
              </button>
            ) : (
              <button onClick={handleNativeStop} style={{ ...btn, minWidth: 64,
                background: '#3a1a1a', borderColor: '#ff6b6b', color: '#fff' }}>
                ■ Stop
              </button>
            )}
          </>
        ) : (
          <>
            {/* JS mode play/stop */}
            <button
              onClick={() => simulating ? handleJsStop() : handleJsPlay()}
              disabled={!simulating && !canRun}
              style={{
                ...btn, minWidth: 64,
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

            {/* Speed (JS mode only) */}
            <span style={{ fontSize: 10, color: '#555' }}>speed</span>
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)}
                      style={{ ...btn, ...(simSpeed === s ? activeBtn : {}), padding: '2px 6px' }}>
                {s}×
              </button>
            ))}
          </>
        )}

        {simMode === 'native' && <div style={{ flex: 1 }} />}

        {/* Clock */}
        <span style={{
          fontVariantNumeric: 'tabular-nums', fontSize: 11,
          color: simulating ? '#7edd7e' : '#444',
          minWidth: 60, textAlign: 'right',
          fontFamily: "'SF Mono', Menlo, monospace",
        }}>
          {simulating ? timeLabel : '—'}
        </span>
      </div>

      {/* Hint when idle */}
      {!simulating && (
        <div style={{ padding: '10px 12px', fontSize: 11, color: '#555', fontStyle: 'italic' }}>
          {simMode === 'native' ? (
            nativeCompileStatus === 'ready'
              ? 'Firmware compiled. Press Run to start the simulation.'
              : canRun
              ? 'Press Compile to build the firmware, then Run to simulate it.'
              : 'Fix DRC errors before compiling.'
          ) : (
            canRun
              ? 'Press Play to run the behavior simulation. Click buttons in the 3D view to fire GPIO edges.'
              : 'Fix DRC errors before running the simulation.'
          )}
        </div>
      )}

      {/* Log — always visible in native mode; in JS mode only while running or when there's output */}
      {(simMode === 'native' || simulating || simLog.length > 0) && (
        <div ref={logRef} style={{
          flex: 1, overflowY: 'auto', padding: '6px 10px',
          fontFamily: "'SF Mono', Menlo, monospace", fontSize: 11, lineHeight: '17px',
          color: '#9ecbff',
        }}>
          {simLog.length === 0
            ? <span style={{ color: '#444' }}>no output</span>
            : simLog.map((line, i) => (
                <div key={i} style={{
                  color: line.startsWith('⚠') || line.includes('error') ? '#ff6b6b' :
                         line.startsWith('[W]') ? '#ffcc00' :
                         line.startsWith('[compile]') ? '#888' : '#9ecbff',
                }}>
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
