import { useStore } from '../store'
import type { Behavior, TriggerKind, Action } from '../project/schema'
import { catalog } from '../catalog'

type TriggerType = TriggerKind['type']
type ActionType = Action['type']

const TRIGGER_TYPES: TriggerType[] = ['boot', 'timer', 'gpio_edge', 'wifi_connected']
const ACTION_TYPES: ActionType[] = ['set_output', 'toggle', 'log', 'delay']

export default function BehaviorsPane() {
  const project = useStore((s) => s.project)
  const addBehavior = useStore((s) => s.addBehavior)
  const removeBehavior = useStore((s) => s.removeBehavior)
  const updateBehavior = useStore((s) => s.updateBehavior)

  const { behaviors } = project
  const drivableTargets = collectDrivableTargets(project)
  const boardInputs = collectBoardInputs(project)

  return (
    <div style={{ padding: 8, overflow: 'auto', height: '100%', fontSize: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ flex: 1, color: '#888' }}>
          {behaviors.length} behavior{behaviors.length === 1 ? '' : 's'}
        </div>
        <button onClick={addBehavior} style={primaryBtn}>+ add behavior</button>
      </div>

      {behaviors.length === 0 && (
        <div style={{ color: '#666', fontStyle: 'italic', padding: '20px 4px' }}>
          No behaviors yet. A behavior is a <b>trigger</b> (when …) paired with one or more <b>actions</b> (do …).
          Click “+ add behavior” to create one.
        </div>
      )}

      {behaviors.map((beh) => (
        <BehaviorCard key={beh.id} beh={beh}
                      onPatch={(p) => updateBehavior(beh.id, p)}
                      onRemove={() => removeBehavior(beh.id)}
                      drivableTargets={drivableTargets}
                      boardInputs={boardInputs} />
      ))}
    </div>
  )
}

function BehaviorCard({ beh, onPatch, onRemove, drivableTargets, boardInputs }: {
  beh: Behavior
  onPatch: (p: Partial<Behavior>) => void
  onRemove: () => void
  drivableTargets: string[]
  boardInputs: string[]
}) {
  const setTriggerType = (type: TriggerType) => {
    let t: TriggerKind
    switch (type) {
      case 'boot': t = { type: 'boot' }; break
      case 'timer': t = { type: 'timer', period_ms: 1000 }; break
      case 'gpio_edge': t = { type: 'gpio_edge', source: boardInputs[0] ?? 'board.gpio0', edge: 'rising' }; break
      case 'wifi_connected': t = { type: 'wifi_connected' }; break
      default: return
    }
    onPatch({ trigger: t })
  }

  const addAction = (type: ActionType) => {
    let a: Action
    switch (type) {
      case 'set_output': a = { type: 'set_output', target: drivableTargets[0] ?? '', value: 'on' }; break
      case 'toggle':     a = { type: 'toggle',     target: drivableTargets[0] ?? '' }; break
      case 'log':        a = { type: 'log', level: 'info', message: 'hello' }; break
      case 'delay':      a = { type: 'delay', ms: 500 }; break
      default: return
    }
    onPatch({ actions: [...beh.actions, a] })
  }

  const patchAction = (idx: number, next: Action) =>
    onPatch({ actions: beh.actions.map((a, i) => i === idx ? next : a) })

  const removeAction = (idx: number) =>
    onPatch({ actions: beh.actions.filter((_, i) => i !== idx) })

  const moveAction = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= beh.actions.length) return
    const next = beh.actions.slice()
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onPatch({ actions: next })
  }

  return (
    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4,
                  padding: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ flex: 1, fontSize: 10, color: '#888', fontFamily: 'SF Mono, monospace' }}>{beh.id}</div>
        <button onClick={onRemove} style={iconBtn} title="Delete behavior">✕</button>
      </div>

      {/* Trigger */}
      <div style={sectionLabel}>when</div>
      <div style={row}>
        <select value={beh.trigger.type} onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                style={select}>
          {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <TriggerParams trigger={beh.trigger}
                       onPatch={(t) => onPatch({ trigger: t })}
                       boardInputs={boardInputs} />
      </div>

      {/* Actions */}
      <div style={{ ...sectionLabel, marginTop: 8 }}>do</div>
      {beh.actions.length === 0 && (
        <div style={{ color: '#666', fontStyle: 'italic', padding: '4px 0' }}>no actions — add one below</div>
      )}
      {beh.actions.map((a, i) => (
        <div key={i} style={row}>
          <button onClick={() => moveAction(i, -1)} style={tinyBtn} disabled={i === 0}>↑</button>
          <button onClick={() => moveAction(i, 1)} style={tinyBtn} disabled={i === beh.actions.length - 1}>↓</button>
          <select value={a.type} onChange={(e) => patchAction(i, convertAction(e.target.value as ActionType, drivableTargets))}
                  style={select}>
            {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <ActionParams action={a} onPatch={(next) => patchAction(i, next)}
                        drivableTargets={drivableTargets} />
          <button onClick={() => removeAction(i)} style={iconBtn}>✕</button>
        </div>
      ))}
      <div style={{ ...row, marginTop: 4 }}>
        <span style={{ color: '#666' }}>+</span>
        {ACTION_TYPES.map((t) => (
          <button key={t} onClick={() => addAction(t)} style={addBtn}>{t}</button>
        ))}
      </div>
    </div>
  )
}

function TriggerParams({ trigger, onPatch, boardInputs }: {
  trigger: TriggerKind
  onPatch: (t: TriggerKind) => void
  boardInputs: string[]
}) {
  if (trigger.type === 'timer') {
    return (
      <>
        <span style={muted}>every</span>
        <input type="number" min={10} step={50} value={trigger.period_ms}
               onChange={(e) => onPatch({ ...trigger, period_ms: parseInt(e.target.value) || 0 })}
               style={{ ...numInput, width: 70 }} />
        <span style={muted}>ms</span>
      </>
    )
  }
  if (trigger.type === 'gpio_edge') {
    return (
      <>
        <span style={muted}>on</span>
        <select value={trigger.source}
                onChange={(e) => onPatch({ ...trigger, source: e.target.value })}
                style={select}>
          {boardInputs.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={trigger.edge}
                onChange={(e) => onPatch({ ...trigger, edge: e.target.value as 'rising' | 'falling' | 'both' })}
                style={select}>
          <option>rising</option><option>falling</option><option>both</option>
        </select>
      </>
    )
  }
  return null
}

function ActionParams({ action, onPatch, drivableTargets }: {
  action: Action
  onPatch: (a: Action) => void
  drivableTargets: string[]
}) {
  if (action.type === 'set_output') {
    return (
      <>
        <select value={action.target} onChange={(e) => onPatch({ ...action, target: e.target.value })} style={select}>
          {drivableTargets.length === 0 && <option value="">(wire a component)</option>}
          {drivableTargets.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={action.value} onChange={(e) => onPatch({ ...action, value: e.target.value as 'on' | 'off' })} style={select}>
          <option>on</option><option>off</option>
        </select>
      </>
    )
  }
  if (action.type === 'toggle') {
    return (
      <select value={action.target} onChange={(e) => onPatch({ ...action, target: e.target.value })} style={select}>
        {drivableTargets.length === 0 && <option value="">(wire a component)</option>}
        {drivableTargets.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    )
  }
  if (action.type === 'log') {
    return (
      <>
        <select value={action.level} onChange={(e) => onPatch({ ...action, level: e.target.value as 'info' | 'warn' | 'error' })} style={select}>
          <option>info</option><option>warn</option><option>error</option>
        </select>
        <input value={action.message} onChange={(e) => onPatch({ ...action, message: e.target.value })}
               style={{ ...textInput, flex: 1 }} placeholder="message" />
      </>
    )
  }
  if (action.type === 'delay') {
    return (
      <>
        <input type="number" min={0} step={10} value={action.ms}
               onChange={(e) => onPatch({ ...action, ms: parseInt(e.target.value) || 0 })}
               style={{ ...numInput, width: 70 }} />
        <span style={muted}>ms</span>
      </>
    )
  }
  return null
}

function convertAction(type: ActionType, targets: string[]): Action {
  switch (type) {
    case 'set_output': return { type: 'set_output', target: targets[0] ?? '', value: 'on' }
    case 'toggle':     return { type: 'toggle',     target: targets[0] ?? '' }
    case 'log':        return { type: 'log', level: 'info', message: '' }
    case 'delay':      return { type: 'delay', ms: 500 }
    default:           return { type: 'log', level: 'info', message: '' }
  }
}

function collectDrivableTargets(project: ReturnType<typeof useStore.getState>['project']): string[] {
  const out: string[] = []
  for (const c of project.components) {
    const def = catalog.getComponent(c.componentId)
    if (!def) continue
    for (const p of def.pins) {
      if (p.type === 'digital_in' || p.type === 'digital_io' || p.type === 'digital_out' || p.type === 'pwm') {
        out.push(`${c.instance}.${p.id}`)
      }
    }
  }
  return out
}

function collectBoardInputs(project: ReturnType<typeof useStore.getState>['project']): string[] {
  const board = catalog.getBoard(project.board)
  if (!board) return []
  return board.pins
    .filter((p) => p.type === 'digital_io' || p.type === 'digital_in')
    .map((p) => `board.${p.id}`)
}

// ----- styles -----

const sectionLabel: React.CSSProperties = {
  fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 2
}
const row: React.CSSProperties = { display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }
const select: React.CSSProperties = {
  background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
  borderRadius: 3, padding: '2px 4px', fontSize: 11, fontFamily: 'SF Mono, monospace'
}
const numInput: React.CSSProperties = { ...select, padding: '2px 4px' }
const textInput: React.CSSProperties = { ...select }
const muted: React.CSSProperties = { color: '#888', fontSize: 10 }
const iconBtn: React.CSSProperties = {
  background: 'transparent', color: '#888', border: '1px solid #333',
  borderRadius: 2, padding: '0 6px', fontSize: 10, cursor: 'pointer', lineHeight: '18px'
}
const tinyBtn: React.CSSProperties = { ...iconBtn, minWidth: 20 }
const primaryBtn: React.CSSProperties = {
  background: '#2a3140', color: '#fff', border: '1px solid #4a90d9',
  borderRadius: 3, padding: '3px 10px', fontSize: 11, cursor: 'pointer'
}
const addBtn: React.CSSProperties = {
  background: '#1a1a1a', color: '#9ac5ff', border: '1px solid #2a3a50',
  borderRadius: 2, padding: '1px 6px', fontSize: 10, cursor: 'pointer',
  fontFamily: 'SF Mono, monospace'
}
