import type { Net, Project } from '../project/schema'
import { catalog } from '../catalog'
import type { LearningRecipe } from '../learning/types'
import type { RealityImageAlignment } from '../reality/check'

export type BreadboardKind = 'mini' | 'half' | 'full'
export type BreadboardColumn = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | '+' | '-'
type TieColumn = Exclude<BreadboardColumn, '+' | '-'>
export type PhysicalFindingSeverity = 'error' | 'warning' | 'info'

export interface BreadboardHole {
  id: string
  label: string
  row: number
  column: BreadboardColumn
  tieGroupId: string
  position: [number, number, number]
  rail?: 'positive' | 'negative'
  segment?: 'top' | 'bottom' | 'main'
}

export interface BreadboardTemplate {
  id: string
  kind: BreadboardKind
  label: string
  rows: number
  holes: Record<string, BreadboardHole>
}

export interface PhysicalFootprint {
  kind: 'led' | 'resistor' | 'button' | 'module' | 'jumper' | 'generic'
  pins: string[]
  requiredPins?: string[]
}

export interface PhysicalPlacement {
  componentInstance: string
  componentId: string
  footprint: PhysicalFootprint
  legHoles: Record<string, string>
  rotation?: 0 | 90 | 180 | 270
}

export interface PhysicalJumper {
  id: string
  fromHole: string
  toHole: string
  color?: string
}

export interface PhysicalLayout {
  template: BreadboardTemplate
  placements: PhysicalPlacement[]
  jumpers: PhysicalJumper[]
}

export interface StarterLayoutStatus {
  warnings: string[]
  partial: boolean
}

export interface PhysicalNet {
  id: string
  tieGroups: string[]
  holes: string[]
  endpoints: string[]
}

export interface PhysicalDrcFinding {
  id: string
  severity: PhysicalFindingSeverity
  title: string
  message: string
  refs: string[]
  beginnerFix: string
}

export interface BreadboardSnapResult {
  holeId: string | null
  distanceM: number
  withinTolerance: boolean
}

export interface PlacementHint {
  id: string
  severity: PhysicalFindingSeverity
  title: string
  message: string
  refs: string[]
}

export interface StyledJumper {
  id: string
  fromHole: string
  toHole: string
  color: string
  pathLabel: string
}

export interface BeginnerBuildPlan {
  orientation: string
  placements: string[]
  jumpers: string[]
  warnings: string[]
}

export interface RecipePhysicalTarget {
  id: string
  title: string
  from: string
  to: string
  fromHole: string | null
  toHole: string | null
  highlightHoles: string[]
}

export interface PhysicalRealityAlignmentSummary {
  readyForMapping: boolean
  template: string
  placementCount: number
  jumperCount: number
  retakeReasons: string[]
  nextAction: string
}

const LEFT_COLUMNS: TieColumn[] = ['a', 'b', 'c', 'd', 'e']
const RIGHT_COLUMNS: TieColumn[] = ['f', 'g', 'h', 'i', 'j']
const STARTER_PIN_COLUMNS: TieColumn[] = ['a', 'f', 'b', 'g', 'c', 'h', 'd', 'i', 'e', 'j']
const READABLE_JUMPER_COLORS = ['blue', 'gray', 'yellow', 'green', 'red', 'black'] as const
const HOLE_SPACING_M = 0.00254
const LARGE_PROJECT_COMPONENT_THRESHOLD = 9
const BASE_ROW_OFFSET = 2
const MIN_COMPONENT_ROW_SPACING = 3
const EXTRA_ROW_PADDING = 1

export function createBreadboardTemplate(kind: BreadboardKind = 'half'): BreadboardTemplate {
  const rows = kind === 'mini' ? 17 : kind === 'full' ? 63 : 30
  const holes: Record<string, BreadboardHole> = {}

  for (let row = 1; row <= rows; row++) {
    for (const column of LEFT_COLUMNS) {
      const id = breadboardHoleId(row, column)
      holes[id] = makeHole(id, row, column, `row-${row}-left`)
    }
    for (const column of RIGHT_COLUMNS) {
      const id = breadboardHoleId(row, column)
      holes[id] = makeHole(id, row, column, `row-${row}-right`)
    }
    for (const rail of ['+', '-'] as const) {
      for (const segment of railSegmentsForKind(kind)) {
        const id = `${segment}${rail}${row}`
        holes[id] = {
          id,
          label: `${segment} ${rail}${row}`,
          row,
          column: rail,
          tieGroupId: `${segment}-${rail === '+' ? 'positive' : 'negative'}-rail`,
          position: [
            (row - 1) * HOLE_SPACING_M,
            0,
            rail === '+' ? -0.014 : -0.017,
          ],
          rail: rail === '+' ? 'positive' : 'negative',
          segment,
        }
      }
    }
  }

  return {
    id: `${kind}-breadboard`,
    kind,
    label: `${kind[0].toUpperCase()}${kind.slice(1)} breadboard`,
    rows,
    holes,
  }
}

export function createPhysicalLayout(kind: BreadboardKind = 'half'): PhysicalLayout {
  return {
    template: createBreadboardTemplate(kind),
    placements: [],
    jumpers: [],
  }
}

export function breadboardHoleId(row: number, column: TieColumn): string {
  return `${column}${row}`
}

export function addPlacement(layout: PhysicalLayout, placement: PhysicalPlacement): PhysicalLayout {
  return addPlacements(layout, [placement])
}

export function addPlacements(layout: PhysicalLayout, placements: PhysicalPlacement[]): PhysicalLayout {
  if (placements.length === 0) return layout
  const replacements = new Map<string, PhysicalPlacement>()
  for (const placement of placements) replacements.set(placement.componentInstance, placement)
  return {
    ...layout,
    placements: [
      ...layout.placements.filter((existing) => !replacements.has(existing.componentInstance)),
      ...replacements.values(),
    ],
  }
}

export function addJumper(layout: PhysicalLayout, jumper: PhysicalJumper): PhysicalLayout {
  return addJumpers(layout, [jumper])
}

export function addJumpers(layout: PhysicalLayout, jumpers: PhysicalJumper[]): PhysicalLayout {
  if (jumpers.length === 0) return layout
  const replacements = new Map<string, PhysicalJumper>()
  for (const jumper of jumpers) replacements.set(jumper.id, jumper)
  return {
    ...layout,
    jumpers: [
      ...layout.jumpers.filter((existing) => !replacements.has(existing.id)),
      ...replacements.values(),
    ],
  }
}

export function snapBreadboardHole(
  template: BreadboardTemplate,
  position: [number, number, number],
  maxDistanceM = HOLE_SPACING_M * 0.75,
): BreadboardSnapResult {
  let nearest: BreadboardHole | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const hole of Object.values(template.holes)) {
    const distance = distance3(position, hole.position)
    if (distance < nearestDistance) {
      nearest = hole
      nearestDistance = distance
    }
  }
  return {
    holeId: nearest?.id ?? null,
    distanceM: nearestDistance,
    withinTolerance: nearestDistance <= maxDistanceM,
  }
}

export function placementHints(layout: PhysicalLayout, placement: PhysicalPlacement): PlacementHint[] {
  const hints: PlacementHint[] = []
  const rotation = placement.rotation as number | undefined
  if (rotation !== undefined && ![0, 90, 180, 270].includes(rotation)) {
    hints.push({
      id: `physical.placement.rotation.${placement.componentInstance}`,
      severity: 'error',
      title: 'Unsupported rotation',
      message: `${placement.componentInstance} rotation must be 0, 90, 180, or 270 degrees.`,
      refs: [placement.componentInstance],
    })
  }

  const occupied = occupiedHoles(layout, placement.componentInstance)
  for (const [pin, holeId] of Object.entries(placement.legHoles)) {
    const occupants = occupied.get(holeId) ?? []
    if (!layout.template.holes[holeId]) {
      hints.push({
        id: `physical.placement.missing-hole.${placement.componentInstance}.${pin}`,
        severity: 'error',
        title: 'No breadboard hole',
        message: `${placement.componentInstance}.${pin} is aimed at ${holeId}, which is not on this breadboard.`,
        refs: [`${placement.componentInstance}.${pin}`],
      })
      continue
    }
    if (occupants.length > 0) {
      hints.push({
        id: `physical.placement.occupied.${placement.componentInstance}.${pin}`,
        severity: 'error',
        title: 'Hole already occupied',
        message: `${holeId.toUpperCase()} already has ${occupants.join(', ')}.`,
        refs: [`${placement.componentInstance}.${pin}`, ...occupants],
      })
    }
  }

  const missingRequired = (placement.footprint.requiredPins ?? placement.footprint.pins)
    .filter((pin) => !placement.legHoles[pin])
  for (const pin of missingRequired) {
    hints.push({
      id: `physical.placement.floating.${placement.componentInstance}.${pin}`,
      severity: 'error',
      title: 'Floating lead',
      message: `${placement.componentInstance}.${pin} still needs a breadboard hole.`,
      refs: [`${placement.componentInstance}.${pin}`],
    })
  }

  if (placement.footprint.kind === 'button' && placementUsesSingleTieGroup(layout, placement)) {
    hints.push({
      id: `physical.placement.button-gap.${placement.componentInstance}`,
      severity: 'warning',
      title: 'Button should bridge the center gap',
      message: 'A tactile button usually needs legs on both sides of the breadboard gap so pressing it changes the circuit.',
      refs: [placement.componentInstance],
    })
  }

  return hints
}

export function styleJumper(jumper: PhysicalJumper, index = 0): StyledJumper {
  const color = jumper.color?.trim() || READABLE_JUMPER_COLORS[index % READABLE_JUMPER_COLORS.length]
  return {
    id: jumper.id,
    fromHole: jumper.fromHole,
    toHole: jumper.toHole,
    color,
    pathLabel: `${jumper.fromHole.toUpperCase()} -> ${jumper.toHole.toUpperCase()} (${color})`,
  }
}

export function beginnerBuildPlan(layout: PhysicalLayout): BeginnerBuildPlan {
  const warnings = runPhysicalDrc(layout).map((finding) => `${finding.title}: ${finding.beginnerFix}`)
  return {
    orientation: `${layout.template.label}: keep row 1 on the left, the center gap between E and F, and rails facing you before matching hole labels.`,
    placements: layout.placements.map((placement) => {
      const holes = Object.entries(placement.legHoles)
        .map(([pin, hole]) => `${pin}=${hole.toUpperCase()}`)
        .join(', ')
      return `${placement.componentInstance} (${placement.componentId}) ${holes || 'has no placed leads yet'}.`
    }),
    jumpers: layout.jumpers.map((jumper, index) => {
      const styled = styleJumper(jumper, index)
      return `${styled.id}: ${styled.pathLabel}.`
    }),
    warnings,
  }
}

export function recipePhysicalTargets(recipe: LearningRecipe, layout: PhysicalLayout): RecipePhysicalTarget[] {
  return recipe.wiringSteps.map((step) => {
    const fromHole = holeForEndpoint(layout, step.from)
    const toHole = holeForEndpoint(layout, step.to)
    return {
      id: step.id,
      title: step.title,
      from: step.from,
      to: step.to,
      fromHole,
      toHole,
      highlightHoles: [fromHole, toHole].filter((hole): hole is string => !!hole),
    }
  })
}

export function physicalRealityAlignmentSummary(
  layout: PhysicalLayout,
  alignment: RealityImageAlignment,
): PhysicalRealityAlignmentSummary {
  const readyForMapping = alignment.ok && layout.placements.length > 0
  return {
    readyForMapping,
    template: layout.template.id,
    placementCount: layout.placements.length,
    jumperCount: layout.jumpers.length,
    retakeReasons: [...alignment.retakeReasons],
    nextAction: readyForMapping
      ? 'Use the highlighted physical holes and jumper paths to compare the photo with the layout.'
      : alignment.retakeReasons[0] ?? 'Add at least one physical placement before comparing a photo.',
  }
}

export function derivePhysicalNets(layout: PhysicalLayout): PhysicalNet[] {
  const knownTieGroups = new Set(Object.values(layout.template.holes).map((hole) => hole.tieGroupId))
  // Register every template tie group before find() calls; invalid jumper holes are skipped below.
  const union = new TieGroupUnion(knownTieGroups)

  for (const jumper of layout.jumpers) {
    const from = layout.template.holes[jumper.fromHole]
    const to = layout.template.holes[jumper.toHole]
    if (from && to) union.join(from.tieGroupId, to.tieGroupId)
  }

  const grouped = new Map<string, { tieGroups: Set<string>; holes: Set<string>; endpoints: Set<string> }>()
  for (const hole of Object.values(layout.template.holes)) {
    const root = union.find(hole.tieGroupId)
    if (!root) continue
    const group = grouped.get(root) ?? { tieGroups: new Set(), holes: new Set(), endpoints: new Set() }
    group.tieGroups.add(hole.tieGroupId)
    group.holes.add(hole.id)
    grouped.set(root, group)
  }

  for (const placement of layout.placements) {
    for (const [pinId, holeId] of Object.entries(placement.legHoles)) {
      const hole = layout.template.holes[holeId]
      if (!hole) continue
      const root = union.find(hole.tieGroupId)
      if (!root) continue
      const group = grouped.get(root)
      group?.endpoints.add(`${placement.componentInstance}.${pinId}`)
    }
  }

  return Array.from(grouped.values())
    .filter((group) => group.endpoints.size > 0 || layout.jumpers.some((jumper) =>
      group.holes.has(jumper.fromHole) || group.holes.has(jumper.toHole)))
    .map((group, index) => ({
      id: `phys-net-${index + 1}`,
      tieGroups: Array.from(group.tieGroups).sort(),
      holes: Array.from(group.holes).sort(naturalSort),
      endpoints: Array.from(group.endpoints).sort(),
    }))
}

export function runPhysicalDrc(layout: PhysicalLayout, project?: Project): PhysicalDrcFinding[] {
  const findings: PhysicalDrcFinding[] = []
  const physicalNets = derivePhysicalNets(layout)
  findings.push(...findMissingOrInvalidHoles(layout))
  findings.push(...findOccupancyConflicts(layout))
  findings.push(...findIneffectiveButtons(layout))
  findings.push(...findRailGapWarnings(layout, project))
  findings.push(...findSchematicMismatches(layout, project, physicalNets))
  return findings
}

export function createStarterPlacement(
  componentInstance: string,
  componentId: string,
  footprint: PhysicalFootprint,
  legHoles: Record<string, string>,
): PhysicalPlacement {
  return {
    componentInstance,
    componentId,
    footprint,
    legHoles,
  }
}

export function createStarterLayoutFromProject(project: Project): PhysicalLayout & StarterLayoutStatus {
  let layout = createPhysicalLayout(project.components.length > LARGE_PROJECT_COMPONENT_THRESHOLD ? 'full' : 'half')
  const warnings: string[] = []
  let partial = false
  const templateRows = layout.template.rows
  const starterPinColumnCount = STARTER_PIN_COLUMNS.length
  const maxBaseRow = Math.max(BASE_ROW_OFFSET, templateRows - BASE_ROW_OFFSET)
  const totalRowsNeeded = project.components.reduce((sum, component) => {
    const pinCount = catalog.getComponent(component.componentId)?.pins.length ?? 0
    return sum + Math.max(
      MIN_COMPONENT_ROW_SPACING,
      Math.max(1, Math.ceil(pinCount / starterPinColumnCount)) + EXTRA_ROW_PADDING,
    )
  }, 0)
  if (totalRowsNeeded > maxBaseRow) {
    const message = `Starter breadboard layout may omit crowded pins: ${project.components.length} components need ${totalRowsNeeded} rows on ${layout.template.label}.`
    warnings.push(message)
  }
  if (project.components.length > Math.floor(maxBaseRow / MIN_COMPONENT_ROW_SPACING)) {
    const message = `Starter breadboard layout may be crowded: ${project.components.length} components on ${layout.template.label}.`
    warnings.push(message)
  }
  let currentRow = BASE_ROW_OFFSET
  const usedHoles = new Set<string>()
  const placementsToAdd: PhysicalPlacement[] = []
  let skippedComponentsForRowExhaustion = 0
  let skippedPinsForRowExhaustion = 0
  for (const [componentIndex, component] of project.components.entries()) {
    if (currentRow > templateRows) {
      skippedComponentsForRowExhaustion += project.components.length - componentIndex
      partial = true
      break
    }
    const def = catalog.getComponent(component.componentId)
    if (!def) {
      partial = true
      warnings.push(`Component ${component.instance} uses unknown catalog ID ${component.componentId}.`)
    }
    const pins = def?.pins.map((pin) => pin.id) ?? []
    const row = currentRow
    if (pins.length === 0) {
      partial = true
      warnings.push(`Component ${component.instance} (${component.componentId}) has no catalog pins; skipping physical placement.`)
      continue
    }
    const rowsNeeded = Math.max(1, Math.ceil(pins.length / starterPinColumnCount))
    if (row + rowsNeeded - 1 > templateRows) {
      partial = true
      skippedComponentsForRowExhaustion += 1
      console.warn('starter_layout_row_exhaustion', {
        component: component.instance,
        componentId: component.componentId,
        row,
        rowsNeeded,
        templateRows,
      })
      continue
    }
    currentRow += Math.max(MIN_COMPONENT_ROW_SPACING, rowsNeeded + EXTRA_ROW_PADDING)
    const legHoles: Record<string, string> = {}
    for (const [pinIndex, pin] of pins.entries()) {
      const column = STARTER_PIN_COLUMNS[pinIndex % STARTER_PIN_COLUMNS.length]
      const pinRow = row + Math.floor(pinIndex / STARTER_PIN_COLUMNS.length)
      if (pinRow > templateRows) {
        partial = true
        skippedPinsForRowExhaustion += 1
        continue
      }
      const holeId = breadboardHoleId(pinRow, column)
      if (layout.template.holes[holeId] && !usedHoles.has(holeId)) {
        legHoles[pin] = holeId
        usedHoles.add(holeId)
      } else {
        partial = true
        const message = `Starter breadboard layout has no free generated hole for ${component.instance}.${pin}.`
        warnings.push(message)
      }
    }
    placementsToAdd.push(createStarterPlacement(component.instance, component.componentId, {
      kind: footprintKindFromComponentId(component.componentId),
      pins,
      requiredPins: pins.slice(0, Math.min(2, pins.length)),
    }, legHoles))
  }
  layout = addPlacements(layout, placementsToAdd)
  if (skippedComponentsForRowExhaustion > 0 || skippedPinsForRowExhaustion > 0) {
    warnings.push(`Starter breadboard layout ran out of rows on ${layout.template.label}: skipped ${skippedComponentsForRowExhaustion} component${skippedComponentsForRowExhaustion === 1 ? '' : 's'} and ${skippedPinsForRowExhaustion} pin placement${skippedPinsForRowExhaustion === 1 ? '' : 's'}.`)
  }
  const jumpersToAdd: PhysicalJumper[] = []
  for (const [index, net] of project.nets.entries()) {
    // board.* refs are ESP32 connector pins, not breadboard holes; board-to-breadboard jumpers need explicit mapping elsewhere.
    const componentEndpoints = net.endpoints.filter((endpoint) => !endpoint.startsWith('board.'))
    if (componentEndpoints.length < 2) continue
    if (componentEndpoints.length > 2) {
      warnings.push(`Starter layout auto-wires ${net.id} as a ${componentEndpoints.length}-endpoint, ${componentEndpoints.length - 1}-jumper chain; manually optimize complex shared nets if the physical route is confusing.`)
    }
    for (let endpointIndex = 0; endpointIndex < componentEndpoints.length - 1; endpointIndex += 1) {
      const from = componentEndpoints[endpointIndex]
      const to = componentEndpoints[endpointIndex + 1]
      const fromHole = holeForEndpoint(layout, from)
      const toHole = holeForEndpoint(layout, to)
      if (!fromHole || !toHole) {
        const missing = !fromHole ? from : to
        warnings.push(`Starter layout could not auto-wire ${net.id} (${componentEndpoints.length} component endpoints): no breadboard hole for ${missing}.`)
        continue
      }
      jumpersToAdd.push({
        id: `auto-${index + 1}-${endpointIndex + 1}`,
        fromHole,
        toHole,
        color: (index + endpointIndex) % 2 === 0 ? 'blue' : 'gray',
      })
    }
  }
  layout = addJumpers(layout, jumpersToAdd)
  return { ...layout, warnings, partial }
}

export function projectWithPhysicalNets(project: Project, layout: PhysicalLayout, physicalMode: boolean): Project {
  if (!physicalMode) return project
  const physicalNets = derivePhysicalNets(layout).filter((net) => net.endpoints.length > 0)
  if (physicalNets.length === 0) return project

  const coveredEndpoints = new Set(physicalNets.flatMap((net) => net.endpoints))
  const additivePhysicalNets: Net[] = physicalNets
    .map((net): Net => {
      const boardEndpoints = project.nets
        .filter((schematicNet) => schematicNet.endpoints.some((endpoint) => net.endpoints.includes(endpoint)))
        .flatMap((schematicNet) => schematicNet.endpoints.filter((endpoint) => endpoint.startsWith('board.')))
      return {
        id: net.id,
        endpoints: Array.from(new Set([...net.endpoints, ...boardEndpoints])).sort(),
      }
    })
    .filter((net) => net.endpoints.length >= 2)

  if (additivePhysicalNets.length === 0) return project
  const abstractOnlyNets = project.nets.filter((net) => {
    const componentEndpoints = net.endpoints.filter((endpoint) => !endpoint.startsWith('board.'))
    return componentEndpoints.length === 0 || componentEndpoints.some((endpoint) => !coveredEndpoints.has(endpoint))
  })
  // Physical nets are additive: keep abstract schematic nets that are board-only
  // or still partially uncovered so codegen/DRC do not lose incomplete learner intent.
  return { ...project, nets: [...additivePhysicalNets, ...abstractOnlyNets] }
}

function makeHole(
  id: string,
  row: number,
  column: TieColumn,
  tieGroupId: string,
): BreadboardHole {
  return {
    id,
    label: id.toUpperCase(),
    row,
    column,
    tieGroupId,
    position: [
      (row - 1) * HOLE_SPACING_M,
      0,
      columnPosition(column) * HOLE_SPACING_M,
    ],
  }
}

function columnPosition(column: TieColumn): number {
  const all = [...LEFT_COLUMNS, ...RIGHT_COLUMNS]
  return all.indexOf(column) - 4.5
}

function railSegmentsForKind(kind: BreadboardKind): Array<'top' | 'bottom'> {
  return kind === 'mini' ? ['top'] : ['top', 'bottom']
}

function findMissingOrInvalidHoles(layout: PhysicalLayout): PhysicalDrcFinding[] {
  const findings: PhysicalDrcFinding[] = []
  for (const placement of layout.placements) {
    const expectedPins = placement.footprint.requiredPins ?? placement.footprint.pins
    for (const pin of expectedPins) {
      const holeId = placement.legHoles[pin]
      if (!holeId || !layout.template.holes[holeId]) {
        findings.push({
          id: `physical.unplaced.${placement.componentInstance}.${pin}`,
          severity: 'error',
          title: 'Lead is not seated',
          message: `${placement.componentInstance}.${pin} is not placed into a valid breadboard hole.`,
          refs: [`${placement.componentInstance}.${pin}`],
          beginnerFix: 'Place that leg into a highlighted breadboard hole before simulating or building.',
        })
      }
    }
  }
  for (const jumper of layout.jumpers) {
    if (!layout.template.holes[jumper.fromHole] || !layout.template.holes[jumper.toHole]) {
      findings.push({
        id: `physical.jumper.unplaced.${jumper.id}`,
        severity: 'error',
        title: 'Jumper endpoint is not seated',
        message: `Jumper ${jumper.id} references a missing breadboard hole.`,
        refs: [jumper.id],
        beginnerFix: 'Move both jumper ends into valid breadboard holes.',
      })
    }
  }
  return findings
}

function findOccupancyConflicts(layout: PhysicalLayout): PhysicalDrcFinding[] {
  const byHole = occupiedHoles(layout)
  return Array.from(byHole.entries())
    .filter(([, occupants]) => occupants.length > 1)
    .map(([hole, occupants]) => ({
      id: `physical.occupancy.${hole}`,
      severity: 'error' as const,
      title: 'Two leads in one hole',
      message: `${hole.toUpperCase()} has ${occupants.join(', ')} in the same physical hole.`,
      refs: occupants,
      beginnerFix: 'Move one lead to another hole in the same connected row, or add a jumper if you need a shared connection.',
    }))
}

function occupiedHoles(layout: PhysicalLayout, excludingInstance?: string): Map<string, string[]> {
  const byHole = new Map<string, string[]>()
  for (const placement of layout.placements) {
    if (placement.componentInstance === excludingInstance) continue
    for (const [pin, hole] of Object.entries(placement.legHoles)) {
      if (!layout.template.holes[hole]) continue
      const occupants = byHole.get(hole) ?? []
      occupants.push(`${placement.componentInstance}.${pin}`)
      byHole.set(hole, occupants)
    }
  }
  return byHole
}

function placementUsesSingleTieGroup(layout: PhysicalLayout, placement: PhysicalPlacement): boolean {
  const tieGroups = new Set(
    Object.values(placement.legHoles)
      .map((holeId) => layout.template.holes[holeId]?.tieGroupId)
      .filter((tieGroup): tieGroup is string => !!tieGroup),
  )
  return tieGroups.size <= 1 && Object.keys(placement.legHoles).length > 0
}

function findIneffectiveButtons(layout: PhysicalLayout): PhysicalDrcFinding[] {
  const findings: PhysicalDrcFinding[] = []
  for (const placement of layout.placements) {
    if (placement.footprint.kind !== 'button') continue
    if (placementUsesSingleTieGroup(layout, placement)) {
      findings.push({
        id: `physical.button.orientation.${placement.componentInstance}`,
        severity: 'warning',
        title: 'Button will not change the circuit',
        message: `${placement.componentInstance} has its legs in one connected breadboard row.`,
        refs: [placement.componentInstance],
        beginnerFix: 'Rotate the button or bridge it across the breadboard center gap so pressing it connects two different rows.',
      })
    }
  }
  return findings
}

function findRailGapWarnings(layout: PhysicalLayout, project?: Project): PhysicalDrcFinding[] {
  if (!project) return []
  const usesTopRail = layout.jumpers.some((j) => railHoleSide(j.fromHole) === 'top' || railHoleSide(j.toHole) === 'top')
  const usesBottomRail = layout.jumpers.some((j) => railHoleSide(j.fromHole) === 'bottom' || railHoleSide(j.toHole) === 'bottom')
  if (!usesTopRail || !usesBottomRail) return []
  const hasRailBridge = layout.jumpers.some((j) =>
    (railHoleSide(j.fromHole) === 'top' && railHoleSide(j.toHole) === 'bottom') ||
    (railHoleSide(j.fromHole) === 'bottom' && railHoleSide(j.toHole) === 'top')
  )
  if (hasRailBridge) return []
  return [{
    id: 'physical.rail.split',
    severity: 'warning',
    title: 'Power rails may be split',
    message: 'The layout uses both rail segments but no bridge jumper is present.',
    refs: [project.board],
    beginnerFix: 'Add a jumper between matching rail segments, or keep the circuit on one rail segment.',
  }]
}

function railHoleSide(holeId: string): 'top' | 'bottom' | null {
  if (/^top[+-]/.test(holeId)) return 'top'
  if (/^bottom[+-]/.test(holeId)) return 'bottom'
  return null
}

function findSchematicMismatches(layout: PhysicalLayout, project?: Project, precomputedNets?: PhysicalNet[]): PhysicalDrcFinding[] {
  if (!project) return []
  const physicalEndpointSets = (precomputedNets ?? derivePhysicalNets(layout)).map((net) => new Set(net.endpoints))
  const findings: PhysicalDrcFinding[] = []
  for (const net of project.nets) {
    const componentEndpoints = net.endpoints.filter((endpoint) => !endpoint.startsWith('board.'))
    if (componentEndpoints.length < 2) continue
    const covered = physicalEndpointSets.some((set) => componentEndpoints.every((endpoint) => set.has(endpoint)))
    if (!covered) {
      findings.push({
        id: `physical.net.mismatch.${net.id}`,
        severity: 'warning',
        title: 'Physical layout does not match schematic net',
        message: `${net.id} expects ${componentEndpoints.join(' and ')} to share a physical row or jumper.`,
        refs: net.endpoints,
        beginnerFix: 'Place those component legs into connected rows or add the jumper shown by the recipe.',
      })
    }
  }
  return findings
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function distance3(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function holeForEndpoint(layout: PhysicalLayout, endpoint: string): string | null {
  const dotIndex = endpoint.indexOf('.')
  if (dotIndex <= 0 || dotIndex === endpoint.length - 1) return null
  const instance = endpoint.slice(0, dotIndex)
  const pin = endpoint.slice(dotIndex + 1)
  return layout.placements.find((placement) => placement.componentInstance === instance)?.legHoles[pin] ?? null
}

function footprintKindFromComponentId(componentId: string): PhysicalFootprint['kind'] {
  const id = componentId.toLowerCase()
  if (id.includes('button') || id.includes('switch')) return 'button'
  if (id.includes('led')) return 'led'
  if (id.includes('resistor')) return 'resistor'
  return 'module'
}

class TieGroupUnion {
  private readonly parent = new Map<string, string>()
  private readonly rank = new Map<string, number>()

  constructor(groups: Set<string>) {
    for (const group of groups) {
      this.parent.set(group, group)
      this.rank.set(group, 0)
    }
  }

  find(group: string): string | undefined {
    if (!this.parent.has(group)) {
      console.warn('Unknown breadboard tie group.', { group })
      return undefined
    }
    const path: string[] = []
    let current = group
    while (true) {
      const parent = this.parent.get(current)
      if (!parent) {
        console.warn('Unknown breadboard tie group.', { group: current })
        return undefined
      }
      path.push(current)
      if (parent === current) {
        for (const node of path) this.parent.set(node, parent)
        return parent
      }
      current = parent
    }
  }

  join(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (!rootA || !rootB) return
    if (rootA === rootB) return
    // Union-by-rank with path compression keeps tie-group joins/finds near constant time.
    const rankA = this.rank.get(rootA) ?? 0
    const rankB = this.rank.get(rootB) ?? 0
    if (rankA < rankB) {
      this.parent.set(rootA, rootB)
      return
    }
    this.parent.set(rootB, rootA)
    if (rankA === rankB) this.rank.set(rootA, rankA + 1)
  }
}
