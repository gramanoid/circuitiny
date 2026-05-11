# verified-learning-recipes Specification Delta

## ADDED Requirements

### Requirement: Milestone-based recipe state

The system SHALL represent beginner recipes as explicit milestones with actions, evidence requirements, expected observations, hints, and persisted progress.

#### Scenario: Recipe starts

- **WHEN** the learner launches a verified recipe
- **THEN** the system SHALL load the project, show the first milestone, and identify the evidence required to complete it.

#### Scenario: Learner resumes recipe

- **WHEN** the learner reopens a recipe with saved progress
- **THEN** the system SHALL restore completed milestones and show what should be rechecked before continuing.

### Requirement: Evidence-gated completion

The system SHALL complete recipe milestones only when the declared evidence requirements are satisfied.

#### Scenario: Required evidence passes

- **WHEN** all required evidence for a milestone is present and no blocking evidence remains
- **THEN** the system SHALL mark the milestone complete and unlock the next valid milestone.

#### Scenario: Required evidence is missing

- **WHEN** the learner tries to continue without required evidence
- **THEN** the system SHALL keep the milestone incomplete and explain the missing proof.

#### Scenario: Blocking evidence exists

- **WHEN** DRC, physical DRC, Reality Check, build logs, or monitor output reports a blocking issue
- **THEN** the system SHALL prevent recipe progress past the affected milestone until the issue is fixed or explicitly allowed by recipe policy.

### Requirement: Multi-source validation evidence

The system SHALL allow milestones to read evidence from project state, DRC, physical DRC, simulation, generated code, ESP-IDF build/flash logs, serial monitor output, Reality Check, and manual confirmation.

#### Scenario: Wiring milestone validates

- **WHEN** a wiring milestone expects specific endpoints or breadboard holes
- **THEN** the system SHALL check project/physical layout state and relevant DRC before completing the milestone.

#### Scenario: Simulation milestone validates

- **WHEN** a simulation milestone expects an observable virtual behavior
- **THEN** the system SHALL complete only after the simulation result matches the expected observation.

#### Scenario: Hardware milestone validates

- **WHEN** a hardware milestone expects real device behavior
- **THEN** the system SHALL use build, flash, monitor, Reality Check, or manual observation evidence according to the recipe's declared policy.

### Requirement: Adaptive beginner hints

The system SHALL provide progressive hints based on the learner's current validation state and previous attempts.

#### Scenario: DRC explains failure

- **WHEN** a recipe milestone is blocked by a DRC or physical DRC finding
- **THEN** the first hint SHALL explain that finding in beginner language and point to the affected part or connection.

#### Scenario: Validation fails without DRC issue

- **WHEN** DRC passes but simulation, build, monitor, or Reality Check evidence fails
- **THEN** the system SHALL suggest the next most likely cause based on behavior configuration, code/build logs, physical observation, or expected input state.

#### Scenario: Learner asks for stronger help

- **WHEN** the learner asks for more help after a hint
- **THEN** the system SHALL progress from concept hint to focused area to exact correction while preserving the learning goal.

### Requirement: Codex tutoring constraints

The system SHALL allow Codex to tutor, explain, and fix within recipe constraints without bypassing milestone evidence or safety blockers.

#### Scenario: Codex helps with active milestone

- **WHEN** the learner asks Codex for help during a verified recipe
- **THEN** Codex SHALL receive the active milestone, evidence state, DRC state, and allowed actions.

#### Scenario: Codex attempts to complete a milestone

- **WHEN** Codex performs or suggests a fix for a milestone
- **THEN** the system SHALL still require the milestone's declared evidence before marking it complete.

### Requirement: Post-completion guidance

The system SHALL recommend follow-up learning after a recipe completes.

#### Scenario: Follow-up lesson is recommended

- **WHEN** the learner completes a recipe
- **THEN** the system SHALL recommend next experiments based on completed concepts, available parts, and recurring mistakes.
