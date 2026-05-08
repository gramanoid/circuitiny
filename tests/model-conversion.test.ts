import { describe, expect, it } from 'vitest'
import { buildGlbFromOcctResult } from '../electron/modelConversion'

function parseGlbJson(data: Uint8Array): any {
  const buffer = Buffer.from(data)
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67)
  expect(buffer.readUInt32LE(4)).toBe(2)
  const jsonLength = buffer.readUInt32LE(12)
  const jsonType = buffer.readUInt32LE(16)
  expect(jsonType).toBe(0x4e4f534a)
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim())
}

describe('CAD model conversion', () => {
  it('turns OpenCascade mesh JSON into a centered meter-scale GLB', () => {
    const converted = buildGlbFromOcctResult({
      success: true,
      meshes: [{
        name: 'Fixture metal pins',
        attributes: {
          position: { array: [0, 0, -1, 10, 0, -1, 0, 20, 4, 10, 20, 4] },
          normal: { array: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1] },
        },
        index: { array: [0, 1, 2, 1, 3, 2] },
        color: [0.5, 0.5, 0.5],
        brep_faces: [
          { first: 0, last: 0, color: [0.02, 0.02, 0.02] },
          { first: 1, last: 1, color: [0.75, 0.72, 0.65] },
        ],
      }],
    }, 'fixture.step')

    const gltf = parseGlbJson(converted.data)
    expect(converted.dimensionsMm).toEqual({ x: 10, y: 20, z: 5 })
    expect(converted.meshCount).toBe(1)
    expect(converted.triangleCount).toBe(2)
    expect(converted.log.join(' ')).toContain('Normalized CAD millimeters to meters')
    expect(gltf.meshes[0].primitives).toHaveLength(2)
    expect(gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION].min).toEqual([-0.005, -0.01, 0])
    expect(gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION].max).toEqual([0.005, 0.01, 0.005])
    expect(gltf.materials.map((material: any) => material.pbrMetallicRoughness.baseColorFactor)).toContainEqual([0.02, 0.02, 0.02, 1])
  })

  it('fails loudly when OpenCascade returns no meshes', () => {
    expect(() => buildGlbFromOcctResult({ success: true, meshes: [] }, 'empty.step'))
      .toThrow('no renderable meshes')
  })
})
