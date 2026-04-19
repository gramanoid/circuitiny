import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, Html } from '@react-three/drei'
import { useStore } from '../store'
import { Suspense, useState } from 'react'
import type { ComponentInstance } from '../project/schema'
import type { PinDef } from '../project/component'
import { catalog, pinColor } from '../catalog'

type HoveredPin = { owner: string; pin: PinDef } | null

// Placeholder board ~ ESP32 DevKitC dimensions (meters).
function BoardPlaceholder({ onPinHover, hovered }: {
  onPinHover: (h: HoveredPin) => void
  hovered: HoveredPin
}) {
  const board = catalog.getBoard('esp32-devkitc-v4')!
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
      {board.pins.map((p) => (
        <PinAnchor
          key={p.id}
          pin={p}
          owner="board"
          isHovered={hovered?.owner === 'board' && hovered.pin.id === p.id}
          onHover={onPinHover}
        />
      ))}
    </group>
  )
}

function PinAnchor({ pin, owner, isHovered, onHover }: {
  pin: PinDef
  owner: string
  isHovered: boolean
  onHover: (h: HoveredPin) => void
}) {
  const color = pinColor(pin.type)
  const r = isHovered ? 0.0012 : 0.0008
  return (
    <group position={pin.position}>
      <mesh
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover({ owner, pin }) }}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[r, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isHovered ? 0.6 : 0.15}
        />
      </mesh>
      {isHovered && (
        <Html distanceFactor={0.1} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: '#222', color: '#eee', padding: '2px 6px',
            borderRadius: 3, fontSize: 10, whiteSpace: 'nowrap',
            border: `1px solid ${color}`, transform: 'translate(8px, -50%)'
          }}>
            {owner}.{pin.id} <span style={{ color: '#888' }}>({pin.type})</span>
          </div>
        </Html>
      )}
    </group>
  )
}

function ComponentMesh({ c, selected, onSelect, hovered, onPinHover }: {
  c: ComponentInstance
  selected: boolean
  onSelect: () => void
  hovered: HoveredPin
  onPinHover: (h: HoveredPin) => void
}) {
  const def = catalog.getComponent(c.componentId)
  const pos = c.position ?? [0, 0.01, 0]
  return (
    <group position={pos}>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect() }}>
        <boxGeometry args={[0.006, 0.006, 0.006]} />
        <meshStandardMaterial
          color={selected ? '#ffaa00' : '#cc3333'}
          emissive={selected ? '#552200' : '#000'}
        />
      </mesh>
      {(selected || hovered?.owner === c.instance) && def?.pins.map((p) => (
        <PinAnchor
          key={p.id}
          pin={p}
          owner={c.instance}
          isHovered={hovered?.owner === c.instance && hovered.pin.id === p.id}
          onHover={onPinHover}
        />
      ))}
    </group>
  )
}

export default function Viewer3D() {
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const [hovered, setHovered] = useState<HoveredPin>(null)

  return (
    <Canvas
      shadows
      camera={{ position: [0.12, 0.1, 0.12], fov: 40 }}
      style={{ background: '#0e0e0e' }}
      onPointerMissed={() => select(null)}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[0.2, 0.3, 0.2]} intensity={1.2} castShadow />
        <Environment preset="city" />
        <Grid
          args={[1, 1]}
          cellSize={0.005}
          sectionSize={0.05}
          cellColor="#333"
          sectionColor="#555"
          fadeDistance={0.5}
          infiniteGrid
        />
        <BoardPlaceholder onPinHover={setHovered} hovered={hovered} />
        {project.components.map((c) => (
          <ComponentMesh
            key={c.instance}
            c={c}
            selected={selected === c.instance}
            onSelect={() => select(c.instance)}
            hovered={hovered}
            onPinHover={setHovered}
          />
        ))}
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Suspense>
    </Canvas>
  )
}
