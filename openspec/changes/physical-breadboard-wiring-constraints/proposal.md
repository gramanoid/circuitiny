# Physical Breadboard Wiring Constraints

## Why

Beginners need to understand why a schematic-correct circuit can still fail on a physical breadboard. A physical breadboard layout engine teaches that real build experience while making Circuitiny's virtual workbench closer to the desk.

## What Changes

- Add a real breadboard topology model with tie points, rails, gaps, and continuity groups.
- Snap component legs and jumper wires into physical holes instead of only abstract pin endpoints.
- Derive physical nets from breadboard hole continuity, component legs, and jumpers, then use additive continuity grouping to augment schematic nets without silently rewriting them.
- **BREAKING** Recipe definitions must migrate when beginner steps reference exact breadboard holes or physical placement checks.
- Compatible: schematic nets remain compatible through additive continuity grouping, so existing schematic-based recipes continue to work.
- Detect beginner physical mistakes such as button legs on the same row, LED/resistor not in series, rail gaps, two legs occupying the same hole, and loose/unplaced leads.
- Render breadboard-aware wires and placements in 3D and schematic views.
- Export step-by-step physical build instructions that match real holes and rows.

## Impact

- Project model: add physical placements and breadboard-derived nets while preserving schematic net compatibility.
- Renderer: add breadboard/hole/wire snapping, leg geometry, and physical jumper routing.
- DRC: add physical layout checks distinct from electrical schematic checks.
- UX: new beginner placement controls and build plan labels such as row/rail references.
- Tests: topology graph tests, placement collision tests, DRC tests, and recipe integration tests.
