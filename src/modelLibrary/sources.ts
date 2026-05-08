import type { ModelLibrarySource, ModelSourceStats } from './types'

export const MODEL_LIBRARY_SOURCES: ModelLibrarySource[] = [
  {
    id: 'kicad-packages3d',
    name: 'KiCad packages3D',
    url: 'https://github.com/KiCad/kicad-packages3D',
    licenseName: 'CC-BY-SA 4.0 with KiCad library exception',
    licenseUrl: 'https://www.kicad.org/libraries/license/',
    licenseUse: 'bundled-ok',
    formats: ['step', 'wrl'],
    attribution: 'KiCad Libraries contributors',
    notes: [
      'Strong source for common electronics packages.',
      'Redistributed collections must retain license and attribution documents.',
    ],
  },
  {
    id: 'antmicro-hardware-components',
    name: 'Antmicro hardware-components',
    url: 'https://github.com/antmicro/hardware-components',
    licenseName: 'Apache-2.0',
    licenseUrl: 'https://github.com/antmicro/hardware-components/blob/main/LICENSE',
    licenseUse: 'bundled-ok',
    formats: ['gltf'],
    attribution: 'Antmicro',
    notes: [
      'Direct glTF models plus Blender and KiCad assets.',
      'Good for realistic connectors, LEDs, USB parts, buzzers, and hardware packages.',
    ],
  },
  {
    id: 'sparkfun-kicad-libraries',
    name: 'SparkFun KiCad Libraries',
    url: 'https://github.com/sparkfun/SparkFun-KiCad-Libraries',
    licenseName: 'CC-BY 4.0',
    licenseUrl: 'https://github.com/sparkfun/SparkFun-KiCad-Libraries#license',
    licenseUse: 'bundled-ok',
    formats: ['step', 'stp'],
    attribution: 'SparkFun Electronics',
    notes: [
      'Useful open models for beginner-facing modules, LEDs, switches, displays, and connectors.',
    ],
  },
  {
    id: 'digikey-kicad-library',
    name: 'Digi-Key KiCad Library',
    url: 'https://github.com/Digi-Key/digikey-kicad-library',
    licenseName: 'CC-BY-SA 4.0 with exception',
    licenseUrl: 'https://github.com/Digi-Key/digikey-kicad-library/blob/master/LICENSE.md',
    licenseUse: 'bundled-ok',
    formats: [],
    attribution: 'Digi-Key Electronics',
    notes: [
      'Useful for part metadata and KiCad symbols/footprints.',
      'No STEP/WRL/GLB model files were found in the checked repository tree.',
    ],
  },
  {
    id: 'snapmagic',
    name: 'SnapMagic / SnapEDA',
    url: 'https://www.snapeda.com/',
    licenseName: 'Free download; redistribution must be reviewed per asset',
    licenseUrl: 'https://www.snapeda.com/',
    licenseUse: 'local-import-only',
    formats: ['step'],
    attribution: 'SnapMagic Search and original part vendors',
    notes: [
      'Good for exact manufacturer part numbers.',
      'Do not bundle by default; let the learner import local downloads after review.',
    ],
  },
  {
    id: 'ultra-librarian',
    name: 'Ultra Librarian',
    url: 'https://www.ultralibrarian.com/',
    licenseName: 'Free download; redistribution must be reviewed per asset',
    licenseUrl: 'https://www.ultralibrarian.com/legal/',
    licenseUse: 'local-import-only',
    formats: ['step'],
    attribution: 'Ultra Librarian and original part vendors',
    notes: [
      'Large verified CAD source for exact components.',
      'Do not bundle by default; import only after learner approval and terms review.',
    ],
  },
  {
    id: 'sketchfab-cc',
    name: 'Sketchfab Creative Commons models',
    url: 'https://sketchfab.com/features/gltf',
    licenseName: 'Per-model Creative Commons or store license',
    licenseUrl: 'https://sketchfab.com/licenses',
    licenseUse: 'local-import-only',
    formats: ['glb', 'gltf'],
    attribution: 'Individual Sketchfab model authors',
    notes: [
      'Can provide direct GLB/glTF downloads.',
      'Quality, scale, and license vary per model; review each candidate before import.',
    ],
  },
  {
    id: 'manufacturer-cad',
    name: 'Manufacturer CAD pages',
    url: 'https://www.digikey.com/',
    licenseName: 'Per-manufacturer terms',
    licenseUrl: 'https://www.digikey.com/en/terms-and-conditions',
    licenseUse: 'local-import-only',
    formats: ['step', 'stp'],
    attribution: 'Original manufacturer',
    notes: [
      'Best for exact modules and connectors when a part number is known.',
      'Not bundled unless the exact model license permits redistribution.',
    ],
  },
]

export const MODEL_SOURCE_STATS: ModelSourceStats[] = [
  { sourceId: 'kicad-packages3d', knownAssetCount: 12378, lastVerifiedAt: '2026-05-09' },
  { sourceId: 'antmicro-hardware-components', knownAssetCount: 735, indexedCount: 2733, lastVerifiedAt: '2026-05-09' },
  { sourceId: 'sparkfun-kicad-libraries', knownAssetCount: 324, lastVerifiedAt: '2026-05-09' },
  { sourceId: 'digikey-kicad-library', knownAssetCount: 0, lastVerifiedAt: '2026-05-09' },
]

export function getModelSource(sourceId: string): ModelLibrarySource | undefined {
  return MODEL_LIBRARY_SOURCES.find((source) => source.id === sourceId)
}
