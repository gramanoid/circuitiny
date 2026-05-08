## ADDED Requirements

### Requirement: Source inventory and license classification
The system SHALL maintain a source inventory for free/open electronics CAD model sources and classify each source or asset before it can be installed or bundled.

#### Scenario: Source is indexed
- **WHEN** the system indexes a model source
- **THEN** it SHALL record the source name, source URL, license name, license URL when known, allowed use classification, attribution text, supported formats, retrieval date, and source notes.

#### Scenario: Source is not safely redistributable
- **WHEN** a source is free to download but redistribution is unclear or restricted
- **THEN** the system SHALL classify it as local-import-only and SHALL NOT bundle its assets with Circuitiny.

#### Scenario: Source requires payment
- **WHEN** a source or asset requires payment, a premium subscription, or paid model creation
- **THEN** the system SHALL classify it as blocked and exclude it from recommendations by default.

### Requirement: Free/open model discovery
The system SHALL let learners and Codex search approved free/open model sources for electronics parts using beginner-friendly terms and exact part numbers.

#### Scenario: Beginner searches for a common part
- **WHEN** the learner searches for a common part such as "5mm LED", "tactile button", or "OLED screen"
- **THEN** the system SHALL return matching local catalog parts first, then bundled-ok source candidates, then local-import-only candidates with clear source and license labels.

#### Scenario: Exact part number is searched
- **WHEN** the learner searches for an exact manufacturer part number
- **THEN** the system SHALL preserve the exact part number in the query and show whether the candidate model is generic, package-only, module-specific, or exact-part-specific.

### Requirement: Model conversion and normalization
The system SHALL convert supported non-GLB model formats into normalized `.glb` assets before creating Circuitiny catalog bundles.

#### Scenario: Native glTF asset is selected
- **WHEN** the selected asset is already GLB or glTF with its referenced buffers and textures
- **THEN** the system SHALL import it through the native model path and produce a Circuitiny-ready `.glb` or self-contained equivalent without unnecessary geometry changes.

#### Scenario: STEP or WRL asset is selected
- **WHEN** the selected asset is STEP, STP, or WRL
- **THEN** the system SHALL run the configured converter, generate a `.glb`, normalize units to meters, center or align the origin for Circuitiny placement, create dimensions metadata, and retain the conversion log.

#### Scenario: Conversion fails
- **WHEN** conversion fails or the required converter is unavailable
- **THEN** the system SHALL keep the candidate uninstalled and show a beginner-readable error with the original format, attempted converter, and next action.

### Requirement: Catalog bundle creation through review workflow
The system SHALL turn accepted models into the same catalog bundle shape used by the existing Catalog Editor.

#### Scenario: Imported model has enough metadata
- **WHEN** a selected model has source metadata, a generated `.glb`, and enough candidate component metadata
- **THEN** the system SHALL create a draft catalog bundle containing `.glb`, `component.json`, source metadata, render strategy, scale, dimensions, pins when available, and review warnings.

#### Scenario: Pins are not trustworthy
- **WHEN** the imported model does not include trustworthy pin positions and pin types
- **THEN** the system SHALL keep the part in draft state and require Catalog Editor pin review before promotion.

### Requirement: Beginner starter model pack
The system SHALL offer a small beginner-focused starter pack before exposing broad library imports.

#### Scenario: Starter pack is installed
- **WHEN** the learner installs the starter model pack
- **THEN** the system SHALL install reviewed or review-ready models for common beginner families including LEDs, resistors, capacitors, buttons, potentiometers, buzzers, displays, simple sensors, connectors, power parts, and wiring aids where license-safe assets exist.

#### Scenario: Starter pack part is approximate
- **WHEN** a starter pack model is generic or package-only rather than an exact module
- **THEN** the system SHALL label it as approximate and explain what the learner should compare against their real part.

### Requirement: Source cache and update safety
The system SHALL cache source indexes and imported assets without making startup depend on live network access.

#### Scenario: App starts offline
- **WHEN** Circuitiny starts without network access
- **THEN** previously installed catalog bundles and cached source indexes SHALL remain usable.

#### Scenario: Source index updates
- **WHEN** a source index is refreshed
- **THEN** the system SHALL preserve installed parts, avoid duplicate catalog IDs, and show changed or missing upstream assets without deleting local bundles.
