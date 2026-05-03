import { useState, useMemo, useEffect } from 'react'
import { catalog } from '../catalog'
import { useStore } from '../store'
import type { BoardDef } from '../project/component'
import TemplatePicker from './TemplatePicker'

type Tab = 'templates' | 'blank'

const CHIP_FAMILIES = ['All', 'ESP32', 'ESP32-S3', 'ESP32-C3', 'ESP32-C6'] as const
type ChipFilter = typeof CHIP_FAMILIES[number]

const CHIP_COLOR: Record<string, string> = {
  esp32:   '#ff9500',
  esp32s2: '#5ac8fa',
  esp32s3: '#4a90d9',
  esp32c3: '#34c759',
  esp32c6: '#af52de',
  esp32h2: '#ff3b30',
}

function targetMatchesFilter(target: string, filter: ChipFilter): boolean {
  if (filter === 'All') return true
  return target === filter.toLowerCase().replace('-', '')
}

function BoardCard({ board, selected, onSelect }: {
  board: BoardDef
  selected: boolean
  onSelect: () => void
}) {
  const color = CHIP_COLOR[board.target] ?? '#888'
  return (
    <button
      onClick={onSelect}
      style={{
        background: selected ? '#1a2a3a' : '#1e1e1e',
        border: `2px solid ${selected ? color : '#333'}`,
        borderRadius: 8,
        padding: '14px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        color: '#ddd',
        transition: 'border-color 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* PCB silhouette placeholder */}
      <div style={{
        width: '100%',
        height: 80,
        background: '#1a3a1a',
        borderRadius: 4,
        border: '1px solid #2a4a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <span style={{ fontSize: 10, color: '#4a9a4a', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
          {board.target.toUpperCase()}
        </span>
        {/* Pin dots along edges */}
        <PinDots count={Math.min(board.pins.length, 20)} color={color} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          background: color + '22',
          color,
          border: `1px solid ${color}44`,
          borderRadius: 3,
          fontSize: 9,
          padding: '2px 6px',
          fontFamily: 'monospace',
        }}>
          {board.target}
        </span>
        {board.boardVersion && (
          <span style={{ fontSize: 9, color: '#666' }}>v{board.boardVersion}</span>
        )}
      </div>

      <div style={{ fontWeight: 600, fontSize: 12, color: '#eee', lineHeight: 1.3 }}>
        {board.name}
      </div>

      <div style={{ fontSize: 10, color: '#888' }}>
        {board.pins.length} pins
      </div>

      {board.features && board.features.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {board.features.map((f) => (
            <span key={f} style={{
              background: '#2a2a2a',
              border: '1px solid #3a3a3a',
              borderRadius: 3,
              fontSize: 9,
              padding: '2px 5px',
              color: '#aaa',
            }}>{f}</span>
          ))}
        </div>
      )}
    </button>
  )
}

function PinDots({ count, color }: { count: number; color: string }) {
  const perSide = Math.ceil(count / 2)
  const dots = Array.from({ length: perSide }, (_, i) => i)
  return (
    <>
      {/* left row */}
      <div style={{ position: 'absolute', left: 4, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
        {dots.map((i) => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: color + '99' }} />)}
      </div>
      {/* right row */}
      <div style={{ position: 'absolute', right: 4, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
        {dots.map((i) => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: color + '99' }} />)}
      </div>
    </>
  )
}

export default function BoardPicker() {
  const createProject = useStore((s) => s.createProject)
  const close = () => useStore.setState({ showBoardPicker: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [tab, setTab] = useState<Tab>('templates')
  const [filter, setFilter] = useState<ChipFilter>('All')
  const [selectedBoardId, setSelectedBoardId] = useState('esp32-devkitc-v4')
  const [projectName, setProjectName] = useState('untitled')

  const allBoards = useMemo(() => catalog.listBoards(), [])
  const filtered = useMemo(
    () => allBoards.filter((b) => targetMatchesFilter(b.target, filter)),
    [allBoards, filter]
  )

  const selectedBoard = catalog.getBoard(selectedBoardId)

  return (
    <div onClick={close} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#141414',
        border: '1px solid #333',
        borderRadius: 10,
        width: 720,
        maxWidth: '95vw',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #2a2a2a' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#eee' }}>New Project</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                Start from a template or create a blank project
              </p>
            </div>
            <button onClick={close} style={{
              background: 'transparent', border: 'none', color: '#666', fontSize: 18,
              cursor: 'pointer', lineHeight: 1, padding: '0 2px', marginLeft: 16,
            }} title="Close">✕</button>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['templates', 'blank'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? '#2a3140' : 'transparent',
                  color: tab === t ? '#fff' : '#666',
                  border: `1px solid ${tab === t ? '#4a90d9' : 'transparent'}`,
                  borderRadius: '4px 4px 0 0',
                  padding: '6px 16px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 600 : 400,
                }}
              >
                {t === 'templates' ? 'Templates' : 'Blank Project'}
              </button>
            ))}
          </div>
        </div>

        {/* Templates tab */}
        {tab === 'templates' && (
          <TemplatePicker onClose={close} />
        )}

        {/* Blank project tab */}
        {tab === 'blank' && (
          <>
            {/* Chip filter */}
            <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', borderBottom: '1px solid #222' }}>
              {CHIP_FAMILIES.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    background: filter === f ? '#2a3140' : 'transparent',
                    color: filter === f ? '#fff' : '#666',
                    border: `1px solid ${filter === f ? '#4a90d9' : 'transparent'}`,
                    borderRadius: '4px 4px 0 0',
                    padding: '5px 12px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >{f}</button>
              ))}
            </div>

            {/* Board grid */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
              alignContent: 'start',
            }}>
              {filtered.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  selected={board.id === selectedBoardId}
                  onSelect={() => setSelectedBoardId(board.id)}
                />
              ))}
              {filtered.length === 0 && (
                <p style={{ color: '#555', fontSize: 12, gridColumn: '1/-1' }}>No boards match this filter.</p>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #2a2a2a',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
                  Project name
                </label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && selectedBoard && createProject(projectName, selectedBoardId)}
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    borderRadius: 4,
                    color: '#eee',
                    fontSize: 13,
                    padding: '6px 10px',
                    outline: 'none',
                  }}
                />
              </div>
              {selectedBoard && (
                <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>
                  {selectedBoard.name}
                </div>
              )}
              <button
                disabled={!selectedBoard}
                onClick={() => selectedBoard && createProject(projectName, selectedBoardId)}
                style={{
                  background: selectedBoard ? '#4a90d9' : '#2a2a2a',
                  color: selectedBoard ? '#fff' : '#555',
                  border: 'none',
                  borderRadius: 5,
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: selectedBoard ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                }}
              >
                Create Project
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
