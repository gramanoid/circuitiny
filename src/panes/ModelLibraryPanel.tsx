import { useMemo, useState } from 'react'
import { catalog } from '../catalog'
import { componentFromModelAsset, conversionStatusFor, MODEL_SOURCE_STATS, searchModelAssets, type ModelAssetCandidate } from '../modelLibrary'
import { useStore } from '../store'

export default function ModelLibraryPanel() {
  const [query, setQuery] = useState('led button oled sensor')
  const [message, setMessage] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const loadBundle = useStore((s) => s.loadDraftFromBundle)
  const bumpCatalog = useStore((s) => s.bumpCatalog)
  const results = useMemo(() => searchModelAssets(query), [query])
  const candidates = results.candidates.slice(0, 9)

  async function install(candidate: ModelAssetCandidate) {
    setMessage(null)
    setInstallingId(candidate.id)
    try {
      if (candidate.licenseUse === 'blocked') {
        setMessage('Blocked by license or payment requirement.')
        return
      }
      const component = componentFromModelAsset(candidate)
      const componentJson = JSON.stringify(component, null, 2)
      if (!window.espAI?.installModelAsset) {
        setMessage('Model install is only available in the Electron app.')
        return
      }
      const result = await window.espAI.installModelAsset({
        asset: candidate,
        componentJson,
        approved: true,
      })
      if (!result.ok) {
        setMessage(result.error ?? 'Model install failed.')
        return
      }
      const parsed = JSON.parse(result.componentJson ?? componentJson)
      catalog.registerComponent(parsed, result.modelData ?? null)
      bumpCatalog()
      loadBundle({
        id: parsed.id,
        name: parsed.name,
        category: parsed.category,
        glbPath: result.modelName ?? null,
        glbName: result.modelName ?? null,
        glbData: result.modelData ?? null,
        scale: typeof parsed.scale === 'number' ? parsed.scale : 1,
        catalogMeta: parsed.catalogMeta,
        pins: Array.isArray(parsed.pins) ? parsed.pins : [],
      })
      setMessage(`Installed draft: ${parsed.name}. Review pins before trusting it.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="find open models..."
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MODEL_SOURCE_STATS.map((stat) => (
          <span key={stat.sourceId} title={stat.lastVerifiedAt} style={pillStyle}>
            {stat.sourceId.replace(/-.*/, '')} {stat.knownAssetCount}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 330, overflow: 'auto' }}>
        {candidates.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            installing={installingId === candidate.id}
            onInstall={() => install(candidate)}
          />
        ))}
        {candidates.length === 0 && (
          <div style={{ color: '#777', fontSize: 11 }}>No open model candidates matched.</div>
        )}
      </div>
      {message && <div style={messageStyle}>{message}</div>}
    </section>
  )
}

function CandidateRow({ candidate, installing, onInstall }: {
  candidate: ModelAssetCandidate
  installing: boolean
  onInstall: () => void
}) {
  const conversion = conversionStatusFor(candidate)
  const canInstall = candidate.licenseUse !== 'blocked'
  const installLabel = candidate.format === 'gltf' || candidate.format === 'glb'
    ? 'Install'
    : 'Convert'
  return (
    <div style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
          <strong style={{ color: '#ddd', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {candidate.label}
          </strong>
          <span style={smallPillStyle}>{candidate.format.toUpperCase()}</span>
        </div>
        <div style={{ color: '#8da0b8', fontSize: 10, marginTop: 2 }}>
          {candidate.sourceId} · {candidate.licenseUse} · {candidate.exactness}
        </div>
        <div style={{ color: '#777', fontSize: 10, lineHeight: 1.25, marginTop: 3 }}>
          {candidate.description}
        </div>
        {conversion === 'needed' && (
          <div style={{ color: '#c6a85b', fontSize: 10, marginTop: 3 }}>
            needs STEP/WRL conversion
          </div>
        )}
      </div>
      <button
        disabled={!canInstall || installing}
        onClick={onInstall}
        style={{ ...installButtonStyle, opacity: canInstall ? 1 : 0.45 }}
        title={candidate.assetUrl ?? candidate.sourceUrl}
      >
        {installing ? '...' : installLabel}
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: '#0d0d0d',
  color: '#ddd',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '5px 7px',
  fontSize: 11,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto',
  gap: 8,
  alignItems: 'start',
  border: '1px solid #242424',
  background: '#111',
  borderRadius: 5,
  padding: 8,
}

const pillStyle: React.CSSProperties = {
  color: '#9db8d8',
  background: '#0f1a24',
  border: '1px solid #25364a',
  borderRadius: 3,
  padding: '2px 5px',
  fontSize: 9,
}

const smallPillStyle: React.CSSProperties = {
  color: '#c6a85b',
  border: '1px solid #4a3a18',
  borderRadius: 3,
  padding: '1px 4px',
  fontSize: 9,
  flex: '0 0 auto',
}

const installButtonStyle: React.CSSProperties = {
  background: '#172235',
  color: '#d7e8ff',
  border: '1px solid #335579',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 10,
  cursor: 'pointer',
}

const messageStyle: React.CSSProperties = {
  color: '#d0b36a',
  background: '#18140b',
  border: '1px solid #4a3a18',
  borderRadius: 4,
  padding: 6,
  fontSize: 10,
  lineHeight: 1.35,
}
