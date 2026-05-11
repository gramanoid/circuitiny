# Part Discovery And Rendering

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

## MODIFIED Requirements

### Requirement: Imported model optimization behavior

The system SHALL block promotion and request optimization when an imported model is too heavy for beginner-friendly rendering.

#### Definition: model_complexity_budget

`model_complexity_budget` is the strictest effective limit from the admin global default, optional project-owner project override, and optional reviewer tightening. File size in MB, vertex count, and triangle count are enforced independently; an optional combined complexity score may add another limit but cannot override a failed concrete threshold. The effective budget and each exceeded field are shown in Catalog Editor, import API responses, and the model review panel.

#### Scenario: Imported model is too heavy

- **WHEN** an imported model exceeds `model_complexity_budget`
- **THEN** the system SHALL block promotion, mark the part draft-only, and show a "Request optimization" action that initiates automated background optimization and exposes job status.
- **AND** import validation and promotion checks SHALL enforce the effective `model_complexity_budget`, falling back to the admin global default when no project or review override exists.
- **AND** the part SHALL remain draft-only until the optimizer produces a GLB that meets the effective `model_complexity_budget` file-size, vertex count, and triangle count thresholds or a reviewer replaces the model manually.
- **AND** when the optimization queue is full, the request optimization flow SHALL return a visible "try again after current jobs finish" message to the learner.

#### Scenario: Imported model cannot be optimized automatically

- **WHEN** the optimizer reaches a permanent conversion, geometry, or budget failure for an imported model
- **THEN** the system SHALL keep the part draft-only, preserve the original source model, surface the failed status, retry count, and log reference, and offer manual replacement instead of retrying indefinitely.
