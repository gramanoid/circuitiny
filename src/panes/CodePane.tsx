import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { generate } from '../codegen/generate'

type FileKey = keyof ReturnType<typeof generate>['files']

const FILES: FileKey[] = ['main/app_main.c', 'main/CMakeLists.txt', 'sdkconfig.defaults']

export default function CodePane() {
  const project = useStore((s) => s.project)
  const [active, setActive] = useState<FileKey>('main/app_main.c')
  const { files, ir } = useMemo(() => generate(project), [project])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #222',
                    alignItems: 'center' }}>
        {FILES.map((f) => (
          <button key={f} onClick={() => setActive(f)} style={tabStyle(active === f)}>
            {f}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>
          {ir.components.length} comps · {ir.buses.length} buses
          {ir.issues.length > 0 && <span style={{ color: '#ffcc00' }}> · {ir.issues.length} unwired</span>}
        </div>
      </div>
      <pre style={{
        flex: 1, margin: 0, overflow: 'auto', padding: 10,
        fontFamily: "'SF Mono', Menlo, monospace", fontSize: 11, lineHeight: 1.45,
        color: '#ddd', background: '#0f0f0f', whiteSpace: 'pre'
      }}>{files[active]}</pre>
    </div>
  )
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: active ? '#2a3140' : 'transparent',
  color: active ? '#fff' : '#888',
  border: '1px solid ' + (active ? '#4a90d9' : '#333'),
  borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
  fontFamily: "'SF Mono', Menlo, monospace"
})
