import { useState } from 'react'
import CodePane from './CodePane'
import BuildPane from './BuildPane'

type Tab = 'code' | 'build'

export default function CodeBuildTabs() {
  const [tab, setTab] = useState<Tab>('code')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #222',
                    background: '#151515' }}>
        <button onClick={() => setTab('code')} style={tabBtn(tab === 'code')}>Code</button>
        <button onClick={() => setTab('build')} style={tabBtn(tab === 'build')}>Build / Flash</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'code' ? <CodePane /> : <BuildPane />}
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
