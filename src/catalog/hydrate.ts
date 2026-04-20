// Loads user-added components from ~/.esp-ai/catalog/ into the in-memory catalog.

import { catalog } from './index'
import type { ComponentDef } from '../project/component'

export async function hydrateCatalog(): Promise<number> {
  if (!window.espAI?.listCatalog) return 0
  const entries = await window.espAI.listCatalog()
  let n = 0
  for (const e of entries) {
    const j = e.json
    if (!j?.id || !Array.isArray(j.pins)) continue
    const def: ComponentDef = {
      id: j.id,
      name: j.name ?? j.id,
      version: j.version ?? '0.1.0',
      category: j.category ?? 'misc',
      model: j.model ?? 'model.glb',
      scale: typeof j.scale === 'number' ? j.scale : 1,
      pins: j.pins.map((p: any) => ({
        id: p.id, label: p.label ?? p.id,
        type: p.type ?? 'digital_io',
        position: p.position, normal: p.normal ?? [0, 1, 0]
      })),
      schematic: { autoGenerate: true }
    }
    catalog.registerComponent(def, e.glbData)
    n++
  }
  return n
}
