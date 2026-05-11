import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDrc } from '../src/drc'
import {
  analyzeRealityCheck,
  checkRealityCheckQuota,
  createRealityCheckSession,
  evaluateRealityImageAlignment,
  installRealityImageUnloadCleanup,
  loadRealityCheckSessions,
  observationsFromRealityFixture,
  realityCheckStorageKey,
  realityReadiness,
  runApprovedRealityVision,
  registerRealitySessionImageRef,
  releaseAllRealitySessionImageRefs,
  releaseRealitySessionImageRef,
  saveRealityCheckSession,
  type RealityObservation,
} from '../src/reality/check'
import { makeSeedProject, memoryStorage } from './helpers'

afterEach(() => {
  releaseAllRealitySessionImageRefs()
  vi.restoreAllMocks()
})

describe('Reality Check', () => {
  it('confirms observed wires that match project nets', () => {
    const project = makeSeedProject()
    const observations: RealityObservation[] = [{
      id: 'wire-1',
      kind: 'wire',
      label: 'gray jumper',
      endpoints: ['r1.out', 'led1.anode'],
      confidence: 'high',
    }]
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, observations)

    const analyzed = analyzeWithDrc(project, session)
    expect(analyzed.findings.some((finding) => finding.kind === 'confirmed')).toBe(true)
    expect(realityReadiness(analyzed.findings)).toBe('pass')
  })

  it('blocks mismatched physical wires before hardware', () => {
    const project = makeSeedProject()
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [{
      id: 'wire-2',
      kind: 'wire',
      label: 'blue jumper',
      endpoints: ['r1.out', 'btn1.a'],
      confidence: 'high',
    }])

    const analyzed = analyzeWithDrc(project, session)
    expect(analyzed.findings.some((finding) => finding.kind === 'blocking')).toBe(true)
    expect(realityReadiness(analyzed.findings)).toBe('blocked')
  })

  it('keeps low-confidence local observations uncertain without AI vision approval', () => {
    const project = makeSeedProject()
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [{
      id: 'wire-3',
      kind: 'wire',
      label: 'unclear jumper',
      endpoints: ['r1.out', 'led1.anode'],
      confidence: 'low',
    }])

    const analyzed = analyzeWithDrc(project, session)
    expect(analyzed.findings.some((finding) => finding.kind === 'uncertain')).toBe(true)
    expect(realityReadiness(analyzed.findings)).toBe('warn')
  })

  it('returns beginner retake reasons for low-quality alignment fixtures', () => {
    const alignment = evaluateRealityImageAlignment({
      width: 320,
      height: 240,
      blurScore: 0.8,
      angleDegrees: 50,
      occlusionRatio: 0.4,
      boardConfidence: 0.2,
      breadboardConfidence: 0.4,
    })

    expect(alignment.ok).toBe(false)
    expect(alignment.confidence).toBe('low')
    expect(alignment.retakeReasons.join(' ')).toContain('blurry')
    expect(alignment.retakeReasons.join(' ')).toContain('ESP32 board')
    expect(alignment.retakeReasons.join(' ')).toContain('Breadboard')
  })

  it('passes alignment when fixture image quality and board confidence are sufficient', () => {
    expect(evaluateRealityImageAlignment({
      width: 1280,
      height: 720,
      blurScore: 0.1,
      angleDegrees: 8,
      occlusionRatio: 0.05,
      boardConfidence: 0.9,
      breadboardConfidence: 0.88,
    })).toMatchObject({
      ok: true,
      confidence: 'high',
      boardDetected: true,
      breadboardDetected: true,
      retakeReasons: [],
    })
  })

  it('blocks observed reversed polarity before hardware', () => {
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [{
      id: 'polarity-1',
      kind: 'polarity',
      label: 'LED polarity',
      componentInstance: 'led1',
      polarityReversed: true,
      confidence: 'high',
    }])

    const analyzed = analyzeWithDrc(makeSeedProject(), session)
    expect(analyzed.findings.some((finding) => finding.kind === 'blocking' && finding.title.includes('Polarity'))).toBe(true)
    expect(realityReadiness(analyzed.findings)).toBe('blocked')
  })

  it('blocks camera checks without camera consent', () => {
    const session = createRealityCheckSession('camera', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    })

    const analyzed = analyzeWithDrc(makeSeedProject(), session)
    expect(analyzed.findings.some((finding) => finding.id === 'reality.privacy.camera')).toBe(true)
    expect(realityReadiness(analyzed.findings)).toBe('blocked')
  })

  it('requires explicit AI vision approval before calling the vision adapter', async () => {
    const adapter = { analyze: vi.fn(async () => []) }
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [], { kind: 'blob-url', url: 'blob:vision-photo' })

    await expect(runApprovedRealityVision(makeSeedProject(), session, adapter)).resolves.toEqual({
      ok: false,
      error: 'AI vision requires explicit approval for this Reality Check.',
    })
    expect(adapter.analyze).not.toHaveBeenCalled()
  })

  it('keeps AI vision observations as learner-confirmed drafts', async () => {
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: true,
    }, [], { kind: 'blob-url', url: 'blob:vision-photo' })
    const adapter = {
      analyze: vi.fn(async () => [{
        id: 'vision-wire-1',
        kind: 'wire' as const,
        label: 'AI guessed jumper',
        endpoints: ['r1.out', 'led1.anode'] as [string, string],
        confidence: 'high' as const,
      }]),
    }

    const result = await runApprovedRealityVision(makeSeedProject(), session, adapter)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(adapter.analyze).toHaveBeenCalled()
    expect(result.session.observations[0]).toMatchObject({
      id: 'vision-wire-1',
      confidence: 'low',
    })
    expect(result.session.observations[0]?.notes).toContain('AI vision draft')
    expect(result.session.findings.some((finding) => finding.kind === 'uncertain')).toBe(true)
  })

  it('maps fixture-detected parts, wires, rails, polarity, and unknown objects into observations', () => {
    const project = makeSeedProject()
    const observations = observationsFromRealityFixture(project, {
      components: [
        { label: 'red LED', componentInstance: 'led1' },
        { label: '220 ohm resistor', componentInstance: 'r1' },
        { label: 'push button', componentInstance: 'btn1' },
        { label: 'mystery module' },
      ],
      wires: [{ label: 'gray jumper', endpoints: ['r1.out', 'led1.anode'] }],
      rails: [{ label: 'top power rail', notes: 'split rail gap visible' }],
      polarity: [{ componentInstance: 'led1', reversed: true }],
      unknownObjects: ['loose screw'],
    })

    expect(observations.map((observation) => observation.kind)).toEqual([
      'part',
      'part',
      'part',
      'unknown',
      'wire',
      'rail',
      'polarity',
      'unknown',
    ])
    expect(observations[0]).toMatchObject({ componentInstance: 'led1', confidence: 'high' })
    expect(observations[0]?.notes).toContain('2 pins')
    expect(observations[0]?.notes).toContain('trust')
    expect(observations[1]?.notes).toContain('resistor')
    expect(observations[2]?.notes).toContain('input')
    expect(observations[3]).toMatchObject({ confidence: 'low' })
  })

  it('turns beginner hardware clues into prioritized safety findings', () => {
    const project = makeSeedProject()
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [
      {
        id: 'short',
        kind: 'wire',
        label: 'red jumper',
        endpoints: ['board.3v3', 'board.gnd_l'],
        confidence: 'high',
      },
      {
        id: 'button',
        kind: 'part',
        label: 'button same row',
        componentInstance: 'btn1',
        confidence: 'medium',
        notes: 'button legs appear in the same row',
      },
      {
        id: 'rail',
        kind: 'rail',
        label: 'bottom rail',
        confidence: 'medium',
        notes: 'split rail gap visible',
      },
      {
        id: 'led',
        kind: 'part',
        label: 'red LED',
        componentInstance: 'led1',
        confidence: 'medium',
        notes: 'missing resistor on LED path',
      },
    ])

    const analyzed = analyzeWithDrc(project, session)
    const ids = analyzed.findings.map((finding) => finding.id)
    expect(ids).toContain('reality.short.short')
    expect(ids).toContain('reality.button.button')
    expect(ids).toContain('reality.rail-gap.rail')
    expect(ids).toContain('reality.resistor.led')
    expect(realityReadiness(analyzed.findings)).toBe('blocked')
  })

  it('translates project DRC errors into Reality Check blockers', () => {
    const seedProject = makeSeedProject()
    const project = {
      ...seedProject,
      nets: [...seedProject.nets, { id: 'bad-input-only', endpoints: ['board.gpio34', 'led1.anode'] }],
    }
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    })

    const analyzed = analyzeWithDrc(project, session)
    expect(analyzed.findings.some((finding) => finding.id.startsWith('reality.drc.'))).toBe(true)
    expect(realityReadiness(analyzed.findings)).toBe('blocked')
  })

  it('persists only session metadata and derived findings under the project schema key', () => {
    const project = makeSeedProject()
    const storage = memoryStorage()
    const session = analyzeWithDrc(project, createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [], { kind: 'blob-url', url: 'blob:reality-test' }))

    saveRealityCheckSession(project, session, storage)

    const raw = storage.getItem(realityCheckStorageKey(project))
    expect(raw).toContain('"schemaVersion":1')
    expect(raw).not.toContain('imageRef')
    expect(loadRealityCheckSessions(project, storage)[0]?.id).toBe(session.id)
  })

  it('uses storage.key with the storage receiver for browser localStorage compatibility', () => {
    const project = makeSeedProject()
    const values = new Map<string, string>()
    const storage: ReturnType<typeof memoryStorage> = {
      get length() {
        return values.size
      },
      getItem: (key) => values.get(key) ?? null,
      key(index) {
        if (this !== storage) throw new TypeError('Illegal invocation')
        return Array.from(values.keys())[index] ?? null
      },
      setItem: (key, value) => {
        values.set(key, value)
      },
      removeItem: (key) => {
        values.delete(key)
      },
      clear: () => values.clear(),
    }
    const session = analyzeWithDrc(project, createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }))

    saveRealityCheckSession(project, session, storage)

    expect(loadRealityCheckSessions(project, storage)[0]?.id).toBe(session.id)
  })

  it('ignores saved Reality Check sessions when storage reads fail', () => {
    const project = makeSeedProject()
    const storage = {
      get length() {
        return 0
      },
      getItem: vi.fn(() => {
        throw new Error('storage unavailable')
      }),
      key: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }

    expect(loadRealityCheckSessions(project, storage)).toEqual([])
  })

  it('ignores saved Reality Check sessions when migration writes fail', () => {
    const project = makeSeedProject()
    const legacySession = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    })
    const storage = memoryStorage()
    const key = realityCheckStorageKey(project)
    storage.setItem(key, JSON.stringify(legacySession))
    const failingStorage: typeof storage = {
      ...storage,
      setItem: vi.fn(() => {
        throw new Error('migration write blocked')
      }),
    }

    expect(loadRealityCheckSessions(project, failingStorage)).toEqual([])
  })

  it('keeps transient Reality Check image refs out of storage and revokes them on cleanup', () => {
    const project = makeSeedProject()
    const storage = memoryStorage()
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [], { kind: 'blob-url', url: 'blob:transient-reality-photo' })
    registerRealitySessionImageRef(session)

    saveRealityCheckSession(project, session, storage)
    releaseRealitySessionImageRef(session)

    expect(storage.getItem(realityCheckStorageKey(project))).not.toContain('blob:transient-reality-photo')
    expect(revoke).toHaveBeenCalledWith('blob:transient-reality-photo')
  })

  it('registers a window unload cleanup for transient Reality Check image refs', () => {
    const events = new Map<string, EventListenerOrEventListenerObject>()
    const target = {
      addEventListener: vi.fn((name: string, listener: EventListenerOrEventListenerObject) => events.set(name, listener)),
      removeEventListener: vi.fn((name: string) => events.delete(name)),
    }
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [], { kind: 'blob-url', url: 'blob:unload-reality-photo' })
    registerRealitySessionImageRef(session)

    const uninstall = installRealityImageUnloadCleanup(target)
    const beforeUnload = events.get('beforeunload')
    if (typeof beforeUnload === 'function') beforeUnload(new Event('beforeunload'))
    uninstall()

    expect(revoke).toHaveBeenCalledWith('blob:unload-reality-photo')
    expect(target.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    expect(target.removeEventListener).toHaveBeenCalledWith('unload', expect.any(Function))
    expect(target.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function))
  })

  it('keeps saved Reality Check sessions readable when project schemaVersion changes forward', () => {
    const project = makeSeedProject()
    const storage = memoryStorage()
    const session = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [{
      id: 'wire-1',
      kind: 'wire',
      label: 'gray jumper',
      endpoints: ['r1.out', 'led1.anode'],
      confidence: 'high',
    }])
    saveRealityCheckSession(project, session, storage)

    // Reality Check persistence is keyed by project name and stores its own schemaVersion;
    // loading through a newer project schema verifies the two versions are decoupled.
    const migrated = loadRealityCheckSessions({ ...project, schemaVersion: 2 }, storage)[0]
    expect(migrated?.source).toBe('photo')
    expect(migrated?.consent).toEqual({
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    })
    expect(migrated?.observations[0]).toMatchObject({
      id: 'wire-1',
      endpoints: ['r1.out', 'led1.anode'],
      confidence: 'high',
    })
  })

  it('purges expired Reality Check sessions before saving near quota', () => {
    const project = makeSeedProject()
    const storage = memoryStorage()
    const expiredSession = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [{
      id: 'old-observation',
      kind: 'unknown',
      label: 'old large session',
      confidence: 'low',
      notes: 'x'.repeat(2_000_000),
    }])
    const oldKey = 'circuitiny.reality-check.old-project'
    storage.setItem(oldKey, JSON.stringify({
      version: 1,
      projectId: 'old-project:esp32:freenove-esp32-wrover-dev',
      schemaVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      session: expiredSession,
    }))

    saveRealityCheckSession(project, createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }), storage)

    expect(storage.getItem(oldKey)).toBeNull()
    expect(storage.getItem(realityCheckStorageKey(project))).not.toBeNull()
  })

  it('keeps quota estimates accurate across pending save cycles', () => {
    const project = makeSeedProject()
    const storage = memoryStorage()
    const key = realityCheckStorageKey(project)
    const firstSession = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    })
    saveRealityCheckSession(project, firstSession, storage)
    const firstRaw = storage.getItem(key)
    expect(firstRaw).toBeTruthy()
    expect(checkRealityCheckQuota(storage).usedBytes).toBe((firstRaw ?? '').length * 2)

    const secondSession = createRealityCheckSession('photo', {
      cameraGranted: false,
      imageStorageAllowed: false,
      aiVisionAllowed: false,
    }, [{
      id: 'long-note',
      kind: 'unknown',
      label: 'long note',
      confidence: 'low',
      notes: 'x'.repeat(1000),
    }])
    saveRealityCheckSession(project, secondSession, storage)
    const secondRaw = storage.getItem(key)
    expect(secondRaw).toBeTruthy()
    expect(checkRealityCheckQuota(storage).usedBytes).toBe((secondRaw ?? '').length * 2)
  })
})

function analyzeWithDrc(project: ReturnType<typeof makeSeedProject>, session: Parameters<typeof analyzeRealityCheck>[1]) {
  return analyzeRealityCheck(project, session, runDrc(project))
}
