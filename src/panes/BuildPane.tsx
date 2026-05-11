import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { generate } from '../codegen/generate'
import { RECOVERY_PANEL_STYLE } from './sharedStyles'

type Op = 'build' | 'flash' | 'monitor' | 'clean'
type Status = 'idle' | 'running' | 'done' | 'error'
type PendingApproval = { op: Exclude<Op, 'clean'>; resolve: (approved: boolean) => void }
type IdfStartOptions = Parameters<Window['espAI']['idfStart']>[0]

function buildStartOptions(
  op: Op,
  projectName: string,
  target: string,
  port: string,
  approved: boolean | undefined
): IdfStartOptions {
  if (op === 'clean') {
    return { name: projectName, target, op, port: port || undefined }
  }
  if (approved !== true) throw new Error(`Invariant: ${op} requires explicit approval before idfStart.`)
  return { name: projectName, target, op, port: port || undefined, approved }
}

export default function BuildPane() {
  const project = useStore((s) => s.project)
  const [ports, setPorts] = useState<string[]>([])
  const [port, setPort] = useState<string>('')
  const [status, setStatus] = useState<Status>('idle')
  const [currentOp, setCurrentOp] = useState<Op | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [approval, setApproval] = useState<PendingApproval | null>(null)
  const [pendingApprovalBanner, setPendingApprovalBanner] = useState(false)
  const approvalRef = useRef<PendingApproval | null>(null)
  const approvalBackdropRef = useRef<HTMLDivElement>(null)
  const approvalModalRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const [log, setLog] = useState<Array<{ stream: 'stdout' | 'stderr' | 'meta'; text: string }>>([])
  const logRef = useRef<HTMLDivElement>(null)
  const desktopApi = (typeof window === 'undefined' ? undefined : window.espAI) as Window['espAI'] | undefined
  const desktopUnavailable = !desktopApi

  const refreshPorts = useCallback(async () => {
    if (!desktopApi) {
      setPorts([])
      setPort('')
      return
    }
    try {
      const list = await desktopApi.listSerialPorts()
      setPorts(list)
      setPort((current) => current && list.includes(current) ? current : list[0] ?? '')
    } catch (error) {
      console.warn('Failed to list serial ports; clearing stale port selection.', { error })
      setPorts([])
      setPort('')
    }
  }, [desktopApi])

  useEffect(() => { void refreshPorts() }, [refreshPorts])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      approvalRef.current?.resolve(false)
      approvalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!desktopApi) return
    const offLog = desktopApi.onIdfLog((e) => {
      if (e.runId !== runId) return
      setLog((prev) => [...prev.slice(-1500), { stream: e.stream, text: e.text }])
    })
    const offExit = desktopApi.onIdfExit((e) => {
      if (e.runId !== runId) return
      setLog((prev) => [...prev, { stream: 'meta', text: `\n── exit code ${e.code ?? 'null'}${e.signal ? ` (signal ${e.signal})` : ''} ──\n` }])
      setStatus(e.code === 0 ? 'done' : 'error')
      setRunId(null)
      setCurrentOp(null)
    })
    return () => { offLog(); offExit() }
  }, [desktopApi, runId])

  useEffect(() => {
    logRef.current?.scrollTo({ top: 9e9 })
  }, [log])

  useEffect(() => {
    if (!pendingApprovalBanner) return
    const timeout = window.setTimeout(() => setPendingApprovalBanner(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [pendingApprovalBanner])

  const requestUserApproval = (op: Exclude<Op, 'clean'>): Promise<boolean> =>
    new Promise((resolve) => {
      const next = { op, resolve }
      approvalRef.current = next
      setApproval(next)
    })

  const resolveApproval = useCallback((approved: boolean) => {
    approvalRef.current?.resolve(approved)
    approvalRef.current = null
    if (mountedRef.current) setApproval(null)
  }, [])

  useEffect(() => {
    if (!approval) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const backdrop = approvalBackdropRef.current
    const modal = approvalModalRef.current
    const focusable = getFocusableElements(modal)
    const initialFocusTarget = focusable[0] ?? modal
    const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
    if (!initialFocusTarget && isDev) {
      console.warn('Approval dialog has no focus target: approvalModalRef/getFocusableElements returned empty.')
    }
    initialFocusTarget?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resolveApproval(false)
        return
      }
      if (event.key !== 'Tab') return
      if (focusable.length === 0) {
        event.preventDefault()
        modal?.focus()
        return
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
      if (currentIndex === -1) {
        event.preventDefault()
        focusable[0]?.focus()
        return
      }
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1)
      event.preventDefault()
      focusable[nextIndex]?.focus()
    }
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === backdrop) resolveApproval(false)
    }

    modal?.addEventListener('keydown', onKeyDown)
    backdrop?.addEventListener('click', onBackdropClick)
    return () => {
      modal?.removeEventListener('keydown', onKeyDown)
      backdrop?.removeEventListener('click', onBackdropClick)
      previousFocus?.focus()
    }
  }, [approval, resolveApproval])

  const run = async (op: Op) => {
    if (status === 'running') return
    if (!desktopApi) {
      setStatus('error')
      setLog([{ stream: 'stderr', text: 'error: Build and flash actions are only available in the Circuitiny desktop app.\n' }])
      return
    }
    if (approvalRef.current) {
      setLog((prev) => [...prev, { stream: 'meta', text: `(waiting for pending approval)\n` }])
      setPendingApprovalBanner(true)
      return
    }
    if ((op === 'flash' || op === 'monitor') && !port) {
      setLog((prev) => [...prev, { stream: 'meta', text: `(select a serial port first)\n` }])
      return
    }
    let approved: boolean | undefined
    if (op !== 'clean') {
      approved = await requestUserApproval(op)
      if (!approved) {
        setLog((prev) => [...prev, { stream: 'meta', text: `(${op} cancelled before hardware-affecting work)\n` }])
        return
      }
    }
    const latestProject = useStore.getState().project
    let generatedFiles: Record<string, string> | null = null
    if (op === 'build' || op === 'flash') {
      try {
        generatedFiles = { ...generate(latestProject).files }
      } catch (error) {
        setLog((prev) => [...prev, { stream: 'stderr', text: `error: ${error instanceof Error ? error.message : String(error)}\n` }])
        setStatus('error')
        return
      }
    }
    setLog([])
    setStatus('running')
    setCurrentOp(op)
    try {
      if (op === 'build' || op === 'flash') {
        if (!generatedFiles) throw new Error(`Invariant: ${op} requires generated files.`)
        const r = await desktopApi.projectWrite(latestProject.name, latestProject.target, generatedFiles)
        setLog((prev) => [...prev, { stream: 'meta', text: `→ wrote project to ${r.dir}\n` }])
      }
      const startOptions = buildStartOptions(op, latestProject.name, latestProject.target, port, approved)
      const { runId: rid, cmd } = await desktopApi.idfStart(startOptions)
      setLog((prev) => [...prev, { stream: 'meta', text: `→ ${cmd}\n\n` }])
      setRunId(rid)
    } catch (err: any) {
      setLog((prev) => [...prev, { stream: 'stderr', text: `error: ${err?.message ?? String(err)}\n` }])
      setStatus('error')
      setCurrentOp(null)
    }
  }

  const stop = async () => {
    if (!runId || !desktopApi) return
    const stoppingRunId = runId
    try {
      await desktopApi.idfStop(stoppingRunId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Failed to stop ESP-IDF run.', { runId: stoppingRunId, error })
      setLog((prev) => [...prev, { stream: 'stderr', text: `error: failed to stop run ${stoppingRunId}: ${message}\n` }])
      setStatus('error')
      setCurrentOp(null)
      setRunId(null)
    }
  }

  const busy = status === 'running'
  const recovery = useMemo(() => {
    if (status !== 'error') return null
    return buildRecoveryHint(log.slice(-100).map((l) => l.text).join('\n'))
  }, [status, log])
  const approvalTitleId = approval ? `approval-${approval.op}-title` : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px',
                    borderBottom: '1px solid #222', flexWrap: 'wrap' }}>
        <button onClick={() => run('build')} disabled={busy || desktopUnavailable} style={btn(busy || desktopUnavailable, currentOp === 'build')}>▶ Build</button>
        <button onClick={() => run('flash')} disabled={busy || desktopUnavailable || !port} style={btn(busy || desktopUnavailable, currentOp === 'flash')}>⚡ Flash</button>
        <button onClick={() => run('monitor')} disabled={busy || desktopUnavailable || !port} style={btn(busy || desktopUnavailable, currentOp === 'monitor')}>📟 Monitor</button>
        <button onClick={() => run('clean')} disabled={busy || desktopUnavailable} style={btn(busy || desktopUnavailable, false, true)}>Clean</button>
        <button onClick={stop} disabled={!busy} style={stopBtn(busy)}>■ Stop</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        <span style={muted}>port</span>
        <select value={port} onChange={(e) => setPort(e.target.value)} style={select}>
          {ports.length === 0 && <option value="">(no devices)</option>}
          {ports.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={refreshPorts} disabled={desktopUnavailable} style={ghostBtn} title="Rescan serial ports">↻</button>

        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>
          target <b style={{ color: '#ddd' }}>{project.target}</b> · {statusLabel(status, currentOp)}
        </div>
      </div>

      {approval && (
        <div ref={approvalBackdropRef} role="alertdialog" aria-modal="true" aria-label={`${approval.op} approval`} aria-labelledby={approvalTitleId} aria-describedby="approval-desc" style={approvalBackdrop}>
          <div ref={approvalModalRef} tabIndex={-1} style={approvalModal}>
            <h2 id={approvalTitleId} style={{ fontSize: 14, fontWeight: 700, color: '#f3f7fb', margin: '0 0 6px' }}>Approve {approval.op}?</h2>
            <div id="approval-desc" style={{ color: '#b8c6d5', lineHeight: 1.4, marginBottom: 10 }}>
              This action can write build files, use a serial port, or interact with connected hardware.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => resolveApproval(false)} style={ghostBtn}>Cancel</button>
              <button onClick={() => resolveApproval(true)} style={btn(false, true)}>Approve</button>
            </div>
          </div>
        </div>
      )}

      {pendingApprovalBanner && (
        <div role="status" style={RECOVERY_PANEL_STYLE}>
          Waiting for pending approval.
        </div>
      )}

      {recovery && (
        <div style={RECOVERY_PANEL_STYLE}>
          <b>Beginner recovery:</b> {recovery}
        </div>
      )}

      {desktopUnavailable && (
        <div style={RECOVERY_PANEL_STYLE}>
          Build, flash, monitor, and serial-port discovery are available in the Circuitiny desktop app. The browser preview can still review generated code.
        </div>
      )}

      <div ref={logRef} style={{
        flex: 1, overflow: 'auto', padding: 8, fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 11, lineHeight: 1.4, background: '#0a0a0a', whiteSpace: 'pre-wrap'
      }}>
        {log.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            {desktopUnavailable
              ? 'Desktop bridge unavailable in this browser preview.'
              : <>Build writes the project to <code>~/circuitiny/projects/{project.name}/</code>, runs <code>idf.py set-target</code> on first build, then <code>idf.py build</code>. Flash needs a selected serial port.</>}
          </div>
        )}
        {log.map((l, i) => (
          <span key={i} style={{ color: l.stream === 'stderr' ? '#ff9b9b' : l.stream === 'meta' ? '#7fc97f' : '#ddd' }}>{l.text}</span>
        ))}
      </div>
    </div>
  )
}

const TARGET_MISMATCH_REGEX = /\b(target mismatch|wrong target|mismatched target|sdkconfig target|sdkconfig mismatch)\b/

// Recovery text is matched against ESP-IDF v5.5.4 and esptool.py v4.12.dev1-style logs.
// Refresh these heuristics if future tool releases change their error wording.
function buildRecoveryHint(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('idf.py') && (lower.includes('not found') || lower.includes('enoent'))) {
    return 'ESP-IDF is not available to the app. Check that CIRCUITINY_IDF_PATH points to your ESP-IDF folder, then restart Circuitiny.'
  }
  if (lower.includes('no such file or directory') && lower.includes('esp-idf')) {
    return 'Circuitiny could not find the ESP-IDF install. Re-run ESP-IDF setup or set CIRCUITINY_IDF_PATH to the installed path.'
  }
  if (lower.includes('failed to connect') || lower.includes('timed out') || lower.includes('timeout')) {
    return 'The board did not answer during flashing. Press and hold BOOT, click Flash again, then release BOOT when writing starts.'
  }
  if (
    (lower.includes('serial') && (lower.includes('error') || lower.includes('failed'))) ||
    (lower.includes('port') && lower.includes('not found')) ||
    lower.includes('could not open serial') ||
    lower.includes('no device found')
  ) {
    return 'Check the USB cable, pick the correct serial port, and hold BOOT while flashing if the board does not enter bootloader mode automatically.'
  }
  if (TARGET_MISMATCH_REGEX.test(lower)) {
    return 'The selected board target may not match the generated project. Confirm the board in the project and run Clean before building again.'
  }
  return 'Read the first red error line above, fix that cause, then build again. The raw log is preserved so you can share the exact failure with Codex.'
}

function statusLabel(s: Status, op: Op | null): string {
  if (s === 'running' && op) return `running ${op}…`
  if (s === 'done') return 'done ✓'
  if (s === 'error') return 'error ✕'
  return 'idle'
}

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => {
      const isInLayout = element.offsetParent !== null ||
        element === document.activeElement ||
        window.getComputedStyle(element).position === 'fixed'
      return isInLayout && isVisibleForFocus(element)
    })
}

function isVisibleForFocus(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current) {
    const style = window.getComputedStyle(current)
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false
    if (style.display === 'none') return false
    current = current.parentElement
  }
  return true
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

const approvalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(0,0,0,0.55)',
}

const approvalModal: React.CSSProperties = {
  width: 'min(360px, calc(100vw - 32px))',
  border: '1px solid #356895',
  borderRadius: 6,
  background: '#101418',
  padding: 14,
  boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
}
const select: React.CSSProperties = {
  background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
  borderRadius: 3, padding: '2px 4px', fontSize: 11,
  fontFamily: "'SF Mono', Menlo, monospace"
}
const muted: React.CSSProperties = { color: '#888', fontSize: 10 }
