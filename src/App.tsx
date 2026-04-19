import Viewer3D from './panes/Viewer3D'
import Schematic from './panes/Schematic'
import CodePane from './panes/CodePane'
import ChatPane from './panes/ChatPane'
import CatalogEditor3D from './panes/CatalogEditor3D'
import CatalogEditorPanel from './panes/CatalogEditorPanel'
import { useStore } from './store'

export default function App() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav style={{ display: 'flex', gap: 6, padding: '6px 10px', background: '#0a0a0a',
                    borderBottom: '1px solid #333', alignItems: 'center' }}>
        <strong style={{ fontSize: 12, marginRight: 12 }}>esp-ai</strong>
        <button onClick={() => setMode('project')} style={tabStyle(mode === 'project')}>Project</button>
        <button onClick={() => setMode('catalog-editor')} style={tabStyle(mode === 'catalog-editor')}>Catalog Editor</button>
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'project' ? <ProjectMode /> : <CatalogEditorMode />}
      </div>
    </div>
  )
}

function ProjectMode() {
  return (
    <div className="app">
      <section className="pane viewer">
        <header>3D Viewer</header>
        <div className="body"><Viewer3D /></div>
      </section>
      <section className="pane schematic">
        <header>Schematic</header>
        <div className="body"><Schematic /></div>
      </section>
      <section className="pane code">
        <header>main.c (generated)</header>
        <div className="body"><CodePane /></div>
      </section>
      <section className="pane chat">
        <header>Agent</header>
        <div className="body"><ChatPane /></div>
      </section>
    </div>
  )
}

function CatalogEditorMode() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100%' }}>
      <section className="pane viewer">
        <header>Component Editor — click on the model to add a pin</header>
        <div className="body"><CatalogEditor3D /></div>
      </section>
      <section className="pane chat">
        <header>Pins</header>
        <div className="body" style={{ padding: 0 }}><CatalogEditorPanel /></div>
      </section>
    </div>
  )
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: active ? '#2a3140' : 'transparent',
  color: active ? '#fff' : '#888',
  border: '1px solid ' + (active ? '#4a90d9' : '#333'),
  borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer'
})
