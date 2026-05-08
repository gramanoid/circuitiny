import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useStore } from '../store'
import { catalog } from '../catalog'
import type { ComponentDef } from '../project/component'
import { renderThumbnail } from '../catalog/thumbnails'
import { catalogStatusLabel, resolveCatalogRender, type PrimitiveRenderKind } from '../catalog/rendering'

// ── Family grouping ────────────────────────────────────────────────────────────

function familyKey(id: string): string {
  return id.split('-')[0]
}

const FAMILY_LABEL: Record<string, string> = {
  resistor:     'Resistors',
  led:          'LEDs',
  button:       'Buttons',
  speaker:      'Speakers',
  relay:        'Relays',
  dht22:        'DHT22 Sensor',
  inmp441:      'INMP441 Mic',
  mpu6050:      'MPU6050 IMU',
  oled:         'OLED Display',
  pir:          'PIR Sensor',
  potentiometer:'Potentiometer',
  servo:        'Servo SG90',
  ws2812b:      'WS2812B Strip',
}

function familyLabel(key: string): string {
  return FAMILY_LABEL[key] ?? (key.charAt(0).toUpperCase() + key.slice(1))
}

interface Family {
  key: string
  label: string
  members: ComponentDef[]
}

function groupByFamily(items: ComponentDef[]): Family[] {
  const map = new Map<string, ComponentDef[]>()
  for (const item of items) {
    const k = familyKey(item.id)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries()).map(([key, members]) => ({
    key,
    label: familyLabel(key),
    members,
  }))
}

// ── Thumbnail image (rendered offscreen) ──────────────────────────────────────

const EXPAND_W = 200
const EXPAND_H = 150

function Thumb({ component, w, h }: { component: ComponentDef; w: number; h: number }) {
  const [src, setSrc] = useState<string | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const url = catalog.getGlbUrl(component.id)
  const renderInfo = resolveCatalogRender(component, !!url)

  useEffect(() => {
    if (!url) {
      setSrc(null)
      return
    }
    let alive = true
    renderThumbnail(url).then((d) => { if (alive) setSrc(d) }).catch(() => {})
    return () => { alive = false }
  }, [url])

  function handleMouseEnter(e: React.MouseEvent<HTMLElement>) {
    if (src) setHoverRect(e.currentTarget.getBoundingClientRect())
  }

  const placeholder = (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHoverRect(null)}
      style={{
        width: w, height: h, flexShrink: 0, borderRadius: 4,
        background: '#161616', display: 'flex', alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url
        ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #333', borderTopColor: '#666' }} />
        : <PrimitiveThumb kind={renderInfo.primitiveKind} strategy={renderInfo.strategy} />
      }
    </div>
  )

  const expandedLeft = hoverRect
    ? hoverRect.right + 8
    : 0
  const expandedTop = hoverRect
    ? Math.min(hoverRect.top, window.innerHeight - EXPAND_H - 8)
    : 0

  return (
    <>
      {!src ? placeholder : (
        <img
          src={src} width={w} height={h}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setHoverRect(null)}
          style={{ borderRadius: 4, objectFit: 'contain', flexShrink: 0,
                   background: '#161616', cursor: 'zoom-in' }}
        />
      )}
      {hoverRect && src && (
        <img
          src={src}
          width={EXPAND_W} height={EXPAND_H}
          style={{
            position: 'fixed', left: expandedLeft, top: expandedTop,
            zIndex: 2000, borderRadius: 8, objectFit: 'contain',
            background: '#1a1a1a', border: '1px solid #333',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  )
}

const PRIMITIVE_ACCENT: Record<PrimitiveRenderKind, string> = {
  display: '#35aaff',
  sensor: '#50a36b',
  resistor: '#d8b36a',
  capacitor: '#4f8fcf',
  led: '#ff5a4f',
  button: '#aaa',
  relay: '#8a8a8a',
  speaker: '#8a8a8a',
  potentiometer: '#8a8a8a',
  motor: '#8a8a8a',
  microphone: '#8a8a8a',
  ledstrip: '#ff5a4f',
  'generic-block': '#8a8a8a',
}

function PrimitiveThumb({ kind, strategy }: { kind: PrimitiveRenderKind; strategy: string }) {
  const accent = PRIMITIVE_ACCENT[kind] ?? '#8a8a8a'
  const round = kind === 'led' || kind === 'speaker' || kind === 'microphone' ? '50%' : 4
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 3,
    }}>
      <div style={{
        width: kind === 'resistor' ? '64%' : '46%',
        height: kind === 'resistor' ? 8 : '38%',
        borderRadius: round,
        background: accent,
        boxShadow: kind === 'led' ? `0 0 10px ${accent}` : 'none',
        opacity: strategy === 'generic-block' ? 0.55 : 0.9,
      }} />
      <span style={{ fontSize: 8, color: '#656565' }}>
        {strategy === 'generic-block' ? 'generic' : kind}
      </span>
    </div>
  )
}

function CatalogStatusBadges({ component, renderInfo, includeConfidence = false }: {
  component: ComponentDef
  renderInfo: ReturnType<typeof resolveCatalogRender>
  includeConfidence?: boolean
}) {
  const meta = component.catalogMeta
  return (
    <>
      {meta?.trust && meta.trust !== 'builtin' && (
        <div style={{ color: meta.trust === 'ai-draft' ? '#d0b36a' : '#6688aa',
                      fontSize: 9, marginTop: 2 }}>
          {catalogStatusLabel(meta)}{includeConfidence ? ` · ${renderInfo.confidence} confidence` : ''}
        </div>
      )}
      {meta?.sourceUrls && meta.sourceUrls.length > 0 && (
        <div style={{ color: '#666', fontSize: 9, marginTop: 2 }}>
          {meta.sourceUrls.length} source{meta.sourceUrls.length === 1 ? '' : 's'}
        </div>
      )}
      {renderInfo.warnings.length > 0 && meta?.trust !== 'builtin' && (
        <div style={{ color: '#bba86a', fontSize: 9, marginTop: 2 }}>
          {renderInfo.warnings.length} review warning{renderInfo.warnings.length === 1 ? '' : 's'}
        </div>
      )}
    </>
  )
}

// ── Picker flyout (multi-variant families) ────────────────────────────────────

interface PickerProps {
  family: Family
  anchorRect: DOMRect
  onAdd: (id: string) => void
  onClose: () => void
  catalogVersion: number
}

function FamilyPicker({ family, anchorRect, onAdd, onClose, catalogVersion }: PickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const memberRenderInfo = useMemo(() => {
    return new Map(family.members.map((c) => [c.id, resolveCatalogRender(c, !!catalog.getGlbUrl(c.id))]))
  }, [family.members, catalogVersion])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const left = anchorRect.right + 8
  const top = Math.min(anchorRect.top, window.innerHeight - 320)

  return (
    <div ref={ref} style={{
      position: 'fixed', left, top, zIndex: 1000,
      background: '#181818', border: '1px solid #2d2d2d',
      borderRadius: 8, padding: 12, width: 300,
      maxHeight: '70vh', overflow: 'auto',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 10,
      }}>
        <span style={{ color: '#aaa', fontSize: 11, fontWeight: 600,
                       textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {family.label}
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#666', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {family.members.map((c) => {
          const renderInfo = memberRenderInfo.get(c.id)!
          return (
            <button key={c.id} onClick={() => onAdd(c.id)} style={{
              background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 6,
              padding: 8, cursor: 'pointer', textAlign: 'center',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#4a4a4a')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
            >
              <Thumb component={c} w={116} h={72} />
              <div style={{ color: '#ddd', fontSize: 10, marginTop: 6, fontWeight: 500 }}>
                {c.name}
              </div>
              <div style={{ color: '#555', fontSize: 9, marginTop: 2 }}>
                {c.pins.length} pins · {renderInfo.strategy}
              </div>
              <CatalogStatusBadges component={c} renderInfo={renderInfo} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Family card ───────────────────────────────────────────────────────────────

interface FamilyCardProps {
  family: Family
  onAdd: (id: string) => void
  isOpen: boolean
  onOpen: (rect: DOMRect) => void
  onClose: () => void
}

function FamilyCard({ family, onAdd, isOpen, onOpen, onClose }: FamilyCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const multi = family.members.length > 1
  const rep = family.members[0]
  const repRender = resolveCatalogRender(rep, !!catalog.getGlbUrl(rep.id))

  function handleClick() {
    if (!multi) { onAdd(rep.id); return }
    if (isOpen) { onClose(); return }
    const rect = cardRef.current?.getBoundingClientRect()
    if (rect) onOpen(rect)
  }

  return (
    <button
      ref={cardRef}
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', textAlign: 'left',
        background: isOpen ? '#222' : '#181818',
        border: `1px solid ${isOpen ? '#3a3a3a' : '#222'}`,
        borderRadius: 6, padding: '7px 8px', marginBottom: 4,
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a3a3a' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isOpen ? '#3a3a3a' : '#222' }}
    >
      <Thumb component={rep} w={46} h={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#ddd', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {family.label}
        </div>
        <div style={{ color: '#555', fontSize: 9, marginTop: 2 }}>
          {multi
            ? `${family.members.length} variants`
            : `${rep.category} · ${rep.pins.length} pins · ${repRender.strategy}`}
        </div>
        <CatalogStatusBadges component={rep} renderInfo={repRender} includeConfidence />
      </div>
      {multi && (
        <div style={{
          fontSize: 9, color: '#888', background: '#252525',
          borderRadius: 10, padding: '1px 6px', flexShrink: 0,
        }}>
          {family.members.length}
        </div>
      )}
    </button>
  )
}

// ── Main Palette ──────────────────────────────────────────────────────────────

export default function Palette() {
  const catalogVersion = useStore((s) => s.catalogVersion)
  const project = useStore((s) => s.project)
  const add = useStore((s) => s.addComponent)
  const remove = useStore((s) => s.removeComponent)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selected)

  const [openFamily, setOpenFamily] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const items = catalog.listComponents()
  const families = groupByFamily(items)

  const handleClose = useCallback(() => setOpenFamily(null), [])

  const openPicker = useCallback((key: string, rect: DOMRect) => {
    setOpenFamily(key)
    setAnchorRect(rect)
  }, [])

  const openFamily_ = openFamily ? families.find((f) => f.key === openFamily) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      <section style={{ padding: 8, borderBottom: '1px solid #222', overflow: 'auto', flex: '1 1 0', minHeight: 0 }}>
        <div style={{
          color: '#666', marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 9, fontWeight: 600,
        }}>
          Catalog · {items.length}
        </div>
        {items.length === 0 && (
          <div style={{ color: '#555', fontSize: 10 }}>
            No components. Use Catalog Editor to create some.
          </div>
        )}
        {families.map((f) => (
          <FamilyCard
            key={f.key}
            family={f}
            onAdd={add}
            isOpen={openFamily === f.key}
            onOpen={(rect) => openPicker(f.key, rect)}
            onClose={handleClose}
          />
        ))}
      </section>

      <section style={{ padding: 8, flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
        <div style={{
          color: '#666', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 9, fontWeight: 600,
        }}>
          Instances · {project.components.length}
        </div>
        {project.components.map((c) => (
          <div
            key={c.instance}
            onClick={() => select(c.instance)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 6px', marginBottom: 2, borderRadius: 4, cursor: 'pointer',
              background: selected === c.instance ? '#1e2533' : '#141414',
              border: `1px solid ${selected === c.instance ? '#3a6aa0' : '#1e1e1e'}`,
            }}
          >
            <div>
              <div style={{ color: '#ccc' }}>{c.instance}</div>
              <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>{c.componentId}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); remove(c.instance) }}
              style={{
                background: '#2a1818', color: '#a66', border: '1px solid #3a2222',
                borderRadius: 3, padding: '2px 7px', fontSize: 10, cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </section>

      {openFamily_ && anchorRect && (
        <FamilyPicker
          family={openFamily_}
          anchorRect={anchorRect}
          catalogVersion={catalogVersion}
          onAdd={(id) => { add(id); handleClose() }}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
