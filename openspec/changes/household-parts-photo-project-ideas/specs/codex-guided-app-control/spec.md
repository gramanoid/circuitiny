## ADDED Requirements

### Requirement: Codex can operate the parts-photo workflow through scoped tools

The system SHALL expose scoped Codex tools for photo candidate analysis, inventory matching, web-backed part retrieval, and project recommendation without granting unrestricted operating-system control.

#### Scenario: Codex analyzes a parts photo

- **WHEN** the learner asks Codex what can be built from a provided parts photo
- **THEN** Codex SHALL call a scoped photo analysis tool and SHALL present candidates for learner confirmation before using them.

#### Scenario: Codex searches external part knowledge

- **WHEN** local catalog and curated database lookup cannot answer a part question
- **THEN** Codex SHALL use the configured retrieval provider tool, including Exa when enabled, and SHALL summarize source confidence and safety constraints.

## MODIFIED Requirements

### Requirement: Codex asks before creating inventory, parts, or projects

The system SHALL require explicit learner confirmation before Codex persists a detected inventory, creates a draft catalog part, or generates a project/recipe from recommendations.

Traceability: RENAMED FROM "Codex wants to create a draft part" TO "Codex asks before creating inventory, parts, or projects"; expanded here to cover inventory and project creation.

#### Scenario: Codex proposes a draft part

- **WHEN** Codex identifies a part that is not in the local catalog
- **THEN** Codex SHALL explain the evidence, source links, render fallback, and review requirements before asking for approval to create the draft.

#### Scenario: Codex recommends initiating a project

- **WHEN** Codex recommends a project from confirmed inventory
- **THEN** Codex SHALL show the parts used, missing parts, safety notes, and first learning step before asking for approval to create the project.
