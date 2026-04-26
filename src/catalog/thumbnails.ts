// Offscreen singleton renderer — renders GLB models to PNG data URLs.
// Uses a single WebGLRenderer to stay within browser context limits.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const W = 160, H = 120
let _renderer: THREE.WebGLRenderer | null = null

function getRenderer(): THREE.WebGLRenderer {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    _renderer.setSize(W, H)
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    _renderer.setClearColor(0x000000, 0)
    _renderer.shadowMap.enabled = false
  }
  return _renderer
}

const _scene = new THREE.Scene()
const _camera = new THREE.PerspectiveCamera(35, W / H, 0.0001, 1000)
_scene.add(new THREE.AmbientLight(0xffffff, 2.5))
const _dir = new THREE.DirectionalLight(0xffffff, 1.5)
_dir.position.set(1, 2, 1.5)
_scene.add(_dir)
const _fill = new THREE.DirectionalLight(0xffffff, 0.5)
_fill.position.set(-1, -0.5, -1)
_scene.add(_fill)

const _loader = new GLTFLoader()
const _cache = new Map<string, string>()
const _pending = new Map<string, Promise<string>>()

export function renderThumbnail(url: string): Promise<string> {
  const cached = _cache.get(url)
  if (cached) return Promise.resolve(cached)
  const inFlight = _pending.get(url)
  if (inFlight) return inFlight

  const p = new Promise<string>((resolve, reject) => {
    _loader.load(url, (gltf) => {
      const model = gltf.scene
      _scene.add(model)

      const box = new THREE.Box3().setFromObject(model)
      if (!box.isEmpty()) {
        const sphere = box.getBoundingSphere(new THREE.Sphere())
        const r = Math.max(sphere.radius, 0.001)
        const dist = r * 3.5
        _camera.position.set(
          sphere.center.x + dist * 0.6,
          sphere.center.y + dist * 0.5,
          sphere.center.z + dist * 0.85
        )
        _camera.lookAt(sphere.center)
        _camera.near = dist * 0.01
        _camera.far = dist * 20
        _camera.updateProjectionMatrix()
      }

      const r2 = getRenderer()
      r2.render(_scene, _camera)
      const dataUrl = r2.domElement.toDataURL('image/png')
      _scene.remove(model)
      _cache.set(url, dataUrl)
      resolve(dataUrl)
    }, undefined, (err) => reject(err))
  })

  _pending.set(url, p)
  p.finally(() => _pending.delete(url))
  return p
}
