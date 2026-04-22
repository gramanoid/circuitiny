import { useEffect } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import Viewer3D from './panes/Viewer3D'
import SchematicTabs from './panes/SchematicTabs'
import CodeBuildTabs from './panes/CodeBuildTabs'
import ChatPane from './panes/ChatPane'
import CatalogEditor3D from './panes/CatalogEditor3D'
import CatalogEditorPanel from './panes/CatalogEditorPanel'
import Palette from './panes/Palette'
import { useStore } from './store'
import { hydrateCatalog } from './catalog/hydrate'

export default function App() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const bump = useStore((s) => s.bumpCatalog)

  useEffect(() => {
    hydrateCatalog().then((n) => { if (n > 0) bump() }).catch(() => { /* ignore */ })
  }, [bump])

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
    <PanelGroup direction="horizontal" autoSaveId="esp-ai:project">
      <Panel defaultSize={15} minSize={10} maxSize={30}>
        <PaneFrame title="Palette"><Palette /></PaneFrame>
      </Panel>
      <ResizeH />
      <Panel defaultSize={60} minSize={20}>
        <PanelGroup direction="vertical" autoSaveId="esp-ai:project:center">
          <Panel defaultSize={70} minSize={20}>
            <PanelGroup direction="horizontal" autoSaveId="esp-ai:project:center:top">
              <Panel defaultSize={60} minSize={20}>
                <PaneFrame title="3D Viewer" noPad><Viewer3D /></PaneFrame>
              </Panel>
              <ResizeH />
              <Panel defaultSize={40} minSize={15}>
                <PaneFrame title="Schematic / Behaviors" noPad><SchematicTabs /></PaneFrame>
              </Panel>
            </PanelGroup>
          </Panel>
          <ResizeV />
          <Panel defaultSize={30} minSize={10}>
            <PaneFrame title="Code / Build" noPad><CodeBuildTabs /></PaneFrame>
          </Panel>
        </PanelGroup>
      </Panel>
      <ResizeH />
      <Panel defaultSize={25} minSize={15} maxSize={40}>
        <PaneFrame title="Agent" noPad><ChatPane /></PaneFrame>
      </Panel>
    </PanelGroup>
  )
}

function CatalogEditorMode() {
  return (
    <PanelGroup direction="horizontal" autoSaveId="esp-ai:editor">
      <Panel defaultSize={70} minSize={30}>
        <PaneFrame title="Component Editor — click on the model to add a pin" noPad><CatalogEditor3D /></PaneFrame>
      </Panel>
      <ResizeH />
      <Panel defaultSize={30} minSize={15} maxSize={50}>
        <PaneFrame title="Pins"><CatalogEditorPanel /></PaneFrame>
      </Panel>
    </PanelGroup>
  )
}

function PaneFrame({ title, children, noPad }: { title: string; children: React.ReactNode; noPad?: boolean }) {
  return (
    <section className="pane" style={{ height: '100%' }}>
      <header>{title}</header>
      <div className="body" style={noPad ? { padding: 0, overflow: 'hidden' } : undefined}>{children}</div>
    </section>
  )
}

function ResizeH() {
  return <PanelResizeHandle style={{ width: 4, background: '#111', cursor: 'col-resize' }} className="resize-h" />
}

function ResizeV() {
  return <PanelResizeHandle style={{ height: 4, background: '#111', cursor: 'row-resize' }} className="resize-v" />
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: active ? '#2a3140' : 'transparent',
  color: active ? '#fff' : '#888',
  border: '1px solid ' + (active ? '#4a90d9' : '#333'),
  borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer'
})
