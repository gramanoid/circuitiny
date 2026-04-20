import { useStore } from '../store'
import { catalog } from '../catalog'

export default function Palette() {
  // depend on catalogVersion so this re-renders after disk hydration
  useStore((s) => s.catalogVersion)
  const project = useStore((s) => s.project)
  const add = useStore((s) => s.addComponent)
  const remove = useStore((s) => s.removeComponent)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selected)

  const items = catalog.listComponents()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      <section style={{ padding: 8, borderBottom: '1px solid #222' }}>
        <div style={{ color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>
          Catalog ({items.length})
        </div>
        {items.length === 0 && (
          <div style={{ color: '#666', fontSize: 10 }}>No components. Use Catalog Editor to create some.</div>
        )}
        {items.map((c) => (
          <button key={c.id}
                  onClick={() => add(c.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: '#1e1e1e', color: '#ddd', border: '1px solid #2a2a2a',
                    borderRadius: 3, padding: '6px 8px', marginBottom: 3, cursor: 'pointer'
                  }}>
            <div style={{ fontWeight: 500 }}>{c.name}</div>
            <div style={{ color: '#666', fontSize: 9 }}>{c.category} · {c.pins.length} pins</div>
          </button>
        ))}
      </section>

      <section style={{ padding: 8, flex: 1, overflow: 'auto' }}>
        <div style={{ color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>
          Instances ({project.components.length})
        </div>
        {project.components.map((c) => (
          <div key={c.instance}
               onClick={() => select(c.instance)}
               style={{
                 display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                 padding: '4px 6px', marginBottom: 2, borderRadius: 3, cursor: 'pointer',
                 background: selected === c.instance ? '#2a3140' : '#1a1a1a',
                 border: `1px solid ${selected === c.instance ? '#4a90d9' : '#2a2a2a'}`
               }}>
            <div>
              <div>{c.instance}</div>
              <div style={{ fontSize: 9, color: '#666' }}>{c.componentId}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); remove(c.instance) }}
                    style={{ background: '#3a2222', color: '#ddd', border: '1px solid #533',
                             borderRadius: 2, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>×</button>
          </div>
        ))}
      </section>
    </div>
  )
}
