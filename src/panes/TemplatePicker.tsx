import SchematicThumbnail from './SchematicThumbnail'
import { TEMPLATES, DIFFICULTY_COLOR, type TemplateEntry } from '../templates'
import { useStore } from '../store'

function TemplateCard({ tpl, onSelect }: { tpl: TemplateEntry; onSelect: () => void }) {
  const color = DIFFICULTY_COLOR[tpl.difficulty]
  return (
    <button
      onClick={onSelect}
      style={{
        background: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: 8,
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        color: '#ddd',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#4a90d9')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
    >
      {/* Thumbnail */}
      <div style={{ height: 90, background: '#0a0a0a', borderBottom: '1px solid #1e1e1e' }}>
        <SchematicThumbnail project={tpl.project} />
      </div>

      {/* Card body */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: '#eee' }}>{tpl.title}</span>
          <span style={{
            background: color + '22',
            color,
            border: `1px solid ${color}44`,
            borderRadius: 3,
            fontSize: 9,
            padding: '1px 5px',
            fontFamily: 'monospace',
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
          }}>{tpl.difficulty}</span>
        </div>

        <p style={{ margin: 0, fontSize: 10, color: '#888', lineHeight: 1.4 }}>
          {tpl.description}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {tpl.tags.map((tag) => (
            <span key={tag} style={{
              background: '#2a2a2a',
              border: '1px solid #3a3a3a',
              borderRadius: 3,
              fontSize: 9,
              padding: '1px 5px',
              color: '#aaa',
            }}>{tag}</span>
          ))}
        </div>
      </div>
    </button>
  )
}

export default function TemplatePicker({ onClose }: { onClose: () => void }) {
  const loadProject = useStore((s) => s.loadProject)

  function handleSelect(tpl: TemplateEntry) {
    loadProject(tpl.project)
    onClose()
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: 12,
      padding: 24,
      overflowY: 'auto',
      flex: 1,
      alignContent: 'start',
    }}>
      {TEMPLATES.map((tpl) => (
        <TemplateCard key={tpl.id} tpl={tpl} onSelect={() => handleSelect(tpl)} />
      ))}
    </div>
  )
}
