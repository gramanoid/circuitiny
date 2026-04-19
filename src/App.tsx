import Viewer3D from './panes/Viewer3D'
import Schematic from './panes/Schematic'
import CodePane from './panes/CodePane'
import ChatPane from './panes/ChatPane'

export default function App() {
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
