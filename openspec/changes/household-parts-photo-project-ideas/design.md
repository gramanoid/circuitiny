## Context

Circuitiny already has a local catalog, draft part creation, primitive/GLB render fallbacks, beginner recipe metadata, Codex CLI chat, screenshot context, and scoped app tools. The missing beginner workflow is "I found these parts at home; what can I build?" That workflow needs visual identification, confirmation, parts knowledge retrieval, and project recommendation without pretending uncertain part IDs are facts.

Exa is used only as an optional web retrieval provider after local catalog and curated database lookup fail. The Exa Search API documentation describes search `type` choices, `contents.highlights`, structured `output_schema`, and API key use through SDK configuration or the `x-api-key` header, so Circuitiny should use `EXA_API_KEY` and mocked provider tests rather than storing the user's key in source.

## Goals / Non-Goals

**Goals:**

- Let a beginner upload or capture a photo of household electronics parts and get a reviewable inventory.
- Rank matches from local catalog, curated database entries, and Exa-backed web sources with clear confidence and source links.
- Recommend beginner projects from confirmed parts, including "build now" and "needs these missing parts" options.
- Let Codex explain the recommendations and create a guided recipe/draft part only after learner confirmation.
- Keep unsafe or unknown hardware out of automatic build/flash flows.

**Non-Goals:**

- Full computer-vision training or a custom part-recognition model.
- Guaranteed identification from a single photo.
- Direct purchase checkout, vendor affiliate integration, or automatic ordering.
- Automatic wiring of unknown/high-voltage parts.
- Persisting user images unless the learner explicitly saves an inventory.

## Decisions

### Decision: Treat photo analysis as candidate extraction, not truth

The photo pipeline returns candidates such as "looks like 220 ohm resistor" or "possible ESP32 DevKit" with confidence, visible evidence, and learner-confirmation state. Circuitiny only uses confirmed parts for project recommendations and marks uncertain items as "not sure."

Alternative considered: auto-add every detected object to the catalog. That would be faster but dangerous for beginners because visually similar parts can have different pinouts, voltage limits, or polarity.

### Decision: Retrieval order is local catalog, curated DB, then Exa

Local catalog entries remain first because they have known pins and renderers. A curated JSON/SQLite database comes second for common beginner kit parts. Exa is the fallback for datasheets, tutorials, pinouts, and source discovery when local knowledge is missing.

Alternative considered: web search first. That makes the beginner flow network-dependent and creates inconsistent source quality.

### Decision: Exa provider is source-gathering, not final authority

The Exa provider should request highlights and source URLs, and can use structured output for normalized fields such as `part_name`, `possible_pinout`, `voltage`, `current`, `datasheet_url`, and `beginner_safe_notes`. Circuitiny still validates and labels confidence locally.

Alternative considered: ask Codex to browse freely. A provider abstraction is easier to mock, test, cache, and explain in source badges.

### Decision: Recommendations are inventory-aware lesson plans

Project cards should show used parts, missing parts, concepts learned, expected difficulty, safety notes, and a "create guided recipe" path. A beginner should see why a project is recommended, not just a list of components.

Alternative considered: return part recommendations only. That helps shopping but does not answer the learner's real question: what can I build and learn right now?

### Decision: Rendering unknown parts uses staged fallbacks

If a catalog GLB exists, render it. If no GLB exists but the part family is known, use the primitive family renderer. If neither is known, use a generic block with label, pin badges, review notes, and source links.

Alternative considered: hide parts without a GLB. That blocks learning for common cheap modules where model assets are not yet available.

## Risks / Trade-offs

- Misidentified parts -> Require confirmation, show confidence, and block high-risk actions until reviewed.
- Bad web sources -> Prefer datasheets/manufacturer/vendor pages, keep source links, and show source confidence.
- API key exposure -> Read `EXA_API_KEY` from environment or secure settings only; never write it into project files.
- Cost or network latency -> Cache by normalized query/image candidate and support "local-only" mode.
- Beginner overload -> Show project cards first, keep raw source detail behind expandable panels.
- Unsafe hardware -> Flag mains, lithium batteries, relays, motors, unknown power modules, and high-current loads with explicit safety warnings.

## Migration Plan

1. Add typed models and mocked providers with no UI entrypoint.
2. Add photo intake and inventory review using local-only matching.
3. Add curated database and Exa provider behind a disabled-by-default setting.
4. Add Codex tools and recommendation cards.
5. Add recipe/draft-part creation after learner confirmation.
6. Ship with network calls mocked in tests and guarded in runtime by provider availability.

Rollback is straightforward: hide the photo intake entrypoint and keep the catalog/recommendation internals unused.

## Open Questions

- Which vision provider should be the first implementation: Codex screenshot/image support, OpenAI API vision, or a local/manual bounding-box helper?
- Should saved inventories live inside project files, a separate user inventory store, or both?
- How much of the curated parts database should ship built-in versus downloaded as an optional catalog pack?
