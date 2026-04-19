import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, Html, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { pinColor } from '../catalog'

function GlbModel({ url, onPick }: { url: string; onPick: (p: THREE.Vector3, n: THREE.Vector3) => void }) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])

  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!e.face) return
        e.stopPropagation()
        const n = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
        onPick(e.point.clone(), n)
      }}
    >
      <primitive object={scene} />
    </group>
  )
}

function DraftPinAnchors() {
  const pins = useStore((s) => s.draft.pins)
  const sel = useStore((s) => s.draft.selectedPin)
  const selectPin = useStore((s) => s.selectDraftPin)
  return (
    <>
      {pins.map((p) => {
        const isSel = sel === p.id
        return (
          <group key={p.id} position={p.position}>
            <mesh
              onClick={(e) => { e.stopPropagation(); selectPin(p.id) }}
            >
              <sphereGeometry args={[isSel ? 0.0015 : 0.001, 12, 12]} />
              <meshStandardMaterial color={pinColor(p.type)} emissive={pinColor(p.type)} emissiveIntensity={isSel ? 0.7 : 0.2} />
            </mesh>
            <Html distanceFactor={0.1} style={{ pointerEvents: 'none' }}>
              <div style={{ background: '#222', color: '#eee', padding: '1px 4px',
                            borderRadius: 2, fontSize: 9, transform: 'translate(6px,-50%)' }}>
                {p.label}
              </div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

export default function CatalogEditor3D() {
  const draft = useStore((s) => s.draft)
  const addPin = useStore((s) => s.addDraftPin)

  const url = useMemo(() => {
    if (!draft.glbData) return null
    const buf = draft.glbData.slice().buffer as ArrayBuffer
    return URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }))
  }, [draft.glbData])

  if (!url) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: '#666' }}>
        No model loaded. Use “Load .glb” in the side panel.
      </div>
    )
  }

  return (
    <Canvas shadows camera={{ position: [0.12, 0.1, 0.12], fov: 40 }} style={{ background: '#0e0e0e' }}>
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[0.2, 0.3, 0.2]} intensity={1.2} />
        <Environment preset="city" />
        <Grid args={[1, 1]} cellSize={0.005} sectionSize={0.05}
              cellColor="#333" sectionColor="#555" fadeDistance={0.5} infiniteGrid />
        <GlbModel
          url={url}
          onPick={(p, n) => addPin([p.x, p.y, p.z], [n.x, n.y, n.z])}
        />
        <DraftPinAnchors />
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Suspense>
    </Canvas>
  )
}
