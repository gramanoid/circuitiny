import { useState } from 'react'
import Schematic from './Schematic'
import BehaviorsPane from './BehaviorsPane'
import { useStore } from '../store'

type Tab = 'schematic' | 'behaviors'

export default function SchematicTabs() {
  const [tab, setTab] = useState<Tab>('schematic')
  const behaviorCount = useStore((s) => s.project.behaviors.length)
  const componentCount = useStore((s) => s.project.components.length)
  const showNudge = tab === 'schematic' && componentCount > 0 && behaviorCount === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #222',
                    background: '#151515' }}>
        <button onClick={() => setTab('schematic')} style={tabBtn(tab === 'schematic')}>Schematic</button>
        <button onClick={() => setTab('behaviors')} style={tabBtn(tab === 'behaviors')}>
          Behaviors{behaviorCount > 0 ? ` (${behaviorCount})` : ''}
        </button>
      </div>
      {showNudge && (
        <div style={{ padding: '5px 10px', background: '#121c2a', borderBottom: '1px solid #1e3050',
                      fontSize: 10, color: '#7aabdf', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Components added — now give them something to do</span>
          <button onClick={() => setTab('behaviors')}
                  style={{ background: '#1a3050', color: '#7aabdf', border: '1px solid #2a5080',
                           borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>
            Open Behaviors →
          </button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'schematic' ? <Schematic /> : <BehaviorsPane />}
      </div>
    </div>
  )
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  background: active ? '#2a3140' : 'transparent',
  color: active ? '#fff' : '#888',
  border: '1px solid ' + (active ? '#4a90d9' : '#333'),
  borderRadius: 3, padding: '2px 10px', fontSize: 10, cursor: 'pointer',
  fontFamily: "'SF Mono', Menlo, monospace"
})
