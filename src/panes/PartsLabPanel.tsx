import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { TEMPLATES } from '../templates'
import { useStore } from '../store'
import { candidatesFromDescription, parsePhotoCandidates } from '../parts/photoAnalysis'
import { lookupPartKnowledge, lookupPartKnowledgeWithWeb } from '../parts/retrieval'
import { recommendProjectsFromInventory } from '../parts/recommendations'
import type { InventoryItem, PartKnowledgeRecord, PhotoCandidate, ProjectRecommendation } from '../parts/types'

type SelectedPhoto = {
  path?: string
  name: string
  dataUrl: string
}

type CandidateView = PhotoCandidate & {
  knowledge?: PartKnowledgeRecord
  webLinks?: string[]
}

export default function PartsLabPanel() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null)
  const [notes, setNotes] = useState('')
  const [candidates, setCandidates] = useState<CandidateView[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [recommendations, setRecommendations] = useState<ProjectRecommendation[]>([])
  const [busy, setBusy] = useState<'photo' | 'text' | 'recommend' | null>(null)
  const [webBusyId, setWebBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const confirmedCount = inventory.reduce((sum, item) => sum + item.quantity, 0)
  const canUseCodexPhoto = !!photo?.path && !!window.espAI?.analyzePartsPhoto

  async function pickPhoto() {
    setError(null)
    if (window.espAI?.pickPartsPhoto) {
      const picked = await window.espAI.pickPartsPhoto()
      if (picked) {
        setPhoto(picked)
        setCandidates([])
        setRecommendations([])
      }
      return
    }
    fileInput.current?.click()
  }

  async function handleInputFile(file: File | null) {
    if (!file) return
    setError(null)
    const dataUrl = await readFileAsDataUrl(file)
    setPhoto({ name: file.name, dataUrl })
    setCandidates([])
    setRecommendations([])
  }

  async function analyzePhoto() {
    if (!photo) return
    setBusy('photo')
    setError(null)
    try {
      const result = canUseCodexPhoto
        ? await window.espAI.analyzePartsPhoto({ path: photo.path!, notes, reasoningEffort: 'medium' })
        : { ok: true, text: `${photo.name}\n${notes}` }
      if (!result.ok) {
        setError(result.error ?? 'Photo analysis failed.')
        return
      }
      const parsed = parsePhotoCandidates(result.text ?? '')
      setCandidates(parsed.map(withKnowledge))
    } finally {
      setBusy(null)
    }
  }

  function analyzeText() {
    const text = notes.trim()
    if (!text) return
    setBusy('text')
    setError(null)
    setCandidates(candidatesFromDescription(text).map(withKnowledge))
    setBusy(null)
  }

  function confirmCandidate(candidate: CandidateView) {
    const knowledge = candidate.knowledge ?? lookupPartKnowledge(candidate.label)
    const item: InventoryItem = {
      id: `${knowledge.id}-${Date.now()}`,
      label: knowledge.label,
      quantity: candidate.quantity,
      confidence: candidate.confidence,
      knowledge,
      confirmedAt: new Date().toISOString(),
    }
    setInventory((prev) => [...prev, item])
    setCandidates((prev) => prev.map((c) => c.id === candidate.id ? { ...c, status: 'confirmed', knowledge } : c))
    setRecommendations([])
  }

  function ignoreCandidate(candidate: CandidateView) {
    setCandidates((prev) => prev.map((c) => c.id === candidate.id ? { ...c, status: 'ignored' } : c))
  }

  function renameCandidate(candidate: CandidateView) {
    const nextLabel = window.prompt('Part name', candidate.label)?.trim()
    if (!nextLabel) return
    const renamed = withKnowledge({ ...candidate, label: nextLabel, confidence: 'low', evidence: `Renamed by learner from "${candidate.label}".` })
    setCandidates((prev) => prev.map((c) => c.id === candidate.id ? { ...renamed, id: candidate.id } : c))
    setRecommendations([])
  }

  async function searchWeb(candidate: CandidateView) {
    setWebBusyId(candidate.id)
    setError(null)
    try {
      const provider = window.espAI?.exaPartSearch
        ? async (query: string) => {
            const result = await window.espAI.exaPartSearch(query)
            if (!result.ok) throw new Error(result.error ?? 'Exa search failed.')
            return result.results ?? []
          }
        : undefined
      const knowledge = await lookupPartKnowledgeWithWeb(candidate.label, provider)
      setCandidates((prev) => prev.map((c) => c.id === candidate.id
        ? { ...c, confidence: knowledge.confidence, knowledge, webLinks: knowledge.sourceLinks }
        : c))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWebBusyId(null)
    }
  }

  function recommendProjects() {
    setBusy('recommend')
    setError(null)
    setRecommendations(recommendProjectsFromInventory(inventory).slice(0, 5))
    setBusy(null)
  }

  function removeInventory(id: string) {
    setInventory((prev) => prev.filter((item) => item.id !== id))
    setRecommendations([])
  }

  function exportInventory() {
    const payload = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      imageStorage: 'none',
      items: inventory,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'circuitiny-inventory.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function clearTransientPhoto() {
    setPhoto(null)
    setCandidates([])
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  function createTemplate(rec: ProjectRecommendation) {
    if (!rec.templateId) return
    const template = TEMPLATES.find((entry) => entry.id === rec.templateId)
    if (!template) return
    useStore.getState().loadProject(template.project)
    useStore.getState().startRecipe(template.recipe.id)
  }

  const sortedCandidates = useMemo(() => {
    const rank = { confirmed: 0, candidate: 1, ignored: 2 }
    return [...candidates].sort((a, b) => rank[a.status] - rank[b.status])
  }, [candidates])

  return (
    <div style={styles.root}
         onDragOver={(e) => e.preventDefault()}
         onDrop={(e) => {
           e.preventDefault()
           handleInputFile(e.dataTransfer.files.item(0)).catch((err) => setError(String(err)))
         }}>
      <input ref={fileInput}
             type="file"
             accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
             style={{ display: 'none' }}
             onChange={(e) => handleInputFile(e.target.files?.item(0) ?? null).catch((err) => setError(String(err)))} />

      <section style={styles.leftRail}>
        <div style={styles.sectionHeader}>
          <span>Parts Photo</span>
          {photo && <button style={styles.ghostButton} onClick={clearTransientPhoto}>Reset</button>}
        </div>
        <button style={styles.primaryButton} onClick={pickPhoto}>Choose Photo</button>
        <div style={styles.dropZone} onClick={pickPhoto}>
          {photo ? (
            <>
              <img src={photo.dataUrl} alt={photo.name} style={styles.photoPreview} />
              <div style={styles.fileName}>{photo.name}</div>
            </>
          ) : (
            <div style={styles.emptyText}>Drop a parts photo here</div>
          )}
        </div>
        <textarea value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes, part markings, or a plain-English list"
                  style={styles.notes} />
        <div style={styles.buttonRow}>
          <button style={styles.primaryButton} disabled={!photo || busy === 'photo'} onClick={analyzePhoto}>
            {busy === 'photo' ? 'Analyzing...' : canUseCodexPhoto ? 'Analyze Photo' : 'Analyze Name'}
          </button>
          <button style={styles.secondaryButton} disabled={!notes.trim()} onClick={analyzeText}>Analyze Notes</button>
        </div>
        {error && <div style={styles.error}>{error}</div>}
      </section>

      <section style={styles.main}>
        <div style={styles.sectionHeader}>
          <span>Candidates</span>
          <span style={styles.muted}>{sortedCandidates.length} found</span>
        </div>
        <div style={styles.candidateGrid}>
          {sortedCandidates.length === 0 ? (
            <div style={styles.emptyPanel}>No candidates yet.</div>
          ) : sortedCandidates.map((candidate) => (
            <article key={candidate.id} style={{
              ...styles.card,
              opacity: candidate.status === 'ignored' ? 0.48 : 1,
              borderColor: candidate.status === 'confirmed' ? '#3a6b45' : '#30343a',
            }}>
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.cardTitle}>{candidate.label}</div>
                  <div style={styles.muted}>{candidate.evidence}</div>
                </div>
                <Badge label={candidate.confidence} tone={candidate.confidence} />
              </div>
              <div style={styles.badgeRow}>
                <Badge label={candidate.knowledge?.source ?? candidate.source} tone="source" />
                {candidate.safetySensitive && <Badge label="safety review" tone="low" />}
                {candidate.knowledge?.renderStrategy && <Badge label={candidate.knowledge.renderStrategy} tone="source" />}
                <span style={styles.qty}>x{candidate.quantity}</span>
              </div>
              {candidate.knowledge && (
                <p style={styles.explanation}>{candidate.knowledge.explanation}</p>
              )}
              {candidate.knowledge?.closeMatches && candidate.knowledge.closeMatches.length > 0 && (
                <div style={styles.callout}>
                  Closest local match: {candidate.knowledge.closeMatches.map((match) => match.label).join(', ')}
                </div>
              )}
              {candidate.safetyNotes.length > 0 && (
                <ul style={styles.noteList}>
                  {candidate.safetyNotes.slice(0, 2).map((note) => <li key={note}>{note}</li>)}
                </ul>
              )}
              {candidate.webLinks && candidate.webLinks.length > 0 && (
                <div style={styles.linkList}>
                  {candidate.webLinks.slice(0, 3).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" style={styles.link}>{hostLabel(url)}</a>
                  ))}
                </div>
              )}
              <div style={styles.buttonRow}>
                <button style={styles.primaryButton}
                        disabled={candidate.status === 'confirmed'}
                        onClick={() => confirmCandidate(candidate)}>
                  I Have This
                </button>
                <button style={styles.secondaryButton}
                        disabled={webBusyId === candidate.id}
                        onClick={() => searchWeb(candidate)}>
                  {webBusyId === candidate.id ? 'Checking...' : 'Not Sure'}
                </button>
                <button style={styles.ghostButton} onClick={() => renameCandidate(candidate)}>Rename</button>
                <button style={styles.ghostButton} onClick={() => ignoreCandidate(candidate)}>Ignore</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.rightRail}>
        <div style={styles.sectionHeader}>
          <span>Inventory</span>
          <span style={styles.muted}>{confirmedCount} confirmed</span>
        </div>
        <div style={styles.inventoryList}>
          {inventory.length === 0 ? (
            <div style={styles.emptyPanel}>Confirmed parts stay here for this session.</div>
          ) : inventory.map((item) => (
            <div key={item.id} style={styles.inventoryItem}>
              <div>
                <div style={styles.cardTitle}>{item.label}</div>
                <div style={styles.muted}>x{item.quantity} - {item.knowledge.family}</div>
              </div>
              <button style={styles.ghostButton} onClick={() => removeInventory(item.id)}>Remove</button>
            </div>
          ))}
        </div>
        <button style={styles.primaryButton}
                disabled={inventory.length === 0 || busy === 'recommend'}
                onClick={recommendProjects}>
          Recommend Projects
        </button>
        <button style={styles.secondaryButton}
                disabled={inventory.length === 0}
                onClick={exportInventory}>
          Export Inventory (no image)
        </button>

        <div style={{ ...styles.sectionHeader, marginTop: 14 }}>
          <span>Project Ideas</span>
          <span style={styles.muted}>{recommendations.length}</span>
        </div>
        <div style={styles.recommendationList}>
          {recommendations.length === 0 ? (
            <div style={styles.emptyPanel}>Ideas will appear after you confirm parts.</div>
          ) : recommendations.map((rec) => (
            <article key={rec.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.cardTitle}>{rec.title}</div>
                  <div style={styles.muted}>{rec.difficulty} - {rec.concepts.join(', ')}</div>
                </div>
                <Badge label={rec.fit === 'build-now' ? 'ready' : 'missing'} tone={rec.fit === 'build-now' ? 'high' : 'medium'} />
              </div>
              <p style={styles.explanation}>{rec.why}</p>
              <div style={styles.muted}>{rec.expectedSimulation}</div>
              <div style={styles.callout}>{rec.firstStep}</div>
              {rec.missingParts.length > 0 && (
                <ul style={styles.noteList}>
                  {rec.missingParts.slice(0, 3).map((part) => (
                    <li key={`${rec.id}-${part.componentId}`}>{part.componentId}: {part.reason}</li>
                  ))}
                </ul>
              )}
              <div style={styles.buttonRow}>
                {rec.templateId && (
                  <button style={styles.primaryButton} onClick={() => createTemplate(rec)}>Create Project</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function withKnowledge(candidate: PhotoCandidate): CandidateView {
  return { ...candidate, knowledge: lookupPartKnowledge(candidate.label) }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image.'))
    reader.readAsDataURL(file)
  })
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Badge({ label, tone }: { label: string; tone: 'high' | 'medium' | 'low' | 'source' }) {
  const bg = tone === 'high' ? '#17351f' : tone === 'medium' ? '#332d16' : tone === 'low' ? '#351c1c' : '#202630'
  const fg = tone === 'high' ? '#8fd49b' : tone === 'medium' ? '#e0c36f' : tone === 'low' ? '#ff9b9b' : '#9ab6d8'
  return <span style={{ ...styles.badge, background: bg, color: fg }}>{label}</span>
}

const styles: Record<string, CSSProperties> = {
  root: {
    height: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 300px) minmax(360px, 1fr) minmax(280px, 360px)',
    gap: 1,
    background: '#080808',
    overflow: 'hidden',
  },
  leftRail: {
    minWidth: 0,
    overflow: 'auto',
    padding: 12,
    background: '#151515',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  main: {
    minWidth: 0,
    overflow: 'auto',
    padding: 12,
    background: '#121212',
  },
  rightRail: {
    minWidth: 0,
    overflow: 'auto',
    padding: 12,
    background: '#151515',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    color: '#aaa',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  dropZone: {
    minHeight: 170,
    border: '1px dashed #3b4a5d',
    borderRadius: 6,
    background: '#0d1117',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  photoPreview: {
    width: '100%',
    maxHeight: 220,
    objectFit: 'contain',
    background: '#090909',
  },
  fileName: {
    width: '100%',
    padding: '7px 8px',
    borderTop: '1px solid #202833',
    color: '#9ab6d8',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyText: {
    color: '#657389',
    fontSize: 12,
  },
  notes: {
    minHeight: 88,
    resize: 'vertical',
    background: '#101010',
    color: '#ddd',
    border: '1px solid #30343a',
    borderRadius: 5,
    padding: 8,
    fontSize: 12,
    lineHeight: 1.4,
  },
  buttonRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  primaryButton: {
    background: '#20314a',
    color: '#d9e8ff',
    border: '1px solid #4a90d9',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  secondaryButton: {
    background: '#1d241f',
    color: '#bfe5c8',
    border: '1px solid #345c3b',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  ghostButton: {
    background: 'transparent',
    color: '#aaa',
    border: '1px solid #333',
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
  error: {
    color: '#ff9b9b',
    background: '#2a1515',
    border: '1px solid #4a2525',
    borderRadius: 4,
    padding: 8,
    fontSize: 11,
    lineHeight: 1.4,
  },
  candidateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 10,
    marginTop: 10,
  },
  card: {
    background: '#181818',
    border: '1px solid #30343a',
    borderRadius: 6,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    color: '#eee',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.25,
  },
  muted: {
    color: '#777',
    fontSize: 10,
    lineHeight: 1.35,
  },
  badgeRow: {
    display: 'flex',
    gap: 5,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 999,
    border: '1px solid #ffffff18',
    padding: '2px 7px',
    fontSize: 10,
    lineHeight: 1.3,
  },
  qty: {
    marginLeft: 'auto',
    color: '#aaa',
    fontSize: 11,
  },
  explanation: {
    margin: 0,
    color: '#b8b8b8',
    fontSize: 11,
    lineHeight: 1.45,
  },
  noteList: {
    margin: '0 0 0 16px',
    padding: 0,
    color: '#d8c895',
    fontSize: 11,
    lineHeight: 1.4,
  },
  linkList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  link: {
    color: '#9ab6d8',
    fontSize: 10,
    textDecoration: 'none',
  },
  inventoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  inventoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: 5,
    padding: 8,
  },
  recommendationList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  emptyPanel: {
    background: '#101010',
    border: '1px solid #242424',
    borderRadius: 5,
    color: '#666',
    padding: 12,
    fontSize: 12,
    lineHeight: 1.4,
  },
  callout: {
    background: '#101923',
    border: '1px solid #22384d',
    borderRadius: 5,
    color: '#b9d6f2',
    padding: 8,
    fontSize: 11,
    lineHeight: 1.4,
  },
}
