## ADDED Requirements

### Requirement: Visible context for Codex
The system SHALL provide Codex with enough current app context to reason about what the learner sees, including project summary, DRC status, catalog entries, generated files, visible UI elements, and a current screenshot when available.

#### Scenario: Codex answers a visual question
- **WHEN** the user asks Codex about what is currently rendered or selected
- **THEN** Codex SHALL use the screenshot and structured app/project context to answer with references to the current Circuitiny state.

#### Scenario: Structured context disagrees with screenshot
- **WHEN** structured project data and screenshot interpretation conflict
- **THEN** Codex SHALL prefer structured project data for exact IDs/nets and use the screenshot only for visible layout and UI state.

### Requirement: Scoped app control
The system SHALL let Codex operate Circuitiny through scoped app actions rather than unrestricted operating-system control.

#### Scenario: Codex clicks a visible control
- **WHEN** Codex needs to operate a visible button, select, input, canvas, or schematic element
- **THEN** it SHALL use scoped app snapshot and app action tools targeted only at the Circuitiny window.

#### Scenario: Codex needs unsupported operating-system access
- **WHEN** a requested action requires leaving the Circuitiny app or controlling the operating system globally
- **THEN** Codex SHALL explain the limitation and ask the user to perform or approve that external action.

### Requirement: Beginner-preserving automation
The system SHALL make Codex automation educational by explaining plans, changes, validations, and next steps in beginner language.

#### Scenario: Codex changes the circuit
- **WHEN** Codex adds components, wires pins, changes behaviors, or writes firmware
- **THEN** Codex SHALL summarize what changed, why it was needed, and how the learner can verify it.

#### Scenario: Risky action requested
- **WHEN** Codex is about to import an external/generated part, flash hardware, overwrite saved files, or make broad project changes
- **THEN** Codex SHALL ask for confirmation before performing the action.

### Requirement: Validation loop after AI edits
The system SHALL require Codex-guided circuit edits to run validation appropriate to the edit before claiming the project is ready.

#### Scenario: Wiring changed
- **WHEN** Codex creates or removes a net
- **THEN** Codex SHALL run DRC and report remaining errors and warnings.

#### Scenario: Firmware changed
- **WHEN** Codex writes custom firmware or changes behavior logic
- **THEN** Codex SHALL explain how to run simulation or ESP-IDF build validation and SHOULD run available validation tools when the app exposes them.

### Requirement: Reasoning effort visibility
The system SHALL expose GPT reasoning effort controls for the Codex CLI provider and persist the selected setting.

#### Scenario: User changes effort
- **WHEN** the user selects minimal, low, medium, high, or xhigh reasoning effort for Codex CLI
- **THEN** subsequent Codex requests SHALL use that effort value and the selection SHALL remain visible in the GUI.
