import { createRequire } from 'node:module'

type CadFormat = 'step' | 'stp'

interface OcctMesh {
  name?: string
  color?: number[] | null
  brep_faces?: Array<{ first?: number; last?: number; color?: number[] | null }>
  attributes?: {
    position?: { array?: unknown }
    normal?: { array?: unknown }
  }
  index?: { array?: unknown }
}

interface OcctImportResult {
  success: boolean
  error?: string
  meshes?: OcctMesh[]
}

interface OcctApi {
  ReadStepFile(content: Uint8Array, params: Record<string, unknown> | null): OcctImportResult
}

export interface ConvertedCadModel {
  data: Uint8Array
  dimensionsMm: { x: number; y: number; z: number }
  log: string[]
  meshCount: number
  triangleCount: number
}

const require = createRequire(import.meta.url)
let occtPromise: Promise<OcctApi> | null = null

export async function convertStepLikeCadToGlb(content: Uint8Array, format: CadFormat, sourceName: string): Promise<ConvertedCadModel> {
  const occt = await loadOcct()
  const result = occt.ReadStepFile(content, {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  })
  if (!result?.success) {
    throw new Error(result?.error ? `OpenCascade failed to read ${format.toUpperCase()}: ${result.error}` : `OpenCascade failed to read ${format.toUpperCase()}`)
  }
  return buildGlbFromOcctResult(result, sourceName)
}

export function buildGlbFromOcctResult(result: OcctImportResult, sourceName: string): ConvertedCadModel {
  const meshes = (result.meshes ?? []).map((mesh) => prepareMesh(mesh)).filter((mesh): mesh is PreparedMesh => !!mesh)
  if (!meshes.length) throw new Error('CAD conversion produced no renderable meshes.')

  const boundsMm = boundsForMeshes(meshes)
  const dimensionsMm = {
    x: Math.max(0, boundsMm.max[0] - boundsMm.min[0]),
    y: Math.max(0, boundsMm.max[1] - boundsMm.min[1]),
    z: Math.max(0, boundsMm.max[2] - boundsMm.min[2]),
  }
  const offsetMm: [number, number, number] = [
    (boundsMm.min[0] + boundsMm.max[0]) / 2,
    (boundsMm.min[1] + boundsMm.max[1]) / 2,
    boundsMm.min[2],
  ]

  const builder = new GlbBuilder(sourceName)
  let triangleCount = 0
  for (const mesh of meshes) {
    triangleCount += builder.addMesh(mesh, offsetMm)
  }

  return {
    data: builder.finish(),
    dimensionsMm,
    log: [
      `Converted ${sourceName} with bundled occt-import-js/OpenCascade.`,
      `Normalized CAD millimeters to meters and centered X/Y with base at Z=0.`,
      `Generated ${meshes.length} mesh${meshes.length === 1 ? '' : 'es'} and ${triangleCount} triangle${triangleCount === 1 ? '' : 's'}.`,
    ],
    meshCount: meshes.length,
    triangleCount,
  }
}

async function loadOcct(): Promise<OcctApi> {
  if (!occtPromise) {
    const occtImportJs = require('occt-import-js') as () => Promise<OcctApi>
    occtPromise = occtImportJs()
  }
  return occtPromise
}

interface PreparedMesh {
  name: string
  positionsMm: number[]
  normals: number[]
  indices: number[]
  colorGroups: Array<{ color: [number, number, number]; indices: number[] }>
}

function prepareMesh(mesh: OcctMesh): PreparedMesh | null {
  const positionsMm = flattenNumbers(mesh.attributes?.position?.array)
  if (positionsMm.length < 9) return null
  const vertexCount = Math.floor(positionsMm.length / 3)
  const normals = flattenNumbers(mesh.attributes?.normal?.array)
  const indices = normalizeIndices(flattenNumbers(mesh.index?.array), vertexCount)
  const colorGroups = groupIndicesByFaceColor(mesh, indices)
  return {
    name: mesh.name?.trim() || 'CAD mesh',
    positionsMm,
    normals: normals.length >= vertexCount * 3 ? normals.slice(0, vertexCount * 3) : [],
    indices,
    colorGroups,
  }
}

function flattenNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const item of value) {
    if (Array.isArray(item)) out.push(...flattenNumbers(item))
    else {
      const n = Number(item)
      if (Number.isFinite(n)) out.push(n)
    }
  }
  return out
}

function normalizeIndices(indices: number[], vertexCount: number): number[] {
  const clean = indices.map((n) => Math.trunc(n)).filter((n) => n >= 0 && n < vertexCount)
  if (clean.length >= 3) return clean.slice(0, clean.length - (clean.length % 3))
  return Array.from({ length: vertexCount }, (_v, i) => i).slice(0, vertexCount - (vertexCount % 3))
}

function groupIndicesByFaceColor(mesh: OcctMesh, indices: number[]): Array<{ color: [number, number, number]; indices: number[] }> {
  const triangleCount = Math.floor(indices.length / 3)
  const baseColor = toRgb(mesh.color) ?? [0.62, 0.62, 0.58]
  const groups = new Map<string, { color: [number, number, number]; indices: number[] }>()
  const covered = new Array<boolean>(triangleCount).fill(false)

  for (const face of mesh.brep_faces ?? []) {
    const first = clampInt(face.first, 0, Math.max(0, triangleCount - 1))
    const last = clampInt(face.last, first, Math.max(0, triangleCount - 1))
    const color = toRgb(face.color) ?? baseColor
    const group = colorGroup(groups, color)
    for (let tri = first; tri <= last; tri += 1) {
      covered[tri] = true
      group.indices.push(indices[tri * 3], indices[tri * 3 + 1], indices[tri * 3 + 2])
    }
  }

  const fallback = colorGroup(groups, baseColor)
  for (let tri = 0; tri < triangleCount; tri += 1) {
    if (covered[tri]) continue
    fallback.indices.push(indices[tri * 3], indices[tri * 3 + 1], indices[tri * 3 + 2])
  }

  return Array.from(groups.values()).filter((group) => group.indices.length >= 3)
}

function toRgb(value: number[] | null | undefined): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null
  const rgb = value.slice(0, 3).map((n) => clamp(Number(n), 0, 1))
  if (!rgb.every(Number.isFinite)) return null
  return [rgb[0], rgb[1], rgb[2]]
}

function colorGroup(groups: Map<string, { color: [number, number, number]; indices: number[] }>, color: [number, number, number]) {
  const key = color.map((n) => n.toFixed(4)).join(',')
  let group = groups.get(key)
  if (!group) {
    group = { color, indices: [] }
    groups.set(key, group)
  }
  return group
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function boundsForMeshes(meshes: PreparedMesh[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positionsMm.length - 2; i += 3) {
      min[0] = Math.min(min[0], mesh.positionsMm[i])
      min[1] = Math.min(min[1], mesh.positionsMm[i + 1])
      min[2] = Math.min(min[2], mesh.positionsMm[i + 2])
      max[0] = Math.max(max[0], mesh.positionsMm[i])
      max[1] = Math.max(max[1], mesh.positionsMm[i + 1])
      max[2] = Math.max(max[2], mesh.positionsMm[i + 2])
    }
  }
  if (![...min, ...max].every(Number.isFinite)) throw new Error('CAD conversion produced invalid bounds.')
  return { min, max }
}

class GlbBuilder {
  private readonly gltf: any
  private readonly chunks: Buffer[] = []
  private readonly materials = new Map<string, number>()
  private byteOffset = 0

  constructor(sourceName: string) {
    this.gltf = {
      asset: { version: '2.0', generator: 'Circuitiny CAD converter' },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      materials: [],
      buffers: [{ byteLength: 0 }],
      bufferViews: [],
      accessors: [],
      extras: { sourceName },
    }
  }

  addMesh(mesh: PreparedMesh, offsetMm: [number, number, number]): number {
    const positionsM = new Float32Array(mesh.positionsMm.length)
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < mesh.positionsMm.length - 2; i += 3) {
      const x = (mesh.positionsMm[i] - offsetMm[0]) * 0.001
      const y = (mesh.positionsMm[i + 1] - offsetMm[1]) * 0.001
      const z = (mesh.positionsMm[i + 2] - offsetMm[2]) * 0.001
      positionsM[i] = x
      positionsM[i + 1] = y
      positionsM[i + 2] = z
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z)
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z)
    }

    const positionAccessor = this.addAccessor(positionsM, 5126, 'VEC3', positionsM.length / 3, min, max)
    const normalAccessor = mesh.normals.length === mesh.positionsMm.length
      ? this.addAccessor(new Float32Array(mesh.normals), 5126, 'VEC3', mesh.normals.length / 3)
      : undefined
    const primitives = mesh.colorGroups.map((group) => {
      const maxIndex = group.indices.reduce((maxValue, index) => Math.max(maxValue, index), 0)
      const typedIndices = maxIndex <= 65535 ? new Uint16Array(group.indices) : new Uint32Array(group.indices)
      const indexAccessor = this.addAccessor(typedIndices, maxIndex <= 65535 ? 5123 : 5125, 'SCALAR', typedIndices.length)
      return {
        attributes: { POSITION: positionAccessor, ...(normalAccessor !== undefined ? { NORMAL: normalAccessor } : {}) },
        indices: indexAccessor,
        material: this.materialForColor(group.color, mesh.name),
      }
    })
    const meshIndex = this.gltf.meshes.push({ name: mesh.name, primitives }) - 1
    const nodeIndex = this.gltf.nodes.push({ name: mesh.name, mesh: meshIndex }) - 1
    this.gltf.scenes[0].nodes.push(nodeIndex)
    return mesh.colorGroups.reduce((sum, group) => sum + Math.floor(group.indices.length / 3), 0)
  }

  finish(): Uint8Array {
    const binary = this.alignBuffer(Buffer.concat(this.chunks, this.byteOffset), 0)
    this.gltf.buffers[0].byteLength = binary.byteLength
    const json = this.alignBuffer(Buffer.from(JSON.stringify(this.gltf), 'utf8'), 0x20)
    const totalLength = 12 + 8 + json.byteLength + 8 + binary.byteLength
    const header = Buffer.alloc(12)
    header.writeUInt32LE(0x46546c67, 0)
    header.writeUInt32LE(2, 4)
    header.writeUInt32LE(totalLength, 8)
    const jsonHeader = Buffer.alloc(8)
    jsonHeader.writeUInt32LE(json.byteLength, 0)
    jsonHeader.writeUInt32LE(0x4e4f534a, 4)
    const binHeader = Buffer.alloc(8)
    binHeader.writeUInt32LE(binary.byteLength, 0)
    binHeader.writeUInt32LE(0x004e4942, 4)
    return new Uint8Array(Buffer.concat([header, jsonHeader, json, binHeader, binary], totalLength))
  }

  private addAccessor(
    typed: Float32Array | Uint16Array | Uint32Array,
    componentType: 5123 | 5125 | 5126,
    type: 'SCALAR' | 'VEC3',
    count: number,
    min?: [number, number, number],
    max?: [number, number, number],
  ): number {
    const bufferView = this.addBufferView(typed)
    return this.gltf.accessors.push({
      bufferView,
      componentType,
      count,
      type,
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
    }) - 1
  }

  private addBufferView(typed: Float32Array | Uint16Array | Uint32Array): number {
    this.padChunks(0)
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)
    const viewIndex = this.gltf.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: bytes.byteLength,
    }) - 1
    this.chunks.push(bytes)
    this.byteOffset += bytes.byteLength
    this.padChunks(0)
    return viewIndex
  }

  private padChunks(fill: number): void {
    const pad = (4 - (this.byteOffset % 4)) % 4
    if (!pad) return
    this.chunks.push(Buffer.alloc(pad, fill))
    this.byteOffset += pad
  }

  private alignBuffer(buffer: Buffer, fill: number): Buffer {
    const pad = (4 - (buffer.byteLength % 4)) % 4
    return pad ? Buffer.concat([buffer, Buffer.alloc(pad, fill)], buffer.byteLength + pad) : buffer
  }

  private materialForColor(color: [number, number, number], meshName: string): number {
    const key = `${color.map((n) => n.toFixed(4)).join(',')}|${metalnessFor(meshName, color)}`
    const existing = this.materials.get(key)
    if (existing !== undefined) return existing
    const materialIndex = this.gltf.materials.push({
      name: `${meshName || 'CAD'} ${this.gltf.materials.length + 1}`,
      pbrMetallicRoughness: {
        baseColorFactor: [color[0], color[1], color[2], 1],
        metallicFactor: metalnessFor(meshName, color),
        roughnessFactor: 0.42,
      },
      doubleSided: true,
    }) - 1
    this.materials.set(key, materialIndex)
    return materialIndex
  }
}

function metalnessFor(meshName: string, color: [number, number, number]): number {
  if (/(metal|pin|lead|terminal|contact|pad)/i.test(meshName)) return 0.75
  const spread = Math.max(...color) - Math.min(...color)
  const brightness = (color[0] + color[1] + color[2]) / 3
  return spread < 0.08 && brightness > 0.45 ? 0.35 : 0.05
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
