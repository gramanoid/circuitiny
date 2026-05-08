# beginner-learning-flows Specification

## Purpose
Beginner learning flows turn Circuitiny projects into guided lessons for new electronics learners. They help beginners launch real circuits, understand one step at a time, validate safety, connect simulation/code/hardware concepts, and leave each recipe with clear next experiments instead of a blank editor.
## Requirements
### Requirement: Guided recipe launch
The system SHALL present beginner recipes that launch real Circuitiny projects with learning metadata, including goal, concepts, required parts, estimated time, wiring steps, simulation checkpoints, hardware notes, and follow-up experiments.

#### Scenario: Beginner opens a recipe
- **WHEN** the user selects a beginner recipe
- **THEN** the system loads the recipe project and displays the learning goal, required parts, and first checkpoint without requiring the user to understand the raw project schema.

#### Scenario: Recipe uses existing project behavior
- **WHEN** a recipe is launched
- **THEN** the loaded circuit, behaviors, generated code, simulation, and DRC status MUST read from and write to the shared in-memory Circuitiny editor project state so recipe guidance and the normal editor stay strongly consistent in the same runtime.

### Requirement: Step-by-step wiring guidance
The system SHALL guide beginner wiring one connection at a time using clear pin labels, highlighted source and target pins, and plain-language explanations of why the connection is needed.

#### Scenario: Next wire is shown
- **WHEN** a recipe has an incomplete wiring step
- **THEN** both the 3D view and the schematic SHALL highlight the next two endpoints and explain the purpose of that wire.

#### Scenario: User makes a wrong connection: recipe mismatch
- **WHEN** the user creates a net that is electrically valid but does not match the active recipe step
- **THEN** the system SHALL explain the recipe mismatch in beginner language, identify the expected endpoints, and offer a guided correction path tied to the active step.

#### Scenario: User makes a wrong connection: DRC violation
- **WHEN** the user creates a net that triggers a DRC error or warning
- **THEN** the system SHALL show a safety-oriented message, identify the physical risk, and provide a safe recovery path before continuing.

### Requirement: Beginner safety explanations
The system SHALL translate DRC errors and warnings into beginner-facing explanations that include what happened, why it matters physically, and the safest next action.

#### Scenario: Dangerous wire detected
- **WHEN** DRC reports a voltage mismatch, power-to-ground short, flash-pin use, or input-only output error
- **THEN** the system SHALL enforce these actions and show a beginner explanation with a concrete fix:
  - Voltage mismatch always blocks build and simulation.
  - Power-to-ground short always blocks build and simulation.
  - Flash-pin use blocks build but allows simulation with a safety warning.
  - Input-only output error blocks build and allows simulation only when the simulated component is marked read-only.

#### Scenario: Warning detected
- **WHEN** DRC reports a warning such as strapping-pin use, current budget concern, or missing LED resistor
- **THEN** the system SHALL explain the risk and show whether the learner can continue safely or should fix it first.

### Requirement: Simulation checkpoint learning
The system SHALL connect simulation controls to recipe checkpoints so a beginner can verify that the circuit behaves as expected before flashing hardware.

#### Scenario: Checkpoint passes
- **WHEN** the user runs simulation and the observed GPIO/component state matches the recipe checkpoint
- **THEN** the system SHALL mark the checkpoint complete and explain what the learner just proved.

#### Scenario: Checkpoint fails
- **WHEN** simulation runs but expected behavior is not observed
- **THEN** the system SHALL point the learner to likely causes such as missing behavior, wrong pin, missing ground, or DRC issue, prioritizing diagnostics by DRC state first, then missing or incomplete connections, then behavior configuration or pin misassignment.

### Requirement: Code and hardware bridge
The system SHALL explain the generated firmware and build/flash workflow in beginner terms without hiding the raw generated files or ESP-IDF logs.

#### Scenario: Generated code viewed during lesson
- **WHEN** the user opens the Code pane during a recipe
- **THEN** the system SHALL identify the lines or generated sections that correspond to the active behavior in plain language, or explain the overall code structure when no behavior is active.

#### Scenario: Build or flash fails
- **WHEN** ESP-IDF build, flash, or monitor returns an error
- **THEN** the system SHALL preserve the raw log and show a beginner recovery explanation for common causes including but not limited to: missing ESP-IDF, no serial port, wrong target, or device not in bootloader mode.
