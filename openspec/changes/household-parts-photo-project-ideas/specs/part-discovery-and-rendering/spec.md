## ADDED Requirements

### Requirement: Photo and web-derived parts keep review metadata
The system SHALL preserve review metadata for any part derived from photo analysis, curated database lookup, or Exa web retrieval.

#### Scenario: Draft part is created from retrieval
- **WHEN** the learner approves creating a part from photo/web retrieval
- **THEN** the draft catalog entry SHALL include source URLs, retrieved date, confidence, render strategy, review notes, and a flag that pinout/voltage must be reviewed before hardware use.

### Requirement: Unknown renderable parts use visible fallbacks
The system SHALL render recommended or draft parts even when no GLB model exists, using the best available safe fallback.

#### Scenario: Family renderer exists
- **WHEN** a retrieved part has a known family such as LED, resistor, button, display, sensor, motor, relay, or microphone
- **THEN** the system SHALL use the matching primitive renderer and show review warnings when metadata confidence is low.

#### Scenario: No renderer exists
- **WHEN** no GLB or family renderer exists for a retrieved part
- **THEN** the system SHALL render a generic labeled block with pin badges and review warnings.

### Requirement: Draft parts cannot silently become trusted
The system SHALL prevent AI/web/photo-derived parts from becoming trusted catalog entries without explicit learner review.

#### Scenario: Learner promotes a draft part
- **WHEN** the learner promotes a draft part in Catalog Editor
- **THEN** the system SHALL preserve the original draft/source notes and record that the part was reviewed.
