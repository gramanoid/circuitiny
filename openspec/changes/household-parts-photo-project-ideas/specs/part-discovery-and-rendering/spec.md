# part-discovery-and-rendering Specification Delta

## ADDED Requirements

### Requirement: Photo and web-derived parts keep review metadata

The system SHALL preserve review metadata for any part derived from photo analysis, curated database lookup, or Exa web retrieval.

#### Scenario: Draft metadata is preserved

- **WHEN** the learner approves creating a part from photo/web retrieval
- **THEN** the draft catalog entry SHALL include source URLs, retrieved date, confidence, render strategy, review notes, and a flag that pinout/voltage must be reviewed before hardware use.

#### Scenario: Draft trust state and review notes

- **WHEN** the learner approves creating a part from photo/web retrieval
- **THEN** the catalog entry `catalogMeta.trust` SHALL be `ai-draft`.
- **AND** `catalogMeta.reviewNotes` SHALL record that pinout and voltage require review before hardware use.

#### Scenario: Draft parts are displayed with warnings

- **WHEN** a learner views a photo/web-derived draft part
- **THEN** Catalog Editor and part detail views SHALL surface source URLs, retrieved date, confidence, render strategy, review notes, and trust state.

#### Scenario: Draft parts block trusted workflows

- **WHEN** a project contains a catalog entry where `catalogMeta.trust` is `ai-draft`
- **THEN** trusted workflows including code generation, trusted DRC/build guidance, and hardware flashing SHALL reject the part until Catalog Editor marks it reviewed.

### Requirement: Unknown renderable parts use visible fallbacks

The system SHALL render recommended or draft parts even when no GLB model exists, using the best available safe fallback.

#### Scenario: Family renderer exists

- **WHEN** a retrieved part has a known family such as LED, resistor, button, display, sensor, motor, relay, or microphone
- **THEN** the system SHALL use the matching primitive renderer and apply the shared Review warning display rule.

#### Scenario: No renderer exists

- **WHEN** no GLB or family renderer exists for a retrieved part
- **THEN** the system SHALL render a generic labeled block with pin badges and apply the shared Review warning display rule.

### Requirement: Review warning display rules

The system SHALL display review warnings for draft or low-confidence rendered parts using existing catalog metadata.

#### Scenario: Catalog metadata requires learner review

- **WHEN** `catalogMeta.trust` is `ai-draft`, `catalogMeta.confidence` is `low`, or `catalogMeta.reviewNotes` contains required pinout or voltage review
- **THEN** the learner UI SHALL show inline badges on the part surface with tooltip details using `catalogMeta.renderStrategy`, `catalogMeta.sourceUrls`, and `catalogMeta.reviewNotes`, plus a dedicated review panel entry.

### Requirement: Draft parts cannot silently become trusted

The system SHALL prevent AI/web/photo-derived parts from becoming trusted catalog entries without explicit learner review.

#### Scenario: Code generation blocked for draft parts

- **WHEN** a project contains catalog entries with trust state `ai-draft`
- **THEN** code generation SHALL be blocked with an error listing the draft parts and offering to open each one in Catalog Editor.

#### Scenario: Hardware flashing blocked for draft parts

- **WHEN** a project contains catalog entries with trust state `ai-draft`
- **THEN** hardware flashing SHALL be blocked with an error listing the draft parts and offering to open each one in Catalog Editor.

#### Scenario: Learner promotes a draft part

- **WHEN** the learner promotes a draft part in Catalog Editor
- **THEN** the system SHALL preserve source URLs, original confidence, retrieved date, render strategy, and source notes.
- **AND** the promoted catalog entry SHALL set `catalogMeta.trust` to `reviewed`, raise confidence to `high` when the reviewer approves the fields, append `Reviewed in Circuitiny Catalog Editor.` to review notes, and store reviewer id plus an ISO-8601 UTC review timestamp when the active environment provides identity.
