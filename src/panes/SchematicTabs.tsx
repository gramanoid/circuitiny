import { useState } from 'react'
import Schematic from './Schematic'
import BehaviorsPane from './BehaviorsPane'
import { useStore } from '../store'

type Tab = 'schematic' | 'behaviors'

export default function SchematicTabs() {
  const [tab, setTab] = useState<Tab>('schematic')
  const behaviorCount = useStore((s) => s.project.behaviors.length)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #222',
                    background: '#151515' }}>
        <button onClick={() => setTab('schematic')} style={tabBtn(tab === 'schematic')}>Schematic</button>
        <button onClick={() => setTab('behaviors')} style={tabBtn(tab === 'behaviors')}>
          Behaviors{behaviorCount > 0 ? ` (${behaviorCount})` : ''}
        </button>
      </div>
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
