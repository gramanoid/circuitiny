# Physical Breadboard Wiring Constraints Design

## Context

Circuitiny currently renders components and wires as a simplified 3D scene paired with schematic/code/simulation behavior. That is useful for abstract understanding, but beginners struggle because breadboards have hidden continuity. The physical placement matters: two button legs in the same row can be electrically useless, a rail can be split, and a resistor must bridge different tie groups to do anything.

This change introduces a physical layer under the existing net model. The app can still support schematic-first editing, but beginner recipes and realistic 3D builds should use a breadboard-aware topology.

## Goals / Non-Goals

**Goals:**

- Model common solderless breadboards and ESP32 dev board placement accurately enough for beginner circuits.
- Snap component legs and jumpers to valid holes.
- Infer nets from hole continuity and physical jumpers.
- Validate physical mistakes that do not appear in an abstract schematic.
- Keep schematic, 3D, simulation, generated code, and recipes consistent after physical edits.
- Let a learner export a real-world placement guide.

**Non-Goals:**

- Not aiming to provide a full PCB autorouter.
- Exclude mechanical CAD precision beyond beginner breadboard accuracy.
- Initial release will not support every breadboard brand.
- Do not force breadboard mode for users who prefer abstract schematic editing.

## Decisions

### Decision: `PhysicalLayout` is a physical layer beside the schematic

The schematic continues to express intended connections. `PhysicalLayout`, placements, jumpers, and derived physical nets describe what the breadboard currently creates.

### Decision: Net mismatch is explicit

When schematic nets and physical nets differ, Circuitiny reports `netMismatch`-style physical DRC findings instead of silently rewriting the schematic.

### Decision: Breadboard mode is beginner-oriented and opt-in

Abstract schematic editing remains available. Physical mode adds stricter guidance when the learner wants a real breadboard build plan.

### Decision: Physical DRC severity follows beginner risk

Same-hole conflicts, loose leads, bypassed resistors, and dangerous rail mistakes block or warn based on likely physical harm and learning impact.

## Data Model

Add `PhysicalLayout`:

- `surfaces`: breadboard, dev board headers, modules, rails.
- `holes`: row/column/rail labels, coordinates, tie group IDs, occupancy.
- `placements`: component instance, footprint, leg-to-hole mapping, rotation.
- `jumpers`: endpoint holes, color, path hints, slack/arc style.
- `derivedNets`: graph-derived nets from tie groups, component legs, and jumpers.
- `warnings`: physical DRC findings.

Catalog parts add `physicalFootprint` metadata:

- leg count, leg spacing, allowed rotations, polarity markers, package dimensions, breadboard suitability, and pin-to-leg mapping.

## Net Synchronization

The physical graph should derive nets from:

1. Breadboard tie groups.
2. Component internal pin/leg mapping.
3. Jumper wires.
4. Board headers and module breakout pins.

The editor must preserve an explicit distinction:

- `schematicNet`: what the circuit intends.
- `physicalNet`: what the layout currently creates.
- `netMismatch`: differences that need explanation.

This lets a beginner understand "your schematic says LED GPIO 23 -> resistor -> LED, but the breadboard row currently bypasses the resistor".

## Placement UX

Beginner placement tools should favor correctness:

- Show legal holes on hover/drag.
- Prevent impossible same-hole occupancy unless the app explicitly models stacked leads.
- Warn when a component leg floats outside a hole.
- Highlight all holes connected by the same tie group.
- Display labels like `E12`, `rail + left`, or `GND row`.
- Use color and wire arcs to match physical jumper colors and reduce visual confusion.

## Physical DRC

Add physical checks:

- Occupied hole conflicts.
- Loose/unplaced leads.
- Component leg shorted by same tie group.
- Button/switch orientation ineffective.
- LED/resistor not actually in series.
- Rail gap not bridged.
- Power rail connected to wrong voltage.
- Jumper endpoint not seated.
- Dev board shifted so intended pins do not align with holes.

These checks complement existing electrical DRC and should report physical root causes in beginner language.

## Integration

- Recipes can target physical holes and confirm placement per step.
- Simulation uses the resolved physical net graph when physical mode is active.
- Generated ESP-IDF code still depends on mapped microcontroller pins, but pin mapping should come from the resolved net graph.
- Reality Check uses breadboard geometry to compare photo observations against project holes.
- Codex tools can create layouts by placing parts and jumpers, then running physical DRC.

## Risks / Trade-offs

- Physical modeling can make the editor feel stricter -> allow an abstract mode and gradual beginner guidance.
- Breadboard variants differ -> start with common full/half/mini breadboards and explicit templates.
- Derived net graph may surprise users -> always explain the physical path that created a net.
- Overly realistic wires can clutter the view -> provide readable arcs, selection highlighting, and optional simplified view.

## Migration Plan

1. Introduce physical layout data structures and common breadboard templates.
2. Provide topology graph and physical DRC tests.
3. Build snapping placement UI for starter parts.
4. Sync physical nets to schematic/simulation/code.
5. Integrate recipes and build-plan export.
6. Connect to Reality Check and Codex automation.

## Open Questions

- Which breadboard variants should ship beyond common full, half, and mini boards?
- Should stacked leads ever be allowed, and how should the app explain that to beginners?
- How should schematic-first edits merge into existing physical placements without surprising the learner?
- What UI toggle best separates abstract view, physical view, and simplified physical view?
- How much Reality Check evidence should be required before a physical layout is considered hardware-ready?
