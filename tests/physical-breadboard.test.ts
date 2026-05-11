import { describe, expect, it } from 'vitest'
import {
  addJumper,
  addPlacement,
  beginnerBuildPlan,
  breadboardHoleId,
  createPhysicalLayout,
  createStarterPlacement,
  derivePhysicalNets,
  placementHints,
  physicalRealityAlignmentSummary,
  projectWithPhysicalNets,
  recipePhysicalTargets,
  runPhysicalDrc,
  snapBreadboardHole,
  styleJumper,
} from '../src/physical/breadboard'
import { makeSeedProject } from './helpers'
import type { LearningRecipe } from '../src/learning/types'

describe('physical breadboard layout', () => {
  it('models breadboard row continuity and derives physical nets', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, {
      anode: breadboardHoleId(4, 'a'),
      cathode: breadboardHoleId(5, 'a'),
    }))
    layout = addPlacement(layout, createStarterPlacement('r1', 'resistor-220r', {
      kind: 'resistor',
      pins: ['in', 'out'],
    }, {
      in: breadboardHoleId(4, 'b'),
      out: breadboardHoleId(8, 'b'),
    }))

    const nets = derivePhysicalNets(layout)
    const ledResistorNet = nets.find((net) => net.endpoints.includes('led1.anode') && net.endpoints.includes('r1.in'))
    expect(ledResistorNet).toBeDefined()
    expect(ledResistorNet?.endpoints).toEqual(expect.arrayContaining(['led1.anode', 'r1.in']))
  })

  it('detects two leads in the same physical hole', () => {
    const layout = addPlacement(createPhysicalLayout('half'), createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, {
      anode: 'a1',
      cathode: 'a1',
    }))

    const findings = runPhysicalDrc(layout)
    expect(findings.some((finding) => finding.id === 'physical.occupancy.a1')).toBe(true)
  })

  it('warns when a button is placed inside one connected row', () => {
    const layout = addPlacement(createPhysicalLayout('half'), createStarterPlacement('btn1', 'button-6mm', {
      kind: 'button',
      pins: ['a', 'b'],
    }, {
      a: 'a3',
      b: 'b3',
    }))

    const findings = runPhysicalDrc(layout)
    expect(findings.some((finding) => finding.id === 'physical.button.orientation.btn1')).toBe(true)
  })

  it('reports schematic-to-physical net mismatches', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('r1', 'resistor-220r', {
      kind: 'resistor',
      pins: ['in', 'out'],
    }, { in: 'a1', out: 'a2' }))
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a8', cathode: 'a9' }))
    layout = addJumper(layout, { id: 'j1', fromHole: 'a1', toHole: 'a8' })

    const project = makeSeedProject()
    const schematicNet = project.nets.find((net) =>
      net.endpoints.includes('r1.out') && net.endpoints.includes('led1.anode'))
    expect(schematicNet).toBeDefined()
    const findings = runPhysicalDrc(layout, project)
    const mismatch = findings.find((finding) => finding.id === `physical.net.mismatch.${schematicNet!.id}`)
    expect(mismatch).toBeDefined()
    const m = mismatch!
    expect(m.severity).toBe('warning')
    expect(m.message).toMatch(/r1\.out.*led1\.anode/)
    expect(m.beginnerFix).toContain('Place those component legs')
  })

  it('does not report schematic-to-physical net mismatches when the physical net matches', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('r1', 'resistor-220r', {
      kind: 'resistor',
      pins: ['in', 'out'],
    }, { in: 'a1', out: 'a2' }))
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a8', cathode: 'a9' }))
    layout = addJumper(layout, { id: 'j1', fromHole: 'a2', toHole: 'a8' })

    const mismatchFindings = runPhysicalDrc(layout, makeSeedProject())
      .filter((finding) => finding.id.startsWith('physical.net.mismatch'))

    expect(mismatchFindings).toHaveLength(0)
  })

  it('can feed physical nets into schematic-compatible simulation and codegen inputs', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('r1', 'resistor-220r', {
      kind: 'resistor',
      pins: ['in', 'out'],
    }, { in: 'a1', out: 'a2' }))
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a8', cathode: 'a9' }))
    layout = addJumper(layout, { id: 'j1', fromHole: 'a2', toHole: 'a8' })

    const physicalProject = projectWithPhysicalNets(makeSeedProject(), layout, true)

    expect(physicalProject.nets.some((net) =>
      net.id.startsWith('phys-net') &&
      net.endpoints.includes('r1.out') &&
      net.endpoints.includes('led1.anode')
    )).toBe(true)
    expect(physicalProject.nets.some((net) =>
      net.endpoints.includes('board.gpio16') &&
      net.endpoints.includes('r1.in')
    )).toBe(true)
  })

  it('preserves partially covered abstract nets and avoids duplicate physical routes', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('r1', 'resistor-220r', {
      kind: 'resistor',
      pins: ['in', 'out'],
    }, { in: 'a1', out: 'a2' }))
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a8', cathode: 'a9' }))
    layout = addJumper(layout, { id: 'j1', fromHole: 'a2', toHole: 'a8' })
    layout = addJumper(layout, { id: 'j2', fromHole: 'b2', toHole: 'b8' })

    const project = makeSeedProject()
    const physicalProject = projectWithPhysicalNets({
      ...project,
      nets: [
        ...project.nets,
        { id: 'mixed-abstract', endpoints: ['r1.in', 'btn1.a', 'board.gpio4'] },
      ],
    }, layout, true)
    const routedLedNets = physicalProject.nets.filter((net) =>
      net.id.startsWith('phys-net') &&
      net.endpoints.includes('r1.out') &&
      net.endpoints.includes('led1.anode')
    )

    expect(routedLedNets).toHaveLength(1)
    expect(routedLedNets[0]?.endpoints).toHaveLength(new Set(routedLedNets[0]?.endpoints).size)
    expect(physicalProject.nets.some((net) =>
      net.id === 'mixed-abstract' &&
      net.endpoints.includes('r1.in') &&
      net.endpoints.includes('btn1.a') &&
      net.endpoints.includes('board.gpio4')
    )).toBe(true)
  })

  it('snaps 3D positions to nearest breadboard holes with tolerance', () => {
    const layout = createPhysicalLayout('half')
    const hole = layout.template.holes.a4
    const snap = snapBreadboardHole(layout.template, [hole.position[0] + 0.0001, hole.position[1], hole.position[2]])

    expect(snap.holeId).toBe('a4')
    expect(snap.withinTolerance).toBe(true)
    expect(snapBreadboardHole(layout.template, [1, 0, 1]).withinTolerance).toBe(false)
  })

  it('builds placement hints for occupied holes, floating leads, button orientation, and bad rotations', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a3', cathode: 'a4' }))
    const candidate = {
      ...createStarterPlacement('btn1', 'button-6mm', {
        kind: 'button' as const,
        pins: ['a', 'b'],
        requiredPins: ['a', 'b', 'c'],
      }, { a: 'a3', b: 'b3' }),
      rotation: 45 as 0,
    }

    const hints = placementHints(layout, candidate)
    expect(hints.map((hint) => hint.id)).toEqual(expect.arrayContaining([
      'physical.placement.rotation.btn1',
      'physical.placement.occupied.btn1.a',
      'physical.placement.floating.btn1.c',
      'physical.placement.button-gap.btn1',
    ]))
  })

  it('creates readable jumper styling and beginner build plan exports', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a1', cathode: 'a2' }))
    layout = addJumper(layout, { id: 'j1', fromHole: 'a1', toHole: 'j10' })

    expect(styleJumper({ id: 'j1', fromHole: 'a1', toHole: 'j10' }, 2)).toMatchObject({
      color: 'yellow',
      pathLabel: 'A1 -> J10 (yellow)',
    })
    const plan = beginnerBuildPlan(layout)
    expect(plan.orientation).toContain('row 1')
    expect(plan.placements.join(' ')).toContain('led1')
    expect(plan.jumpers.join(' ')).toContain('A1 -> J10')
  })

  it('maps recipe wiring steps to physical holes for highlights', () => {
    let layout = createPhysicalLayout('half')
    layout = addPlacement(layout, createStarterPlacement('r1', 'resistor-220r', {
      kind: 'resistor',
      pins: ['in', 'out'],
    }, { in: 'a1', out: 'a2' }))
    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a8', cathode: 'a9' }))
    const recipe: LearningRecipe = {
      id: 'physical-targets',
      goal: 'Map recipe targets',
      estimatedTime: '5 min',
      concepts: [],
      requiredParts: [],
      wiringSteps: [{ id: 'wire-1', from: 'r1.out', to: 'led1.anode', title: 'Wire LED', why: 'Complete circuit', expected: 'LED path exists' }],
      checkpoints: [],
      hardwareNotes: [],
      followUpExperiments: [],
      steps: [],
    }

    expect(recipePhysicalTargets(recipe, layout)[0]).toMatchObject({
      fromHole: 'a2',
      toHole: 'a8',
      highlightHoles: ['a2', 'a8'],
    })
  })

  it('connects physical layout state to Reality Check alignment readiness', () => {
    let layout = createPhysicalLayout('half')
    const emptySummary = physicalRealityAlignmentSummary(layout, {
      ok: true,
      confidence: 'high',
      boardDetected: true,
      breadboardDetected: true,
      retakeReasons: [],
    })
    expect(emptySummary.readyForMapping).toBe(false)

    layout = addPlacement(layout, createStarterPlacement('led1', 'led-5mm-red', {
      kind: 'led',
      pins: ['anode', 'cathode'],
    }, { anode: 'a1', cathode: 'a2' }))
    const blurrySummary = physicalRealityAlignmentSummary(layout, {
      ok: false,
      confidence: 'low',
      boardDetected: true,
      breadboardDetected: true,
      retakeReasons: ['Photo is blurry.'],
    })
    expect(blurrySummary.readyForMapping).toBe(false)
    expect(blurrySummary.nextAction).toContain('blurry')

    const readySummary = physicalRealityAlignmentSummary(layout, {
      ok: true,
      confidence: 'high',
      boardDetected: true,
      breadboardDetected: true,
      retakeReasons: [],
    })
    expect(readySummary).toMatchObject({
      readyForMapping: true,
      placementCount: 1,
      template: 'half-breadboard',
    })
  })
})
