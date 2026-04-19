import { useStore, type DraftPin } from '../store'
import type { PinType } from '../project/schema'

const PIN_TYPES: PinType[] = [
  'power_in', 'power_out', 'ground',
  'digital_io', 'digital_in', 'digital_out',
  'analog_in', 'analog_out',
  'i2c_sda', 'i2c_scl',
  'spi_mosi', 'spi_miso', 'spi_sck', 'spi_cs',
  'uart_tx', 'uart_rx', 'pwm', 'nc'
]

export default function CatalogEditorPanel() {
  const draft = useStore((s) => s.draft)
  const setMeta = useStore((s) => s.setDraftMeta)
  const loadGlb = useStore((s) => s.loadDraftGlb)
  const updatePin = useStore((s) => s.updateDraftPin)
  const removePin = useStore((s) => s.removeDraftPin)
  const selectPin = useStore((s) => s.selectDraftPin)
  const reset = useStore((s) => s.resetDraft)

  async function pick() {
    const r = await window.espAI.pickGlb()
    if (r) loadGlb(r.path, r.data)
  }

  async function exportJson() {
    if (!draft.id) { alert('Set an id first'); return }
    const out = {
      id: draft.id,
      name: draft.name || draft.id,
      version: '0.1.0',
      category: draft.category,
      model: draft.glbPath?.split('/').pop() ?? 'model.glb',
      pins: draft.pins.map(({ id, label, type, position, normal }) => ({
        id, label, type, position, normal
      }))
    }
    const path = await window.espAI.writeJson(`${draft.id}.component.json`, JSON.stringify(out, null, 2))
    alert(`Saved to ${path}`)
  }

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <section>
        <Field label="ID">
          <input value={draft.id} onChange={(e) => setMeta({ id: e.target.value })}
                 placeholder="esp32-devkitc-v4" style={inputStyle} />
        </Field>
        <Field label="Name">
          <input value={draft.name} onChange={(e) => setMeta({ name: e.target.value })}
                 placeholder="ESP32 DevKitC v4" style={inputStyle} />
        </Field>
        <Field label="Category">
          <select value={draft.category} onChange={(e) => setMeta({ category: e.target.value as DraftPin['type'] extends never ? never : 'sensor' })} style={inputStyle}>
            {['sensor','actuator','display','input','power','misc'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </section>

      <section>
        <button onClick={pick} style={btnStyle}>{draft.glbPath ? '↻ Replace .glb' : '⤓ Load .glb'}</button>
        {draft.glbPath && <div style={{ fontSize: 10, color: '#888', marginTop: 4, wordBreak: 'break-all' }}>{draft.glbPath}</div>}
      </section>

      <section style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>
          {draft.pins.length} pin{draft.pins.length === 1 ? '' : 's'} — click on the model to add
        </div>
        {draft.pins.map((p) => (
          <PinRow key={p.id} pin={p}
                  selected={draft.selectedPin === p.id}
                  onSelect={() => selectPin(p.id)}
                  onChange={(patch) => updatePin(p.id, patch)}
                  onRemove={() => removePin(p.id)} />
        ))}
      </section>

      <section style={{ display: 'flex', gap: 6 }}>
        <button onClick={exportJson} style={{ ...btnStyle, flex: 1 }}>Export component.json</button>
        <button onClick={reset} style={{ ...btnStyle, background: '#3a2222' }}>Reset</button>
      </section>
    </div>
  )
}

function PinRow({ pin, selected, onSelect, onChange, onRemove }: {
  pin: DraftPin
  selected: boolean
  onSelect: () => void
  onChange: (p: Partial<DraftPin>) => void
  onRemove: () => void
}) {
  return (
    <div onClick={onSelect}
         style={{ padding: 6, marginBottom: 4, borderRadius: 4,
                  background: selected ? '#2a3140' : '#202020',
                  border: `1px solid ${selected ? '#4a90d9' : '#333'}`, cursor: 'pointer' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input value={pin.id} onChange={(e) => onChange({ id: e.target.value })}
               style={{ ...inputStyle, flex: 1, fontSize: 11 }} placeholder="id" />
        <input value={pin.label} onChange={(e) => onChange({ label: e.target.value })}
               style={{ ...inputStyle, flex: 1, fontSize: 11 }} placeholder="label" />
        <button onClick={(e) => { e.stopPropagation(); onRemove() }}
                style={{ ...btnStyle, padding: '2px 6px', background: '#3a2222' }}>×</button>
      </div>
      <select value={pin.type} onChange={(e) => onChange({ type: e.target.value as PinType })}
              style={{ ...inputStyle, marginTop: 4, fontSize: 11, width: '100%' }}>
        {PIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>
        ({pin.position.map(n => n.toFixed(4)).join(', ')})
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
  borderRadius: 3, padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box'
}
const btnStyle: React.CSSProperties = {
  background: '#2a2a2a', color: '#ddd', border: '1px solid #444',
  borderRadius: 3, padding: '6px 10px', fontSize: 12, cursor: 'pointer'
}
