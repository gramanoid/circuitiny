import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { useStore } from '../store'
import { Suspense } from 'react'
import type { ComponentInstance } from '../project/schema'

// Placeholder board ~ ESP32 DevKitC dimensions in meters (~55x28x10mm).
function BoardPlaceholder() {
  return (
    <group>
      <mesh position={[0, 0.005, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.055, 0.002, 0.028]} />
        <meshStandardMaterial color="#1f4f3a" />
      </mesh>
      {/* USB header stub */}
      <mesh position={[-0.027, 0.009, 0]}>
        <boxGeometry args={[0.008, 0.006, 0.012]} />
        <meshStandardMaterial color="#888" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

function ComponentMesh({ c, selected, onSelect }: {
  c: ComponentInstance
  selected: boolean
  onSelect: () => void
}) {
  // Placeholder: small red cube. Real GLB loading lands when catalog ships.
  const pos = c.position ?? [0, 0.01, 0]
  return (
    <mesh
      position={pos}
      onClick={(e) => { e.stopPropagation(); onSelect() }}
    >
      <boxGeometry args={[0.006, 0.006, 0.006]} />
      <meshStandardMaterial
        color={selected ? '#ffaa00' : '#cc3333'}
        emissive={selected ? '#552200' : '#000'}
      />
    </mesh>
  )
}

export default function Viewer3D() {
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)

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
        <BoardPlaceholder />
        {project.components.map((c) => (
          <ComponentMesh
            key={c.instance}
            c={c}
            selected={selected === c.instance}
            onSelect={() => select(c.instance)}
          />
        ))}
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Suspense>
    </Canvas>
  )
}
