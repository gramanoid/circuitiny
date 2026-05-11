## Why

Circuitiny already supports user catalog GLBs, but beginners need a realistic, license-safe parts library so the canvas looks like what they will touch on the desk. This change turns free/open electronics CAD sources into reviewed Circuitiny catalog parts, without paying for models or redistributing assets whose license is unclear.

## What Changes

- Add a free/open source inventory for electronics CAD models, prioritizing redistributable sources before free-but-restricted download sites.
- Add a license gate that classifies each source and asset as bundled-ok, local-import-only, or blocked.
- Add source adapters for model indexes such as KiCad packages, SparkFun KiCad models, and Antmicro glTF hardware components.
- Add a conversion and normalization pipeline that turns STEP/STP/WRL/glTF assets into Circuitiny-ready `.glb` files when needed.
- Reuse the existing Catalog Editor review flow so imported models become normal Circuitiny catalog bundles only after pins, scale, source metadata, and confidence are reviewed.
- Add a beginner starter model pack focused on common ESP32 learning parts before exposing broad source search.
- Extend Codex tools so the learner can ask for a part in plain English and Codex can recommend free/open model candidates with source and license details before import.
- Do not use paid assets, scrape paywalled downloads, or bundle models from sources whose redistribution rights are unclear.

## Impact

- Catalog: new source manifest, asset metadata, license classification, duplicate handling, and batch import output that matches the existing `component.json` plus `.glb` bundle shape.
- Renderer: imported GLBs continue to use the existing 3D viewer path, thumbnails, and primitive fallback behavior.
- Catalog Editor: source/license fields, conversion status, and pin review remain visible before promotion.
- Agent tools: new search, candidate review, convert, and import tools that require user approval before external downloads or persisted catalog writes.
- Build tooling: optional model conversion dependencies for STEP/STP/WRL sources, with no hard requirement for users who only import native GLB/glTF assets.
- Tests: fixture-backed source indexes and conversion mocks; no unit test depends on live network access.
