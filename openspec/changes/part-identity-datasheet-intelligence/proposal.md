# Part Identity And Datasheet Intelligence

## Why

Beginners can often identify the object in their hand but not its electrical specs, so Circuitiny needs datasheet-backed identity before it can safely guide circuits, code, and hardware checks.

## What Changes

- Introduce part identity records that combine catalog entries, part numbers, photos, markings, datasheets, source links, and confidence.
- Enable datasheet retrieval and extraction for pinouts, electrical limits, package variants, common breakout-board wiring, and beginner warnings.
- Support exact/generic/approximate identity states so the app can be honest when it knows a family but not the precise model.
- **BREAKING** Feed identity data into DRC, generated code, companion-part recommendations, realistic rendering, Codex answers, and Catalog Editor review (reviewed datasheet evidence can change DRC rules and generated-code assumptions).
- **BREAKING** Keep all low-confidence identities in draft/review state before they affect trusted build guidance (build/code-generation guidance is gated until uncertain identity data is reviewed).

## Impact

- Catalog: add identity, datasheet, source, extraction, and review metadata.
- UI: add identity panel, datasheet source cards, confidence labels, and beginner pinout summaries.
- DRC/codegen: use datasheet-backed voltage/current/pin-role metadata when reviewed.
- Tests: fixture datasheets, mocked source lookups, extraction confidence tests, and conflict-handling tests.
