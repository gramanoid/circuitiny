# physical-breadboard-layout Specification Delta

## ADDED Requirements

### Requirement: Breadboard topology model

The system SHALL represent solderless breadboards as physical connection surfaces with holes, rails, tie groups, gaps, labels, and coordinates.

#### Scenario: Common breadboard is loaded

- **WHEN** a common full, half, or mini breadboard template is added
- **THEN** the system SHALL create labeled holes, rail segments, and hidden tie groups that match the template.

#### Scenario: Rail is split

- **WHEN** a breadboard template has split power rails
- **THEN** the system SHALL model each rail segment separately until a jumper or component connects them.

### Requirement: Physical placement snapping

The system SHALL place component legs and jumper endpoints into valid breadboard holes or board/module pins.

#### Scenario: Component is placed on breadboard

- **WHEN** the learner drags a breadboard-compatible component near valid holes
- **THEN** the system SHALL snap each leg to valid holes and preserve the pin-to-leg mapping.

#### Scenario: Hole is already occupied

- **WHEN** a placement would put incompatible leads into the same hole
- **THEN** the interactive UI SHALL prevent the placement; imported or automated layouts that already contain the overlap SHALL report a physical DRC error.

#### Scenario: Lead is not seated

- **WHEN** a component leg or jumper endpoint does not map to a valid hole or pin
- **THEN** the system SHALL mark the lead as unplaced and exclude it from physical net derivation.

### Requirement: Physical net derivation

The system SHALL derive physical nets from breadboard tie groups, component legs, jumpers, and board/module pins.

#### Scenario: Jumper connects two tie groups

- **WHEN** a jumper endpoint is placed in two valid holes
- **THEN** the system SHALL merge those tie groups into one physical net.

#### Scenario: Component bridges rows

- **WHEN** a component has legs placed in different tie groups
- **THEN** the system SHALL connect the component's electrical pins according to its part definition.

#### Scenario: Physical and schematic nets differ

- **WHEN** the derived physical net graph does not match the intended schematic net
- **THEN** the system SHALL report a net mismatch with the physical path that caused it.

### Requirement: Physical DRC

The system SHALL validate beginner-relevant breadboard placement mistakes in addition to electrical DRC.

#### Scenario: Button is rotated ineffectively

- **WHEN** a push button's active leg pairs are placed on the same tie groups
- **THEN** the system SHALL warn that pressing the button will not change the circuit as expected.

#### Scenario: Resistor is bypassed

- **WHEN** an LED current path physically bypasses the intended resistor
- **THEN** the system SHALL block hardware readiness and explain how to place the resistor in series.

#### Scenario: Power rail gap is not bridged

- **WHEN** a circuit depends on continuity across a split rail without a physical bridge
- **THEN** the system SHALL warn that the rail segment is not actually connected.

### Requirement: Physical build guidance

The system SHALL expose physical placement and wiring instructions that match real breadboard labels and jumper colors.

#### Scenario: Recipe highlights next placement

- **WHEN** a recipe step targets a physical layout action
- **THEN** the 3D view SHALL highlight the exact holes, part orientation, or jumper endpoints for that action.

#### Scenario: Build plan is exported

- **WHEN** the learner exports a physical build plan
- **THEN** the plan SHALL include board orientation, row/rail labels, part orientation, and jumper colors needed to reproduce the circuit.
