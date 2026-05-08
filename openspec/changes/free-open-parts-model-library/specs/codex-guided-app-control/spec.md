## ADDED Requirements

### Requirement: Codex-guided free/open model import
The system SHALL let Codex search, explain, and prepare free/open model candidates only through scoped Circuitiny tools and explicit learner approval.

#### Scenario: Learner asks Codex for a realistic part model
- **WHEN** the learner asks Codex to find or import a realistic part model
- **THEN** Codex SHALL search the local catalog and approved free/open source index, then present candidates with source URL, license classification, format, conversion need, confidence, and beginner notes before import.

#### Scenario: Candidate requires download or conversion
- **WHEN** Codex proposes downloading, converting, or installing a model candidate
- **THEN** Codex SHALL ask for learner approval before performing the action and SHALL keep the resulting catalog part in draft review state unless it is already reviewed.

#### Scenario: Candidate is paid or license-blocked
- **WHEN** a candidate is paid, paywalled, non-downloadable, or license-blocked
- **THEN** Codex SHALL exclude it from the default recommendation set and explain the reason if it is relevant to the learner's request.

#### Scenario: Import needs manual review
- **WHEN** Codex imports a model whose pins, scale, or electrical metadata are uncertain
- **THEN** Codex SHALL open or direct the learner to Catalog Editor review instead of treating the part as trusted.
