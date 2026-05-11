import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { generate, type GeneratedFiles } from '../codegen/generate'
import { beginnerCodegenError } from '../codegen/errors'
import { getCheckpoint, getRecipe, getRecipeStep } from '../learning/recipes'
import { ERROR_PANEL_STYLE } from './sharedStyles'

type FileKey = keyof GeneratedFiles

const FILES: FileKey[] = ['main/app_main.c', 'main/CMakeLists.txt', 'sdkconfig.defaults']
const EDITABLE: FileKey[] = ['main/app_main.c']

export default function CodePane() {
  const project = useStore((s) => s.project)
  const setCustomCode = useStore((s) => s.setCustomCode)
  const activeRecipeId = useStore((s) => s.activeRecipeId)
  const recipeStepIndex = useStore((s) => s.recipeStepIndex)
  const [active, setActive] = useState<FileKey>('main/app_main.c')
  const generated = useMemo(() => {
    try {
      return { ok: true as const, ...generate(project) }
    } catch (error) {
      console.error('Code generation failed.', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { ok: false as const, error: beginnerCodegenError(error) }
    }
  }, [project])
  const { recipe, recipeStep, checkpoint } = useMemo(() => {
    const recipe = getRecipe(activeRecipeId)
    const recipeStep = getRecipeStep(activeRecipeId, recipeStepIndex)
    return { recipe, recipeStep, checkpoint: getCheckpoint(recipe, recipeStep?.checkpointId) }
  }, [activeRecipeId, recipeStepIndex])

  const customCode = project.customCode ?? {}
  const isCustom = active in customCode
  if (!generated.ok) {
    return (
      <div style={ERROR_PANEL_STYLE} role="alert" aria-live="assertive">
        {generated.error}
      </div>
    )
  }
  const { files, ir } = generated
  const activeContent = isCustom ? customCode[active as string] : files[active]
  const isEditable = EDITABLE.includes(active)

  function handleEdit(value: string) {
    setCustomCode(active, value)
  }

  function handleReset() {
    const next = { ...customCode }
    delete next[active as string]
    useStore.setState((s) => ({ project: { ...s.project, customCode: next } }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #222',
                    alignItems: 'center' }}>
        {FILES.map((f) => (
          <button key={f} onClick={() => setActive(f)} style={tabStyle(active === f)}>
            {f}
            {f in customCode && (
              <span style={{ marginLeft: 4, fontSize: 8, color: '#7fc97a',
                             background: '#0d2a0d', borderRadius: 3, padding: '0 3px' }}>
                edited
              </span>
            )}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isCustom && isEditable && (
            <button onClick={handleReset} style={resetStyle} title="Discard edits and restore generated code">
              reset
            </button>
          )}
          <span style={{ fontSize: 10, color: '#888' }}>
            {isCustom
              ? <span style={{ color: '#7fc97a' }}>edited</span>
              : <>{ir.components.length} comps · {ir.buses.length} buses
                  {ir.issues.length > 0 && <span style={{ color: '#ffcc00' }}> · {ir.issues.length} unwired</span>}
                </>
            }
          </span>
        </div>
      </div>
      {recipe && (
        <div style={{
          padding: '6px 10px',
          borderBottom: '1px solid #1f2b38',
          background: '#0e1720',
          color: '#9ecbff',
          fontSize: 10,
          lineHeight: 1.4,
        }}>
          <b>Beginner code note</b>
          {checkpoint?.behaviorId
            ? <>: behavior <code>{checkpoint.behaviorId}</code> is generated from the recipe step. Look for GPIO setup, timer/edge handling, and the action that changes the output.</>
            : <>: generated ESP-IDF files come from the current circuit, nets, and behaviors.</>
          }
        </div>
      )}
      {isEditable
        ? <textarea
            value={activeContent}
            onChange={(e) => handleEdit(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, margin: 0, padding: 10, border: 'none', outline: 'none', resize: 'none',
              fontFamily: "'SF Mono', Menlo, monospace", fontSize: 11, lineHeight: 1.45,
              color: '#ddd', background: '#0f0f0f', whiteSpace: 'pre', overflowWrap: 'normal',
              overflowX: 'auto',
            }}
          />
        : <pre style={{
            flex: 1, margin: 0, overflow: 'auto', padding: 10,
            fontFamily: "'SF Mono', Menlo, monospace", fontSize: 11, lineHeight: 1.45,
            color: '#ddd', background: '#0f0f0f', whiteSpace: 'pre'
          }}>{activeContent}</pre>
      }
    </div>
  )
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: active ? '#2a3140' : 'transparent',
  color: active ? '#fff' : '#888',
  border: '1px solid ' + (active ? '#4a90d9' : '#333'),
  borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
  fontFamily: "'SF Mono', Menlo, monospace"
})

const resetStyle: React.CSSProperties = {
  background: 'transparent', color: '#888', border: '1px solid #333',
  borderRadius: 3, padding: '1px 6px', fontSize: 10, cursor: 'pointer'
}
