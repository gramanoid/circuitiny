import { useEffect, useState } from 'react'
import CodePane from './CodePane'
import BuildPane from './BuildPane'
import SimPane from './SimPane'
import { useStore } from '../store'

type Tab = 'code' | 'build' | 'sim'

export default function CodeBuildTabs() {
  const [tab, setTab] = useState<Tab>('code')
  const simulating = useStore((s) => s.simulating)

  // Switch to sim tab automatically when simulation starts.
  useEffect(() => {
    if (simulating) setTab('sim')
  }, [simulating])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #222',
                    background: '#151515', alignItems: 'center' }}>
        <button onClick={() => setTab('code')}  style={tabBtn(tab === 'code')}>Code</button>
        <button onClick={() => setTab('build')} style={tabBtn(tab === 'build')}>Build / Flash</button>
        <button onClick={() => setTab('sim')}   style={tabBtn(tab === 'sim', simulating)}>
          {simulating ? '▶ Sim' : 'Sim'}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'code'  && <CodePane />}
        {tab === 'build' && <BuildPane />}
        {tab === 'sim'   && <SimPane />}
      </div>
    </div>
  )
}

const tabBtn = (active: boolean, running?: boolean): React.CSSProperties => ({
  background: active ? '#2a3140' : 'transparent',
  color: running ? '#7edd7e' : (active ? '#fff' : '#888'),
  border: '1px solid ' + (active ? '#4a90d9' : (running ? '#4a9d4a33' : '#333')),
  borderRadius: 3, padding: '2px 10px', fontSize: 10, cursor: 'pointer',
  fontFamily: "'SF Mono', Menlo, monospace",
})
