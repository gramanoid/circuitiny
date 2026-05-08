## ADDED Requirements

### Requirement: Retrieval uses local sources first
The system SHALL resolve part identity and metadata by checking the built-in/hydrated local catalog before using curated database or web providers.

#### Scenario: Local catalog has a match
- **WHEN** a candidate part matches a local catalog entry with sufficient confidence
- **THEN** the system SHALL use local catalog pins, render strategy, source metadata, and beginner notes without performing a web search.

#### Scenario: Local catalog has close matches
- **WHEN** local catalog entries are similar but not exact
- **THEN** the system SHALL present the closest local matches and ask the learner to confirm rather than silently choosing one.

### Requirement: Curated database enriches common beginner parts
The system SHALL support a curated parts database for common kit parts, modules, synonyms, pin labels, beginner-safe voltage notes, and recommended companion parts.

#### Scenario: Curated database matches a candidate
- **WHEN** a candidate matches a curated database entry but no renderable local catalog item exists
- **THEN** the system SHALL return the curated metadata with a draft render strategy and "review required" status.

### Requirement: Exa web retrieval is a fallback provider
The system SHALL use Exa only when local catalog and curated database retrieval cannot provide enough information for a beginner-safe recommendation.

#### Scenario: Exa fallback runs
- **WHEN** local and curated retrieval fail or are incomplete and Exa is enabled
- **THEN** the system SHALL search with `EXA_API_KEY`, request source highlights, store source URLs/retrieved dates, and return normalized candidate metadata with confidence.

#### Scenario: Exa is unavailable
- **WHEN** `EXA_API_KEY` is missing, network access fails, or Exa returns an error
- **THEN** the system SHALL keep local recommendations available and explain that web-backed enrichment is unavailable.

### Requirement: Sources are ranked and cited
The system SHALL rank retrieved sources by trust before using them in beginner guidance.

#### Scenario: Multiple sources disagree
- **WHEN** datasheets, vendors, tutorials, or forum pages disagree about pinout, voltage, or current
- **THEN** the system SHALL prefer manufacturer/datasheet sources, show the conflict, and mark the part as needing review.

### Requirement: Retrieval is testable without network
The system SHALL abstract retrieval providers so tests can mock local catalog, curated database, and Exa responses.

#### Scenario: Unit tests run offline
- **WHEN** the test suite runs without network access or an Exa key
- **THEN** retrieval tests SHALL use fixtures and SHALL NOT call the live Exa API.
