# physical-reality-check Specification Delta

## ADDED Requirements

### Requirement: Reality Check configuration is explicit

The system SHALL expose shared configuration for recipe and Codex gating, including numeric thresholds (`AlignmentConfidenceMin = 0.95`, `WireMappingConfidenceMin = 0.85`) and policy identifiers (`UncertaintyClassificationRules`, `TransientImageRetentionPolicy`, `ManualConfirmationWorkflow`).

These configuration values SHALL be accessible through deployment config, recipe-level overrides, or an admin/debug configuration surface: raise `AlignmentConfidenceMin` and `WireMappingConfidenceMin` for poor lighting, dense wiring, or high-risk hardware; lower them only for well-lit starter kits that still enforce `UncertaintyClassificationRules`, `TransientImageRetentionPolicy`, and `ManualConfirmationWorkflow` before hardware readiness.

#### Scenario: Thresholds drive milestone gates

- **WHEN** verified-learning-recipes evaluates Reality Check evidence
- **THEN** it SHALL use `AlignmentConfidenceMin`, `WireMappingConfidenceMin`, `UncertaintyClassificationRules`, and `ManualConfirmationWorkflow` rather than hidden heuristics.

### Requirement: Explicit physical check capture

The system SHALL provide a Reality Check flow that uses camera capture or photo upload only after explicit learner action and consent.

#### Scenario: Learner starts camera check

- **WHEN** the learner chooses to use the camera for Reality Check
- **THEN** the system SHALL ask for camera permission and show a photo review step before analysis begins.

#### Scenario: Learner uploads a photo

- **WHEN** the learner chooses a photo instead of the camera
- **THEN** the system SHALL analyze only that selected image and SHALL NOT request camera permission.

#### Scenario: Image storage is not approved

- **WHEN** the learner runs Reality Check without approving image storage
- **THEN** the system SHALL keep the raw image transient and persist only derived findings.
- **AND** transient raw images SHALL exist only in memory for the active Reality Check session and SHALL be discarded on session end, page reload, or project close.
- **AND** derived findings MAY persist alignment confidence, observed pin mappings, wiring observations, safety classifications, and uncertain flags in local project state according to `TransientImageRetentionPolicy`.

### Requirement: Physical-to-project alignment

The system SHALL align visible boards, breadboards, and starter components to the current Circuitiny project before validating the build.

#### Scenario: Board alignment succeeds

- **WHEN** the captured image contains a known board or breadboard at sufficient quality
- **THEN** the system SHALL proceed automatically only when alignment confidence is at least `AlignmentConfidenceMin` and map visible pin regions to project pin candidates.
- **AND** confidence from 0.80 up to but below `AlignmentConfidenceMin` SHOULD recommend a retake and MAY allow `ManualConfirmationWorkflow`.
- **AND** confidence below 0.80 SHALL block automatic progression and require either a retake or a stronger `ManualConfirmationWorkflow` with logged acknowledgment.

#### Scenario: Board alignment fails

- **WHEN** the captured image is too blurry, angled, occluded, or missing the expected board
- **THEN** the system SHALL ask for a retake or manual confirmation instead of reporting wiring findings as confirmed.
- **AND** findings below the automatic alignment threshold SHALL be labeled `uncertain` until a successful retake or completed manual confirmation records timestamped pin selections.

### Requirement: Visible wiring comparison

The system SHALL compare observed physical wires and component placement against the current project components, pins, nets, and recipe step when available.

#### Scenario: Physical wire matches project net

- **WHEN** an observed wire endpoint pair maps to a project net with sufficient confidence
- **THEN** the system SHALL mark that physical connection as confirmed only when wire mapping confidence is at least `WireMappingConfidenceMin`.

#### Scenario: Physical wire differs from project net

- **WHEN** an observed wire endpoint maps to a different pin than the project expects
- **THEN** the system SHALL report the mismatch with the observed endpoint, expected endpoint, and correction guidance derived from mismatch templates and recipe step instructions.

#### Scenario: Observation is ambiguous

- **WHEN** the system cannot confidently map a wire, part, or pin
- **THEN** the system SHALL classify the result as uncertain and ask the learner to retake the photo or confirm the mapping manually.

### Requirement: Beginner-safe physical findings

The system SHALL present Reality Check findings as beginner-safe actions ordered by physical risk and learning dependency.

Findings SHALL include unique IDs plus severity/risk fields (`blocking`, `warning`, `uncertain`, or `resolved`) so safety-first fixes are ordered before conceptual or recipe-step guidance.

Severity states SHALL use these semantics:

- `blocking`: prevents hardware or recipe progression until corrected.
- `warning`: allows progression when the recipe policy permits it, but remains visible.
- `uncertain`: requires retake, manual confirmation, or learner acknowledgment before it can count as evidence.
- `resolved`: historical/runtime status for findings fixed by corrective action, manual confirmation, or successful retake.

Allowed transitions SHALL include `uncertain` -> `resolved` after manual confirmation or retake, and `blocking` -> `resolved` only after corrective action or an updated validation result.

#### Scenario: Visible safety issue is found

- **WHEN** Reality Check identifies a likely power/ground short, reversed polarized part, missing required resistor, or wrong voltage rail
- **THEN** the system SHALL mark the finding as blocking for hardware steps and explain the safest first correction.

#### Scenario: Non-blocking issue is found

- **WHEN** Reality Check identifies a layout mismatch that does not create an obvious safety problem
- **THEN** the system SHALL show the mismatch as a warning and explain whether the learner can continue.

### Requirement: Reality Check integration with validation

The system SHALL integrate Reality Check results with DRC, recipes, Codex context, and hardware readiness without replacing electrical validation.

- Passing SHALL mean no `blocking` findings.
- Warnings MAY allow progress to subsequent steps.
- Uncertain findings SHALL require either resolution or explicit learner acknowledgment through an `Acknowledge Uncertain Findings` action that is logged separately from resolved items.
- Recipe steps SHALL declare Reality Check as `required`, `optional`, or `not_applicable`.

#### Scenario: Recipe requires physical confirmation

- **WHEN** a recipe step requires a physical milestone before flashing hardware
- **THEN** the step SHALL remain incomplete until DRC passes and Reality Check either passes or the learner resolves/acknowledges remaining uncertainties.

#### Scenario: All findings are uncertain

- **WHEN** every Reality Check finding is `uncertain`
- **THEN** a `required` recipe step SHALL require retake, manual confirmation, or `Acknowledge Uncertain Findings` before progress.
- **AND** an `optional` recipe step MAY proceed after logged acknowledgment when DRC has no errors.
- **AND** a `not_applicable` recipe step SHALL keep the result informational only.

#### Scenario: Codex explains physical findings

- **WHEN** Codex receives Reality Check context
- **THEN** Codex SHALL receive a structured findings payload with separate fields for confirmed visual findings, uncertain observations, DRC results, and inferred advice.
