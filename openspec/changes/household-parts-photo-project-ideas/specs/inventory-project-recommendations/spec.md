## ADDED Requirements

### Requirement: Recommendations use confirmed inventory

The system SHALL recommend beginner projects from confirmed inventory items and SHALL keep unconfirmed photo candidates out of buildable recommendations.

#### Scenario: Inventory can build a project now

- **WHEN** the confirmed inventory contains all required parts for a beginner project
- **THEN** the system SHALL show a "build now" recommendation with used parts, learning concepts, estimated difficulty, and first step.

#### Scenario: Inventory is missing parts

- **WHEN** a project is close but requires additional cheap/common parts
- **THEN** the system SHALL show the missing parts list, why each part is needed, and whether substitutes exist.

#### Scenario: Compatible substitutes are available

- **WHEN** a missing part has compatible substitutes in confirmed inventory
- **THEN** the system SHALL list suggested substitutes with compatibility and safety notes, require learner approval before substituting them into the project, and mark the recommendation as "can build with substitutes" with a clear warning.

### Requirement: Project cards are educational

The system SHALL explain why each recommended project is useful for a beginner.

#### Scenario: Project is recommended

- **WHEN** a project card is shown
- **THEN** it SHALL include concepts learned, parts used, safety notes, expected simulation behavior, and a short reason the project fits the current inventory.

## MODIFIED Requirements

### Requirement: Recommendations can become guided recipes

The system SHALL allow a confirmed recommendation to become a guided Circuitiny recipe or project draft after learner approval while preventing unreviewed AI/photo/web-derived data from entering trusted workflows.

#### Scenario: Learner accepts a recommendation

- **WHEN** the learner chooses "create project" or "make this a recipe"
- **THEN** the system SHALL create a draft project using confirmed local/draft parts and SHALL require review before generating hardware flashing instructions.
- Blocked actions: DRC, codegen, build, and flash SHALL be blocked until Catalog Editor review completes for projects containing `ai-draft` catalog parts or unreviewed identity fields.
- Catalog trust SHALL transition from `ai-draft` to `reviewed` only after an explicit review-confirmed catalog part and identity-field match.
- Trusted workflows SHALL consume only identity/catalog fields marked `reviewed`.

### Requirement: Recommendation ranking favors beginner success

The system SHALL rank projects by safety, number of confirmed parts, low missing-part count, simple wiring, simulation support, and clear learning value.

#### Scenario: Unsafe project competes with safe project

- **WHEN** two projects are possible but one uses high-current, mains, lithium battery, motor, or relay hardware
- **THEN** the system SHALL rank the safer project higher unless the learner explicitly asks for advanced hardware.

### Requirement: Learner can ask plain-English follow-ups

The system SHALL let Codex answer follow-up questions about why a project was recommended and what alternatives are possible.

#### Scenario: Learner asks for something cooler

- **WHEN** the learner asks for a more interesting project using the same confirmed parts
- **THEN** the system SHALL re-rank recommendations with a stronger novelty preference while honoring the Recommendation ranking safety constraints, without elevating unsafe project types, and while continuing to show standard safety warnings and beginner explanations.
