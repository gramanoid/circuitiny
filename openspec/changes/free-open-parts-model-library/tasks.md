## 1. Source Inventory And License Gate

- [x] 1.1 Define source, asset, license-use, attribution, checksum, format, dimensions, and conversion metadata types.
- [x] 1.2 Build fixture-backed source adapters for KiCad packages3D, Antmicro hardware-components, and SparkFun KiCad Libraries.
- [x] 1.3 Add local-import-only descriptors for SnapMagic, Ultra Librarian, Sketchfab, manufacturer CAD pages, and Digi-Key metadata without bundling restricted assets.
- [x] 1.4 Implement license classification rules for bundled-ok, local-import-only, and blocked assets.
- [x] 1.5 Add tests for license classification, paid-source exclusion, source metadata preservation, and duplicate source entries.

## 2. Model Search And Beginner Library UX

- [x] 2.1 Add a searchable source index that supports beginner terms, exact part numbers, source filters, and format filters.
- [x] 2.2 Build a beginner starter pack manifest for common ESP32 learning parts with explicit source and license metadata.
- [x] 2.3 Add UI states for candidate source, license, format, conversion needed, confidence, and approximate-vs-exact model status.
- [x] 2.4 Add offline cache behavior for source indexes and installed catalog bundles.
- [x] 2.5 Add tests for starter pack search, exact part-number search, offline search, and source ranking.

## 3. Conversion And Optimization Pipeline

- [x] 3.1 Implement native glTF/GLB import and self-contained GLB output where needed.
- [x] 3.2 Add a converter interface for STEP/STP/WRL sources with structured logs, missing-tool detection, and failure states.
- [x] 3.3 Normalize converted models to Circuitiny units, orientation, origin, dimensions, and thumbnail generation.
- [x] 3.4 Add geometry and file-size budgets with optimization or draft-only warnings for heavy models.
- [x] 3.5 Add conversion fixtures and mocked converter tests without live network dependency.

## 4. Catalog Import And Review

- [x] 4.1 Generate existing-compatible catalog bundles containing `.glb`, `component.json`, source metadata, and review warnings.
- [x] 4.2 Infer candidate pins from source metadata or footprints when available, and mark inferred pins as unreviewed.
- [x] 4.3 Extend Catalog Editor to show license/source, conversion log, dimensions, and approximate/exact model confidence.
- [x] 4.4 Require manual review before promotion when pins, scale, voltage, companion parts, or schematic symbol are uncertain.
- [x] 4.5 Add tests for bundle writing, hydration, draft state, promotion, and GLB fallback rendering.

## 5. Codex Tools And Guardrails

- [x] 5.1 Add scoped Codex tools for model source search, candidate explanation, conversion preparation, and draft catalog import.
- [x] 5.2 Require Codex to show source/license/format/confidence and ask for approval before download, conversion, or catalog writes.
- [x] 5.3 Block paid, paywalled, or license-blocked candidates from default Codex recommendations.
- [x] 5.4 Add tests for Codex model search, approval gating, blocked-source behavior, and draft import review handoff.

## 6. Verification

- [x] 6.1 Verify OpenSpec with `openspec validate free-open-parts-model-library --strict`.
- [x] 6.2 Verify implementation with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] 6.3 Verify installed app flow with a native glTF/GLB import and one converted STEP/STP/WRL fixture.
