import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, Html, CubicBezierLine } from '@react-three/drei'
import { useStore } from '../store'
import { Suspense, useEffect, useMemo, type ReactElement } from 'react'
import type { ComponentInstance } from '../project/schema'
import type { PinDef } from '../project/component'
import { catalog, pinColor } from '../catalog'
import { resolvePin, netColor } from '../project/pins'
import { runDrc, type Violation } from '../drc'

function PinAnchor({ pin, owner, position, color, glow, onClick }: {
  pin: PinDef
  owner: string
  position: [number, number, number]
  color: string
  glow: number
  onClick: () => void
}) {
  return (
    <group position={position}>
      <mesh onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick() }}>
        <sphereGeometry args={[0.0009, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} />
      </mesh>
      {glow > 0.5 && (
        <Html distanceFactor={0.1} style={{ pointerEvents: 'none' }}>
          <div style={{ background: '#222', color: '#eee', padding: '2px 6px',
                        borderRadius: 3, fontSize: 10, whiteSpace: 'nowrap',
                        border: `1px solid ${color}`, transform: 'translate(8px,-50%)' }}>
            {owner}.{pin.id}
          </div>
        </Html>
      )}
    </group>
  )
}

function BoardWithPins() {
  const project = useStore((s) => s.project)
  const pendingPin = useStore((s) => s.pendingPin)
  const clickPin = useStore((s) => s.clickPin)
  const board = catalog.getBoard(project.board)
  if (!board) return null
  return (
    <group>
      <mesh position={[0, 0.005, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.055, 0.002, 0.028]} />
        <meshStandardMaterial color="#1f4f3a" />
      </mesh>
      <mesh position={[-0.027, 0.009, 0]}>
        <boxGeometry args={[0.008, 0.006, 0.012]} />
        <meshStandardMaterial color="#888" metalness={0.7} roughness={0.3} />
      </mesh>
      {board.pins.map((p) => {
        const ref = `board.${p.id}`
        const isPending = pendingPin === ref
        return (
          <PinAnchor key={p.id} pin={p} owner="board"
                     position={p.position}
                     color={pinColor(p.type)}
                     glow={isPending ? 1 : 0.2}
                     onClick={() => clickPin(ref)} />
        )
      })}
    </group>
  )
}

function ComponentWithPins({ c, selected }: { c: ComponentInstance; selected: boolean }) {
  const select = useStore((s) => s.select)
  const pendingPin = useStore((s) => s.pendingPin)
  const clickPin = useStore((s) => s.clickPin)
  const def = catalog.getComponent(c.componentId)
  const pos = c.position ?? [0, 0.01, 0]
  return (
    <group position={pos}>
      <mesh onClick={(e) => { e.stopPropagation(); select(c.instance) }}>
        <boxGeometry args={[0.006, 0.006, 0.006]} />
        <meshStandardMaterial color={selected ? '#ffaa00' : '#cc3333'} emissive={selected ? '#552200' : '#000'} />
      </mesh>
      {def?.pins.map((p) => {
        const ref = `${c.instance}.${p.id}`
        const isPending = pendingPin === ref
        return (
          <PinAnchor key={p.id} pin={p} owner={c.instance}
                     position={p.position}
                     color={pinColor(p.type)}
                     glow={isPending ? 1 : 0.2}
                     onClick={() => clickPin(ref)} />
        )
      })}
    </group>
  )
}

function Nets({ violations }: { violations: Violation[] }) {
  const project = useStore((s) => s.project)
  const removeNet = useStore((s) => s.removeNet)
  const errorRefs = new Set(violations.filter(v => v.severity === 'error').flatMap(v => v.involves))
  const warnRefs = new Set(violations.filter(v => v.severity === 'warning').flatMap(v => v.involves))

  return (
    <>
      {project.nets.flatMap((net) => {
        const resolved = net.endpoints.map((e) => resolvePin(project, e)).filter((r): r is NonNullable<typeof r> => !!r)
        const types = resolved.map((r) => r.type)
        const isError = net.endpoints.some(e => errorRefs.has(e))
        const isWarn = !isError && net.endpoints.some(e => warnRefs.has(e))
        const baseColor = isError ? '#ff3b30' : isWarn ? '#ffcc00' : netColor(types)
        // draw chained beziers a..b, b..c, etc.
        const segments: ReactElement[] = []
        for (let i = 0; i < resolved.length - 1; i++) {
          const a = resolved[i], b = resolved[i + 1]
          const lift = 0.015
          const ca: [number, number, number] = [a.position[0], a.position[1] + lift, a.position[2]]
          const cb: [number, number, number] = [b.position[0], b.position[1] + lift, b.position[2]]
          segments.push(
            <CubicBezierLine key={`${net.id}-${i}`}
              start={a.position} midA={ca} midB={cb} end={b.position}
              color={baseColor} lineWidth={isError ? 3 : 2}
              onClick={() => { if (confirm(`Delete net ${net.id}?`)) removeNet(net.id) }} />
          )
        }
        return segments
      })}
    </>
  )
}

function DrcOverlay({ result }: { result: ReturnType<typeof runDrc> }) {
  const all = [...result.errors, ...result.warnings]
  if (all.length === 0) return null
  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, maxWidth: 300, maxHeight: '60%', overflow: 'auto',
      background: 'rgba(20,20,20,0.92)', border: '1px solid #333', borderRadius: 4,
      padding: 8, fontSize: 11, color: '#ddd', zIndex: 10
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
        DRC: {result.errors.length} error{result.errors.length === 1 ? '' : 's'},
        {' '}{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
      </div>
      {all.map((v, i) => (
        <div key={i} style={{ marginBottom: 4, padding: 4,
                              borderLeft: `3px solid ${v.severity === 'error' ? '#ff3b30' : '#ffcc00'}`,
                              background: '#1a1a1a' }}>
          <div>{v.message}</div>
          <div style={{ fontSize: 9, color: '#888' }}>{v.involves.join(' ↔ ')}</div>
        </div>
      ))}
    </div>
  )
}

function PendingHint() {
  const pendingPin = useStore((s) => s.pendingPin)
  const cancel = useStore((s) => s.cancelWire)
  if (!pendingPin) return null
  return (
    <div style={{
      position: 'absolute', bottom: 8, left: 8, background: 'rgba(20,20,20,0.92)',
      border: '1px solid #4a90d9', borderRadius: 4, padding: '4px 8px',
      fontSize: 11, color: '#ddd', zIndex: 10
    }}>
      Wiring from <b>{pendingPin}</b> — click target pin (or Esc to cancel)
      <button onClick={cancel} style={{ marginLeft: 8, background: 'transparent', color: '#888',
                                        border: '1px solid #444', borderRadius: 2, fontSize: 10, cursor: 'pointer' }}>
        Esc
      </button>
    </div>
  )
}

export default function Viewer3D() {
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const cancel = useStore((s) => s.cancelWire)

  const drc = useMemo(() => runDrc(project), [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows camera={{ position: [0.12, 0.1, 0.12], fov: 40 }}
              style={{ background: '#0e0e0e' }}
              onPointerMissed={() => select(null)}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[0.2, 0.3, 0.2]} intensity={1.2} castShadow />
          <Environment preset="city" />
          <Grid args={[1, 1]} cellSize={0.005} sectionSize={0.05}
                cellColor="#333" sectionColor="#555" fadeDistance={0.5} infiniteGrid />
          <BoardWithPins />
          {project.components.map((c) => (
            <ComponentWithPins key={c.instance} c={c} selected={selected === c.instance} />
          ))}
          <Nets violations={[...drc.errors, ...drc.warnings]} />
          <OrbitControls makeDefault target={[0, 0, 0]} />
        </Suspense>
      </Canvas>
      <DrcOverlay result={drc} />
      <PendingHint />
    </div>
  )
}
