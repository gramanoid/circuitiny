import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, Html, CubicBezierLine, TransformControls, useGLTF } from '@react-three/drei'
import { useStore } from '../store'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import * as THREE from 'three'
import type { ComponentInstance } from '../project/schema'
import type { PinDef } from '../project/component'
import { catalog, pinColor } from '../catalog'
import { resolvePin, netColor } from '../project/pins'
import { runDrc, suggestSafePin, type Violation } from '../drc'
import { stepBehaviors, initialGpios } from '../sim/evaluate'

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
      <mesh renderOrder={10}
            onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick() }}>
        <sphereGeometry args={[0.0012, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow}
                              depthTest={false} depthWrite={false} />
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

// Generic PCB placeholder sized to the board's actual pin bounding box.
// Used when no GLB is registered yet (M2 pending).
function BoardMesh({ board }: { board: import('../project/component').BoardDef }) {
  const edgePins = board.pins.filter((p) => p.normal[1] > 0)  // top-facing (edge headers)

  const xs = edgePins.map((p) => p.position[0])
  const zs = edgePins.map((p) => p.position[2])
  const minX = xs.length ? Math.min(...xs) : -0.027
  const maxX = xs.length ? Math.max(...xs) : 0.027
  const minZ = zs.length ? Math.min(...zs) : -0.014
  const maxZ = zs.length ? Math.max(...zs) : 0.014

  // PCB outline with a small margin around the pin extents
  const margin = 0.004
  const pcbW = (maxX - minX) + margin * 2        // long axis (x)
  const pcbD = (maxZ - minZ) + margin * 2        // short axis (z)
  const cx   = (minX + maxX) / 2
  const cz   = (minZ + maxZ) / 2

  // Unique z values → one header rail per unique z (left / right long edges)
  const uniqueZ = [...new Set(zs.map((z) => Math.round(z * 10000) / 10000))]

  // USB stub at the -x end (anti-USB end is +x for DevKitC convention,
  // but we have no orientation info — place it at the -x end as a placeholder)
  const usbX = minX - 0.004

  return (
    <group>
      {/* PCB body */}
      <mesh position={[cx, 0.005, cz]} castShadow receiveShadow>
        <boxGeometry args={[pcbW, 0.0016, pcbD]} />
        <meshStandardMaterial color="#1f4f3a" roughness={0.6} />
      </mesh>
      {/* USB connector stub */}
      <mesh position={[usbX, 0.009, cz]} castShadow>
        <boxGeometry args={[0.008, 0.006, 0.008]} />
        <meshStandardMaterial color="#aaa" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Module shield can — approximate, centered on PCB */}
      <mesh position={[cx + pcbW * 0.1, 0.008, cz]} castShadow>
        <boxGeometry args={[pcbW * 0.38, 0.003, pcbD * 0.65]} />
        <meshStandardMaterial color="#ddd" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Pin header rails — one per unique z edge */}
      {uniqueZ.map((z) => (
        <mesh key={z} position={[cx, 0.0062, z]}>
          <boxGeometry args={[pcbW - margin, 0.002, 0.0025]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
      ))}
    </group>
  )
}

function BoardWithPins() {
  const project = useStore((s) => s.project)
  const pendingPin = useStore((s) => s.pendingPin)
  const clickPin = useStore((s) => s.clickPin)
  const board = catalog.getBoard(project.board)
  if (!board) return null
  const glbUrl = catalog.getGlbUrl(board.id)
  return (
    <group>
      {glbUrl ? <LoadedGlb url={glbUrl} /> : <BoardMesh board={board} />}
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

function LoadedGlb({ url, scale = 1 }: { url: string; scale?: number }) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])
  return <primitive object={scene} scale={[scale, scale, scale]} />
}

function DefaultBody({ componentId, onClick, selected, lit }: {
  componentId: string
  onClick: (e: ThreeEvent<MouseEvent>) => void
  selected: boolean
  lit?: boolean
}) {
  // LED: dome + two leads. Anything else: red cube fallback.
  if (componentId === 'led-5mm-red') {
    const emissive = lit ? '#ff3030' : (selected ? '#551100' : '#220000')
    const emissiveIntensity = lit ? 3 : 1
    return (
      <group onClick={onClick}>
        {lit && <pointLight position={[0, 0.002, 0]} intensity={0.02} distance={0.05} color="#ff4040" />}
        <mesh position={[0, 0, 0]} castShadow>
          <sphereGeometry args={[0.0025, 16, 12]} />
          <meshStandardMaterial color="#ff1a1a" transparent opacity={0.65}
                                emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
        <mesh position={[0, -0.0025, 0]}>
          <cylinderGeometry args={[0.0025, 0.0025, 0.001, 16]} />
          <meshStandardMaterial color="#ff2222" transparent opacity={0.85}
                                emissive={emissive} emissiveIntensity={emissiveIntensity * 0.5} />
        </mesh>
        {/* anode lead (longer) */}
        <mesh position={[-0.0012, -0.005, 0]}>
          <cylinderGeometry args={[0.0003, 0.0003, 0.006, 8]} />
          <meshStandardMaterial color="#c0c0c0" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* cathode lead (shorter) */}
        <mesh position={[0.0012, -0.004, 0]}>
          <cylinderGeometry args={[0.0003, 0.0003, 0.005, 8]} />
          <meshStandardMaterial color="#c0c0c0" metalness={0.85} roughness={0.3} />
        </mesh>
      </group>
    )
  }
  return (
    <mesh onClick={onClick}>
      <boxGeometry args={[0.006, 0.006, 0.006]} />
      <meshStandardMaterial color={selected ? '#ffaa00' : '#cc3333'} emissive={selected ? '#552200' : '#000'} />
    </mesh>
  )
}

function ComponentWithPins({ c, selected, lit }: { c: ComponentInstance; selected: boolean; lit: boolean }) {
  const select = useStore((s) => s.select)
  const pendingPin = useStore((s) => s.pendingPin)
  const clickPin = useStore((s) => s.clickPin)
  const move = useStore((s) => s.moveComponent)
  const def = catalog.getComponent(c.componentId)
  const glbUrl = catalog.getGlbUrl(c.componentId)
  const pos = c.position ?? [0, 0.01, 0]
  const groupRef = useRef<THREE.Group>(null)

  const content = (
    <group ref={groupRef} position={pos}>
      <group onClick={(e) => { e.stopPropagation(); select(c.instance) }}>
        {glbUrl
          ? <LoadedGlb url={glbUrl} scale={def?.scale ?? 1} />
          : <DefaultBody componentId={c.componentId} selected={selected} lit={lit} onClick={() => select(c.instance)} />}
      </group>
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

  if (!selected) return content
  return (
    <>
      {content}
      <TransformControls
        object={groupRef as unknown as THREE.Object3D}
        mode="translate"
        size={0.4}
        showY={false}
        onMouseUp={() => {
          const g = groupRef.current
          if (g) move(c.instance, [g.position.x, g.position.y, g.position.z])
        }}
      />
    </>
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

const FIXABLE = new Set<string>([
  'esp32.gpio.input_only', 'esp32.gpio.flash_pin', 'esp32.gpio.strapping'
])

function DrcOverlay({ result }: { result: ReturnType<typeof runDrc> }) {
  const project = useStore((s) => s.project)
  const rewire = useStore((s) => s.rewireBoardPin)
  const all = [...result.errors, ...result.warnings]
  const sig = all.map((v) => v.id + ':' + v.involves.join(',')).join('|')
  const [dismissedSig, setDismissedSig] = useState<string | null>(null)
  if (all.length === 0) return null
  if (dismissedSig === sig) return null

  const findNetId = (endpoints: string[]): string | null => {
    const set = new Set(endpoints)
    const match = project.nets.find((n) =>
      n.endpoints.length === endpoints.length && n.endpoints.every((e) => set.has(e)))
    return match?.id ?? null
  }

  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, maxWidth: 320, maxHeight: '60%', overflow: 'auto',
      background: 'rgba(20,20,20,0.92)', border: '1px solid #333', borderRadius: 4,
      padding: 8, fontSize: 11, color: '#ddd', zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 'bold', flex: 1 }}>
          DRC: {result.errors.length} error{result.errors.length === 1 ? '' : 's'},
          {' '}{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
        </div>
        <button onClick={() => setDismissedSig(sig)}
                title="Dismiss until something changes"
                style={{ background: 'transparent', color: '#888', border: '1px solid #333',
                         borderRadius: 2, padding: '0 6px', fontSize: 11, cursor: 'pointer',
                         lineHeight: '16px' }}>×</button>
      </div>
      {all.map((v, i) => {
        const netId = FIXABLE.has(v.id) ? findNetId(v.involves) : null
        const safe = netId ? suggestSafePin(project, netId) : null
        return (
          <div key={i} style={{ marginBottom: 4, padding: 4,
                                borderLeft: `3px solid ${v.severity === 'error' ? '#ff3b30' : '#ffcc00'}`,
                                background: '#1a1a1a' }}>
            <div>{v.message}</div>
            <div style={{ fontSize: 9, color: '#888' }}>{v.involves.join(' ↔ ')}</div>
            {netId && safe && (
              <button onClick={() => rewire(netId, safe)}
                      style={{ marginTop: 4, background: '#2a3140', color: '#fff',
                               border: '1px solid #4a90d9', borderRadius: 2, padding: '2px 8px',
                               fontSize: 10, cursor: 'pointer' }}>
                Fix → board.{safe}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SimControls({ canRun }: { canRun: boolean }) {
  const simulating = useStore((s) => s.simulating)
  const setSim = useStore((s) => s.setSimulating)
  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, background: 'rgba(20,20,20,0.92)',
      border: '1px solid #333', borderRadius: 4, padding: 4, zIndex: 10,
      display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: '#ddd'
    }}>
      <button
        onClick={() => setSim(!simulating)}
        disabled={!simulating && !canRun}
        title={simulating ? 'Stop simulation' : canRun ? 'Start simulation' : 'Fix DRC errors first'}
        style={{
          background: simulating ? '#402020' : (canRun ? '#203a20' : '#1a1a1a'),
          color: canRun || simulating ? '#fff' : '#666',
          border: '1px solid ' + (simulating ? '#ff6b6b' : canRun ? '#4a9d4a' : '#333'),
          borderRadius: 3, padding: '2px 10px', fontSize: 11,
          cursor: (simulating || canRun) ? 'pointer' : 'not-allowed'
        }}>
        {simulating ? '■ Stop' : '▶ Play'}
      </button>
      <span style={{ fontSize: 10, color: '#888' }}>
        {simulating ? 'simulating' : canRun ? 'ready' : 'DRC errors'}
      </span>
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

const SIM_TICK_MS = 100

export default function Viewer3D() {
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const cancel = useStore((s) => s.cancelWire)
  const simulating = useStore((s) => s.simulating)
  const simGpios = useStore((s) => s.simGpios)
  const setSim = useStore((s) => s.setSimulating)

  const drc = useMemo(() => runDrc(project), [project])
  const canRun = drc.errors.length === 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  useEffect(() => {
    if (simulating && !canRun) setSim(false)
  }, [simulating, canRun, setSim])

  // On start: seed GPIOs, emit DRC warnings into the log, fire boot triggers.
  useEffect(() => {
    if (!simulating) return
    const preflight = runDrc(project).warnings.map(
      (w) => `⚠ [preflight] ${w.message}`
    )
    const seed = initialGpios(project)
    const first = stepBehaviors(project, 0, seed, 0)
    useStore.setState((s) => ({
      simGpios: first.gpios,
      simLog: [...s.simLog, ...preflight, ...first.logs].slice(-200)
    }))
    const id = window.setInterval(() => {
      const s = useStore.getState()
      if (!s.simulating) return
      const step = stepBehaviors(s.project, s.simTime, s.simGpios, SIM_TICK_MS)
      s.simStep(SIM_TICK_MS, step.gpios, step.logs)
    }, SIM_TICK_MS)
    return () => window.clearInterval(id)
    // Re-seed only on sim start; project edits during sim are picked up via getState above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating])

  const litInstances = useMemo(() => {
    if (!simulating) return new Set<string>()
    return computeLitLeds(project, simGpios)
  }, [simulating, project, simGpios])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows camera={{ position: [0.12, 0.1, 0.12], fov: 40, near: 0.001, far: 10 }}
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
            <ComponentWithPins key={c.instance} c={c}
                               selected={selected === c.instance}
                               lit={litInstances.has(c.instance)} />
          ))}
          <Nets violations={[...drc.errors, ...drc.warnings]} />
          <OrbitControls makeDefault target={[0, 0, 0]} />
        </Suspense>
      </Canvas>
      <SimControls canRun={canRun} />
      <DrcOverlay result={drc} />
      <PendingHint />
    </div>
  )
}

// Walk the net graph from startPin, crossing through passive components (those
// with exactly 2 pins, e.g. resistors), until a board.* endpoint is found.
// Returns the board pin id or null. Visited set prevents infinite loops.
function findBoardGpio(
  project: ReturnType<typeof useStore.getState>['project'],
  startPin: string,
  visited = new Set<string>()
): string | null {
  if (visited.has(startPin)) return null
  visited.add(startPin)
  const net = project.nets.find((n) => n.endpoints.includes(startPin))
  if (!net) return null
  for (const ep of net.endpoints) {
    if (ep === startPin) continue
    if (ep.startsWith('board.')) return ep.split('.')[1]
    // ep is a component pin — cross through if the component is passive (2 pins)
    const [inst] = ep.split('.')
    const comp = project.components.find((c) => c.instance === inst)
    if (!comp) continue
    const def = catalog.getComponent(comp.componentId)
    if (!def || def.pins.length !== 2) continue
    // walk out the other pin of this passive
    for (const p of def.pins) {
      const other = `${inst}.${p.id}`
      if (other !== ep) {
        const result = findBoardGpio(project, other, visited)
        if (result) return result
      }
    }
  }
  return null
}

// An LED is lit when the GPIO driving its anode (possibly via passives) is high.
function computeLitLeds(
  project: ReturnType<typeof useStore.getState>['project'],
  simGpios: Record<string, boolean>
): Set<string> {
  const out = new Set<string>()
  const board = catalog.getBoard(project.board)
  if (!board) return out
  for (const c of project.components) {
    const def = catalog.getComponent(c.componentId)
    if (!def || !def.pins.some((p) => p.id === 'anode')) continue
    const boardPinId = findBoardGpio(project, `${c.instance}.anode`)
    if (!boardPinId) continue
    const label = board.pins.find((p) => p.id === boardPinId)?.label
    if (label && simGpios[label]) out.add(c.instance)
  }
  return out
}
