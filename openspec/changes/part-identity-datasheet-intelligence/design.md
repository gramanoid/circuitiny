# Part Identity And Datasheet Intelligence Design

## Context

Circuitiny's catalog can describe a part once the metadata exists. The hard beginner problem is getting from a vague request or unknown physical part to a reviewed component definition. This change creates an identity pipeline that can say "this is definitely an HC-SR04 ultrasonic module", "this is a generic active buzzer", or "this looks like a DHT-style sensor but I need the marking to know the pinout".

The design must be source-driven. AI can help interpret markings and summarize datasheets, but trusted build behavior must be backed by retained source metadata and explicit confidence.

## Goals / Non-Goals

**Goals:**

- Identify parts from beginner language, exact part numbers, photos, labels, catalog entries, and imported CAD/model metadata.
- Retrieve and retain datasheet/source links with date, license/terms note, checksum when available, and extraction confidence.
- Extract beginner-useful pin roles, power limits, current limits, communication protocol, package/module variant, and companion parts.
- Detect conflicts between datasheets, modules, clones, and breakout-board pin orders.
- Feed reviewed metadata into DRC, code generation, simulation, realistic rendering, and recipes.

**Non-Goals:**

- AI-generated datasheet facts require review before trust.
- Paywalled, authenticated, or forbidden sources are excluded from scraping.
- Physical clones cannot be guaranteed to match datasheets without markings or user confirmation.
- No replacement for the Catalog Editor review workflow.

## Data Model

Add `PartIdentity` and related records:

- `identityId`, `catalogPartId`, `identityState`: `exact`, `generic-family`, `approximate`, `conflict`, `unknown`.
- `evidence`: user query, photo observations, markings, source URLs, imported model metadata, existing catalog matches.
- `datasheets`: URL, title, vendor, retrieval date, local cache status, license/terms note, checksum, document type.
- `extractions`: pinout, electrical limits, logic levels, communication protocol, timing notes, package/module variants, companion parts, warnings.
- `confidence`: identity, pinout, electrical limits, render match, codegen readiness.
- `review`: reviewer, reviewed fields, unresolved conflicts, promotion status.

Trusted project use requires reviewed fields, not just a high model score.

## Decisions

### Decision: Source evidence is retained for trusted use

Datasheet and source facts must retain URL, retrieval date, and confidence so trusted behavior can be audited later.

### Decision: Conflict blocks promotion

Pinout, voltage, current, package, or protocol conflicts become first-class states and block trusted catalog promotion until resolved.

### Decision: Reviewed fields drive build-critical behavior

Only reviewed identity fields can influence DRC, code generation, simulation defaults, and hardware guidance.

### Decision: Source lookup is allowlisted before broad web use

Local catalog, curated records, and approved source adapters are preferred before web-derived evidence because they are easier to test and explain.

## Lookup And Extraction Flow

1. Normalize the learner request or observed part details.
2. Search the local catalog first.
3. Search approved source adapters for datasheets and open part metadata.
4. Rank candidates by exact marking/part number, board/module match, pin count, package, voltage, and beginner suitability.
5. Extract structured metadata from source documents.
6. Compare extractions across sources and detect conflicts.
7. Present a beginner summary plus a reviewer view.
8. Promote only reviewed metadata into trusted catalog/project behavior.
9. Enforce a draft/catalog trust gate before DRC, code generation, simulation defaults, or hardware guidance can use identity-derived fields.

## Beginner UX

Part identity should answer beginner questions directly:

- "What is this part?"
- "Which pins do I connect?"
- "Can my ESP32 power this safely?"
- "Do I need a resistor, transistor, diode, or pull-up?"
- "Which Circuitiny part should I choose?"
- "Why does this module have different pin labels than the tutorial?"

The UI should use confidence language like "exact match", "family match", "needs marking", and "pinout conflict" instead of opaque model scores.

## Codex Integration

Codex can call identity lookup while helping build a circuit. Codex must:

- Prefer local catalog and reviewed identity records.
- Show the source and confidence behind recommendations.
- Ask before importing a new draft part or using unreviewed datasheet metadata.
- Explain substitutions, such as active buzzer vs passive buzzer, in beginner terms.

## Risks / Trade-offs

- Datasheets can disagree -> make conflict a first-class state and block trusted promotion until resolved.
- Generic modules vary -> require user confirmation for pin order and markings.
- AI can hallucinate -> extracted facts must point to stored source evidence or remain draft.
- Broad web search can be noisy -> source adapters should be allowlisted and tested with fixtures.
- Review bottlenecks can delay build/codegen for draft parts -> provide a fast-review path and safe defaults that explain what remains blocked.

## Rollout Plan

1. Introduce identity/source/extraction types and local catalog matching.
2. Implement fixture-based datasheet extraction for common starter parts.
3. Provide a UI for identity confidence and conflict review.
4. Integrate reviewed identity with DRC, codegen, recipes, and the draft/catalog trust gate for build-critical workflows.
5. Add Codex identity lookup tool and beginner explanation flow.
6. Expand source adapters after starter coverage is reliable.

## Migration Plan

Rollout step 1.2 SHALL backfill existing catalog bundles without breaking component readers. Migration uses in-place augmentation for built-in catalog entries and separate identity bundles for user-installed parts, with schemaVersion upgrade hooks, a bulk backfill command, validation reports, and rollback by ignoring untrusted identity metadata. Feature flags keep legacy catalog readers compatible until tests confirm migrated entries expose reviewed/draft fields correctly.

## Open Questions

- How should license and terms notes be represented when datasheets are free to read but unclear to redistribute?
- Which confidence threshold is high enough to promote generic-family metadata?
- Who can review identity fields in beginner workflows: learner, instructor, or automated verifier?
- How should paywalled or authenticated datasheet sources appear in recommendations?
- Should confidence scores be numeric internally or remain categorical for beginner-facing behavior?
