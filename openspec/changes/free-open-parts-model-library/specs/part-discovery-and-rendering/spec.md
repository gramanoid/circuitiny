## ADDED Requirements

### Requirement: Source-backed realistic model rendering
The system SHALL render imported free/open model assets as realistic GLB parts while preserving source, license, and confidence metadata.

#### Scenario: Imported GLB is available
- **WHEN** a catalog part has an approved imported GLB from a free/open source
- **THEN** the 3D viewer and palette thumbnail SHALL render that GLB and expose source/license metadata in the catalog UI.

#### Scenario: Visual model is more trustworthy than pin metadata
- **WHEN** an imported model has realistic geometry but unreviewed or inferred pins
- **THEN** the system SHALL render the model but keep the catalog entry in draft or low-confidence state until pins are reviewed.

#### Scenario: Imported model is approximate
- **WHEN** an imported model represents only the physical package or a generic equivalent of the learner's part
- **THEN** the system SHALL label the rendering as approximate and keep beginner-facing notes about what may differ in real hardware.

### Requirement: Imported model fallback behavior
The system SHALL fall back gracefully when an imported model cannot be loaded or rendered.

#### Scenario: Imported GLB fails to load
- **WHEN** an imported catalog GLB is missing, corrupt, or incompatible with the renderer
- **THEN** the system SHALL show the best matching primitive fallback, preserve the source metadata, and report a review warning.

#### Scenario: Imported model is too heavy
- **WHEN** an imported model exceeds the configured size or geometry complexity budget
- **THEN** the system SHALL request optimization before promotion or mark the part as draft-only until a lighter GLB is available.
