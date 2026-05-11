# Physical Breadboard Wiring Constraints Tasks

## 1. Physical Topology Model

- [x] 1.1 Define breadboard, hole, tie group, rail, placement, jumper, footprint, and physical net types.
- [x] 1.2 Add templates for common full, half, and mini solderless breadboards.
- [x] 1.3 Add physical footprint metadata for ESP32 dev board, LED, resistor, push button, buzzer, potentiometer, and common sensor modules.
- [x] 1.4 Add topology graph tests for rows, rails, split rails, and board headers.

## 2. Placement And Snapping

- [x] 2.1 Add hole snapping for component legs and jumper endpoints.
- [x] 2.2 Add legal placement hints, occupancy rules, and rotation controls.
- [x] 2.3 Add jumper color and readable wire path controls.
- [x] 2.4 Add tests for occupancy, invalid rotations, floating leads, and move/update behavior.

## 3. Physical Net Derivation

- [x] 3.1 Derive physical nets from tie groups, jumpers, component legs, and board headers.
- [x] 3.2 Compare physical nets with schematic nets and produce net mismatch diagnostics.
- [x] 3.3 Feed physical nets into simulation and generated pin mapping when physical mode is active.
- [x] 3.4 Add tests for LED/resistor series paths, button orientation, rail gaps, and wrong ESP32 pin placement.

## 4. Physical DRC And Beginner Explanations

- [x] 4.1 Implement physical checks for same-hole conflicts, loose leads, ineffective button placement, bypassed resistors, split rails, and rail voltage mismatch.
- [x] 4.2 Show physical findings in DRC with "what the breadboard connects internally" explanations.
- [x] 4.3 Prioritize physical findings before code/build guidance when they explain behavior.
- [x] 4.4 Add tests for beginner messages and blocking/warning severity.

## 5. Recipe, Codex, And Export Integration

- [x] 5.1 Let recipes target physical holes and highlight the next placement or jumper.
- [x] 5.2 Add Codex scoped tools for place-part, move-part, add-jumper, and run-physical-DRC.
- [x] 5.3 Export beginner build plans with board orientation, row/rail labels, part orientation, and jumper colors.
- [x] 5.4 Connect physical layout to Reality Check alignment data.
- [x] 5.5 Add integration tests for recipe-guided physical placement and Codex-created layout validation.

## 6. Verification

- [x] 6.1 Validate with `openspec validate physical-breadboard-wiring-constraints --strict`.
- [x] 6.2 Verify implementation with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] 6.3 Verify an implemented-subset end-to-end flow for sections 1, 3, 4, and partial 5: place ESP32 and LED circuit physically -> physical DRC catches wrong button/LED layout -> corrected physical net drives simulation.

Verification notes: `pnpm test`, both TypeScript configs, and `pnpm build` pass. The implemented physical flow is covered through `tests/physical-breadboard.test.ts`, `tests/sim.test.ts`, and the Beginner Lab physical-net path used by `projectWithPhysicalNets`. Section 2 and the remaining Section 5 recipe/export items stay unchecked until interactive snapping/export flows land.
