# part-identity-and-datasheets Specification Delta

## ADDED Requirements

### Requirement: Source-backed part identity

The system SHALL identify parts using local catalog data, learner text, exact part numbers, visible markings, imported model metadata, and reviewed external sources.

#### Scenario: Exact catalog identity exists

- **WHEN** the learner asks for a part that matches a reviewed local catalog entry or exact alias
- **THEN** the system SHALL return that catalog part as the primary identity with reviewed metadata.

#### Scenario: Only part family is known

- **WHEN** the learner provides enough evidence for a family but not an exact model or module pinout
- **THEN** the system SHALL classify the identity as generic-family and explain what confirmation is needed before trusted use.

#### Scenario: Part remains unknown

- **WHEN** the learner's evidence is insufficient to identify the part family
- **THEN** the system SHALL keep the identity unknown and offer concrete next observations to provide, such as markings, pin labels, or a clearer photo.

### Requirement: Datasheet retrieval and evidence retention

The system SHALL retain datasheet/source evidence for identity and electrical metadata used in trusted catalog behavior.

#### Scenario: Datasheet is retrieved

- **WHEN** the system retrieves a datasheet or source document
- **THEN** it SHALL store source URL, title, vendor when known, retrieval date, terms/license note, and checksum when available.

#### Scenario: Source is blocked

- **WHEN** a source is paid, paywalled, authenticated, forbidden by terms, or license-unclear for the intended use
- **THEN** the system SHALL NOT use it as trusted evidence and SHALL explain the limitation to the learner.

### Requirement: Structured datasheet extraction

The system SHALL extract beginner-useful structured metadata from reviewed source documents and keep each field confidence-aware.

#### Scenario: Pinout is extracted

- **WHEN** a source contains pin names, roles, and order
- **THEN** the system SHALL extract pin metadata with aliases and mark whether it is reviewed, draft, or conflicting.

#### Scenario: Electrical limits are extracted

- **WHEN** a source contains voltage, current, logic level, or power limits
- **THEN** the system SHALL extract those limits for review before DRC or code generation trusts them.

#### Scenario: Companion part is required

- **WHEN** source metadata indicates a required resistor, pull-up, transistor driver, diode, or external power supply
- **THEN** the system SHALL add companion guidance to recommendations and beginner explanations.

### Requirement: Conflict handling

The system SHALL detect and surface conflicts between identities, datasheets, modules, pin orders, and extracted electrical fields.

#### Scenario: Pinout conflict found

- **WHEN** two credible sources disagree on a pinout or module pin order
- **THEN** the system SHALL mark the affected field as conflicting and block trusted promotion until the learner or reviewer resolves it.

#### Scenario: Clone/module variant differs

- **WHEN** a generic module family has known variants that change pins, voltage, or behavior
- **THEN** the system SHALL explain the variant risk and request visible markings, pin labels, or user confirmation.

### Requirement: Trusted use gating

The system SHALL use only reviewed identity fields for DRC, generated code, simulation defaults, and build-critical guidance.

#### Scenario: Reviewed identity metadata exists

- **WHEN** a part has reviewed pin-role and electrical metadata
- **THEN** DRC, simulation, code generation, and recipe guidance MAY use those reviewed fields.

#### Scenario: Identity metadata is draft

- **WHEN** a part has draft or unreviewed identity metadata
- **THEN** the system SHALL keep the part usable as a draft but SHALL warn before relying on it for build-critical guidance.
