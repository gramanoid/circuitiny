# codex-visual-build-agent Specification Delta

## ADDED Requirements

### Requirement: Structured visual scene context

The system SHALL provide Codex with a scoped context snapshot of the current Circuitiny project, rendered scene, schematic, validation state, catalog state, and approved screenshot/canvas image.

#### Scenario: Codex inspects the current build

- **WHEN** the learner asks Codex what is currently on the canvas
- **THEN** Codex SHALL receive structured component, net, render, selection, DRC, recipe, and catalog context for the active Circuitiny project.

#### Scenario: Scene context is delivered with each agent request

- **WHEN** Circuitiny sends a Codex request from the build-agent UI
- **THEN** the request SHALL include a scene context identifier, structured state payload, validation summary, and screenshot reference status so Codex can cite what it used.

#### Scenario: Screenshot is unavailable

- **WHEN** screenshot or canvas image access is disabled or not approved
- **THEN** Codex SHALL rely on structured state and explain any visual limitation before making visual claims.

#### Scenario: Image and structured state disagree

- **WHEN** image interpretation conflicts with structured project state
- **THEN** Codex SHALL treat structured IDs, pins, nets, and validation as authoritative and use the image only for visible layout.

### Requirement: Scoped Circuitiny action tools

The system SHALL let Codex operate Circuitiny through typed, audited, app-local tools rather than unrestricted operating-system control.

#### Scenario: Codex edits a circuit

- **WHEN** Codex adds a part, places a part, moves a part, deletes an item, or connects pins/holes
- **THEN** the tool result SHALL identify changed project objects and any immediate warnings.

#### Scenario: Codex requests unsupported control

- **WHEN** Codex needs an action outside the scoped Circuitiny tool contract
- **THEN** it SHALL explain the limitation and request learner action or approval instead of using unrestricted control.

#### Scenario: Tool operation fails

- **WHEN** a scoped Circuitiny tool cannot complete because validation, permissions, missing data, or runtime state blocks it
- **THEN** the tool result SHALL return a structured failure code, beginner-readable explanation, affected object references when known, and a recommended next action.

### Requirement: Approval-gated risky actions

The system SHALL require explicit learner approval before Codex performs risky or externally visible actions.

#### Scenario: External or persistent action requested

- **WHEN** Codex wants to download a model, import a draft catalog part, write a saved file, analyze a photo, build firmware, flash hardware, or open a serial monitor
- **THEN** the system SHALL show the requested action, risk category, and target before allowing Codex to continue.
- **AND** model downloads, catalog writes, saved-file writes, photo analysis, firmware builds, hardware flash, and serial monitor access SHALL be represented as distinct approval categories; temporary cache reads and local validation-only checks SHALL NOT require the same approval unless they become persistent or externally visible.

#### Scenario: Approval is denied

- **WHEN** the learner denies a risky action approval
- **THEN** Codex SHALL stop that action and offer a safe alternative.

### Requirement: Agent action history and rollback

The system SHALL group Codex tool calls into visible action sessions with changed objects, validation results, explanations, and rollback when possible.

#### Scenario: Codex completes an edit group

- **WHEN** Codex finishes a set of circuit edits
- **THEN** the UI SHALL show the plan, actions performed, changed objects, validation status, and beginner summary.

#### Scenario: Learner rolls back agent changes

- **WHEN** the learner chooses rollback for the latest agent change group
- **THEN** the system SHALL revert the group atomically where project state allows and report any changes that could not be reverted without leaving partial hidden state.

#### Scenario: Rollback cannot be completed atomically

- **WHEN** some objects in the latest agent change group have been edited by the learner or external state has changed since the group was recorded
- **THEN** the system SHALL refuse automatic rollback for that group, show the conflicting objects, and offer a manual review path.

### Requirement: Validation before ready claims

The system SHALL require Codex to run or inspect the relevant Circuitiny validation before claiming a circuit, code change, or hardware action is ready.

#### Scenario: Codex changes wiring

- **WHEN** Codex creates, removes, or changes a net
- **THEN** Codex SHALL run DRC and report remaining errors and warnings.

#### Scenario: Codex changes physical placement

- **WHEN** Codex places parts or jumpers on a breadboard
- **THEN** Codex SHALL run physical DRC and report remaining physical findings.

#### Scenario: Codex prepares firmware

- **WHEN** Codex changes behavior or generated/custom firmware
- **THEN** Codex SHALL run the applicable available validation path: simulation when behavior is simulated, code generation inspection when generated files changed, and ESP-IDF build validation when the local build toolchain is available.
- **AND** if a validation path is unavailable, Codex SHALL state that limitation and SHALL NOT describe hardware as ready to flash without a successful build or explicit learner override.

### Requirement: Beginner-facing autonomy and reasoning controls

The system SHALL expose Codex autonomy and provider reasoning effort controls in the GUI and apply them to subsequent Codex requests.

#### Scenario: Learner changes reasoning effort

- **WHEN** the learner selects low, medium, high, or xhigh provider reasoning effort
- **THEN** subsequent Codex requests SHALL use that effort when the provider supports it and SHALL keep the selected value visible.
- **AND** when the provider does not support the selected effort, the system SHALL fall back to the nearest supported effort, disclose that fallback in settings or request status, and preserve the learner's chosen value for providers that do support it.
- **AND** `none` SHALL be accepted only by backend/provider contracts or advanced configuration for compatibility, not as a primary beginner-facing option.

#### Scenario: Learner changes autonomy tier

- **WHEN** the learner selects explain-only, draft-edit, guided-edit, or hardware-gated autonomy
- **THEN** Codex SHALL restrict available tools and approvals according to that tier.
