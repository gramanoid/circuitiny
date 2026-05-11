# Codex-guided app control

## ADDED Requirements

### Requirement: Codex-guided free/open model import

The system SHALL let Codex search, explain, prepare, download, convert, and install free/open model candidates only when using approved Circuitiny tools and approved free/open-source indexes, and SHALL require explicit learner approval before performing download, conversion, or installation actions.

Implementation glossary:

- `same reviewed catalog part`: immutable catalog ID and stable content fingerprint both match.
- `fingerprint`: source URL plus original source file hash/checksum and conversion-tool version when conversion is involved; changing converter version or source bytes invalidates review preservation unless the reviewer explicitly reconfirms the converted GLB.
- `bulk re-conversion`: a multi-item batch operation where every item independently matches the same reviewed catalog part criteria before review state is restored.

#### Scenario: Learner asks Codex for a realistic part model

- **WHEN** the learner asks Codex to find or import a realistic part model
- **THEN** Codex SHALL search the local catalog and approved free/open-source index, then present candidates with source URL, license classification, format, conversion need, confidence, and beginner notes before import.

#### Scenario: Candidate requires download or conversion

- **WHEN** Codex proposes downloading, converting, or installing a model candidate
- **THEN** Codex SHALL ask for learner approval before performing the action and SHALL keep new or converted catalog parts in draft review state.
- **AND** Codex SHALL preserve an already reviewed state if and only if the import is an exact restore or bulk re-conversion of the same reviewed catalog part; otherwise Codex SHALL place the part into draft review state and prompt the learner for review.

#### Scenario: Candidate is paid or license-blocked

- **WHEN** a candidate is paid, paywalled, non-downloadable, or license-blocked
- **THEN** Codex SHALL exclude it from the default recommendation set and explain the reason if it is relevant to the learner's request.

#### Scenario: Import needs manual review

- **WHEN** Codex imports a model whose pins, scale, or electrical metadata are uncertain
- **THEN** Codex SHALL keep the part in draft state and SHALL open or direct the learner to Catalog Editor review instead of treating the part as trusted.
