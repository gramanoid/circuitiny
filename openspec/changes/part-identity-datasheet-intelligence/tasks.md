# Part Identity And Datasheet Intelligence Tasks

## 1. Identity Data And Source Trust

- [x] 1.1 Define part identity, evidence, datasheet, extraction, confidence, conflict, and review types.
- [x] 1.2 Add migration/loading support for identity metadata in catalog bundles without breaking existing components.
- [x] 1.3 Add source classification rules for reviewed, draft, conflicting, local-only, and blocked identity evidence.
- [x] 1.4 Add tests for identity state transitions and backwards-compatible catalog loading.

## 2. Local Matching And Datasheet Retrieval

- [x] 2.1 Implement local catalog matching from beginner terms, exact part numbers, labels, and known aliases.
- [x] 2.2 Add fixture-backed datasheet/source adapters for starter parts and modules.
- [x] 2.3 Store source URL, title, vendor, retrieval date, checksum when available, and terms/license notes.
- [x] 2.4 Add tests for exact match, generic-family match, unknown part, and blocked-source handling.

## 3. Datasheet Extraction

- [x] 3.1 Extract pinout, pin aliases, voltage/current limits, protocol, package/module variant, and companion parts.
- [x] 3.2 Detect extraction conflicts between sources and classify fields by confidence.
- [x] 3.3 Keep unreviewed or conflicting extracted fields from trusted DRC/codegen use.
- [x] 3.4 Add fixture tests for active buzzer, passive buzzer, LED, resistor, HC-SR04, DHT-style sensor, I2C display, and relay/transistor driver guidance.

## 4. Beginner UX And Catalog Review

- [x] 4.1 Add part identity panel with exact/generic/approximate/conflict states.
- [x] 4.2 Show source-backed beginner summaries for pins, power, companion parts, and mistakes to avoid.
- [x] 4.3 Extend Catalog Editor review to promote selected identity fields.
- [x] 4.4 Add tests for conflict display, promoted field visibility, and draft warnings.

## 5. Integration With Circuit Behavior

- [x] 5.1 Feed reviewed identity metadata into DRC voltage/current/pin-role checks.
- [x] 5.2 Feed reviewed protocol and pin-role metadata into generated code and simulation setup.
- [x] 5.3 Use identity metadata to improve realistic rendering and physical Reality Check fingerprints.
- [x] 5.4 Expose scoped Codex identity lookup and explanation tools.
- [x] 5.5 Add tests covering DRC/codegen behavior with reviewed vs unreviewed identity data.

## 6. Verification

- [x] 6.1 Validate final full scope with `openspec validate part-identity-datasheet-intelligence --strict`.
- [x] 6.2 Verify final full scope with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] 6.3 Verify an end-to-end flow: vague learner request -> candidate identities -> datasheet-backed review -> trusted catalog use.
