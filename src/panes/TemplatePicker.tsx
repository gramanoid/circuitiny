import SchematicThumbnail from './SchematicThumbnail'
import { TEMPLATES, DIFFICULTY_COLOR, type TemplateEntry } from '../templates'
import { useStore } from '../store'

function TemplateCard({ tpl, onSelect }: { tpl: TemplateEntry; onSelect: () => void }) {
  const color = DIFFICULTY_COLOR[tpl.difficulty]
  const recipe = tpl.recipe
  const firstStep = recipe.steps.length > 0 ? recipe.steps[0] : null
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
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
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

        <p style={{ margin: 0, fontSize: 10, color: '#9a9a9a', lineHeight: 1.4 }}>
          {recipe.goal}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px',
                      fontSize: 9, color: '#777', lineHeight: 1.35 }}>
          <span style={{ color: '#555' }}>time</span>
          <span>{recipe.estimatedTime}</span>
          <span style={{ color: '#555' }}>parts</span>
          <span>{recipe.requiredParts.map((p) => `${p.quantity}x ${p.componentId}`).join(', ')}</span>
          {firstStep && (
            <>
              <span style={{ color: '#555' }}>start</span>
              <span>{firstStep.title}</span>
            </>
          )}
        </div>

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
  const startRecipe = useStore((s) => s.startRecipe)

  function handleSelect(tpl: TemplateEntry) {
    loadProject(tpl.project)
    startRecipe(tpl.recipe.id)
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
