## Context

The existing app can already load `.glb` files through Catalog Editor, persist catalog bundles under the user catalog, hydrate them into the in-memory catalog, render imported GLBs in the 3D viewer, and show metadata confidence. The gap is discovery and preparation: beginners do not know where safe/free models live, most electronics CAD models are STEP/STP/WRL rather than GLB, and license terms vary widely.

Initial source research found these practical inputs:

- KiCad packages3D: 12,378 STEP/WRL assets counted from the public GitHub tree. The KiCad library license allows free use in projects and redistribution of library collections under the same license with attribution/license files retained.
- Antmicro hardware-components: 735 glTF model entries plus KiCad symbols/footprints and Blender sources, licensed Apache-2.0.
- SparkFun KiCad Libraries: 324 STEP/STP assets counted under `3dmodels/`, licensed CC-BY 4.0.
- Digi-Key KiCad Library: useful open KiCad symbols/footprints and part metadata, but no STEP/WRL/GLB assets were found in the checked GitHub tree.
- SnapMagic/SnapEDA, Ultra Librarian, manufacturer pages, and Sketchfab can be useful free sources, but must be treated per-asset. They are not assumed bundled-ok unless the exact model license allows redistribution.

## Goals / Non-Goals

**Goals:**

- Build a beginner-friendly model library without paid assets.
- Prefer redistributable open libraries for bundled packs.
- Allow free local imports from non-bundled sources when the user approves and the terms allow personal/local use.
- Convert STEP/STP/WRL/glTF into normalized `.glb` assets suitable for Circuitiny.
- Preserve source URLs, license, attribution, retrieval date, checksum, dimensions, and confidence on each imported catalog part.
- Keep imported parts in draft/review state until scale, pins, and electrical metadata are checked.

**Non-Goals:**

- No paid subscriptions, paid model marketplaces, or premium part creation services.
- No scraping authenticated sites or bypassing download terms.
- No claim that a visual model proves electrical correctness.
- No giant bundled asset dump on first launch; the starter pack should be useful and small.
- No replacement for the existing Catalog Editor; the new flow feeds it.

## Decisions

### Decision: License-gated source classification

Every source and asset gets a `licenseUse` classification:

- `bundled-ok`: safe to ship in a Circuitiny library pack with required license and attribution files.
- `local-import-only`: free for the user to download/import locally, but not safe for Circuitiny to redistribute.
- `blocked`: paid, unclear, non-downloadable, or incompatible with the user's "do not pay" rule.

Alternative considered: allow any free model. Rejected because "free download" is not the same as redistributable, and beginners should not have to reason about license traps.

### Decision: Open sources first

The first source adapters target KiCad packages3D, Antmicro hardware-components, and SparkFun KiCad Libraries because they are public, structured, and license-reviewable. Digi-Key is useful for part metadata but is not a model source in the checked repository. SnapMagic, Ultra Librarian, Sketchfab, and manufacturer CAD pages are optional local-import sources after per-asset review.

Alternative considered: start with Sketchfab because it has direct GLB downloads. Rejected as the primary path because quality, scale, pin positions, and licenses are inconsistent model by model.

### Decision: Conversion pipeline is pluggable

Native GLB/glTF assets are imported first. STEP/STP and WRL assets pass through a converter interface that can use installed tools such as FreeCAD/OCCT/Blender adapters. The app stores conversion logs and blocks install when conversion fails.

Alternative considered: require one bundled converter immediately. Rejected because converter availability differs by platform and native glTF sources can deliver value before all STEP conversion tooling is packaged.

### Decision: Review-first catalog promotion

Imported models produce the same bundle shape as the current Catalog Editor: `.glb` plus `component.json`. The model can be previewed immediately, but the part remains draft until pin positions, pin types, schematic symbol, voltage/current notes, and companion parts are reviewed.

Alternative considered: auto-promote models with inferred pins. Rejected because model geometry and footprint pads can be physically correct while the learner-facing electrical mapping is still wrong.

### Decision: Starter pack before full index

The app ships or offers a small beginner starter pack first: LEDs, common resistors, capacitors, tactile buttons, potentiometers, buzzers, displays, simple sensors, headers/connectors, common power parts, and breadboard aids where license-safe models exist. Broad source search remains available but is secondary.

Alternative considered: import every open asset up front. Rejected because a huge catalog is slower, harder to browse, and less beginner-friendly.

## Risks / Trade-offs

- License drift or unclear attribution -> store source snapshots, license URLs, attribution text, and block redistribution unless explicitly classified.
- STEP conversion quality varies -> keep converter logs, dimensions, thumbnails, and manual review before promotion.
- Imported models may be visually correct but electrically misleading -> require pin review and companion-part checks before trusted use.
- Large source indexes can slow the app -> cache compact manifests and fetch/download model files only on install.
- Source repositories change paths over time -> use source adapter tests with fixtures and tolerate missing assets without breaking the app.

## Migration Plan

1. Add source manifest and license classification types without changing existing catalog loading.
2. Add read-only source index fixtures and search UI/tooling.
3. Add native GLB/glTF import through the current catalog bundle writer.
4. Add STEP/STP/WRL conversion adapters behind capability checks.
5. Add starter pack installation and source badges.
6. Add broad source search and Codex-guided import after the review loop is stable.

Rollback is straightforward because imported parts are user catalog bundles. Removing the feature leaves existing bundles readable by the current catalog hydration path.

## Open Questions

- Which converter should be bundled first on macOS: FreeCAD headless, OCCT-based CLI, Blender-assisted mesh conversion, or a smaller dedicated converter?
- Which exact starter-pack assets should be bundled versus offered as one-click downloads?
- Do we want a per-source attribution screen in Settings or per-part attribution only?
