## Why

Circuitiny has powerful ESP32 design capabilities (3D canvas, schematic, DRC, templates, simulation, generated ESP-IDF code, build/flash, catalog editing, and AI tools) but exposes them as separate engineering surfaces rather than a guided learning path.
This change turns Circuitiny into a step-by-step learning environment where Codex recommends parts, explains choices, operates the app, and guides learners from intent to safe wiring, simulation, and hardware.

## What Changes

- Add beginner learning flows that wrap existing templates, DRC, simulation, code, and build/flash into step-by-step project recipes.
- Add a learner-friendly explanation layer for components, pins, wires, DRC findings, generated firmware, and simulation output.
- Extend the Codex integration so the agent can inspect the current UI/project state, propose visible next steps, request confirmation before risky changes, and validate designs with DRC and simulation.
- Add part discovery and recommendation capability that maps beginner intent, such as "detect a plant needs water", to recommended catalog parts and required companion parts.
- Add a catalog import/rendering pipeline that can create draft catalog entries from approved part recommendations, using existing `component.json`, GLB loading, schematic symbol inference, and Catalog Editor workflows.
- Add beginner-safe constraints around part recommendation: prefer parts already in the local catalog, explain missing parts, surface substitutions, and require learner approval before importing external/generated parts.
- Define the `beginner-learning-flows`, `codex-guided-app-control`, and `part-discovery-and-rendering` capability slices for implementation and validation.
- No breaking changes to the project file format are intended for the first implementation slice.

## Impact

- `src/templates/index.ts`: expand templates into learning recipes with goals, concepts, required parts, checkpoints, and expected simulation outcomes.
- `src/panes/TemplatePicker.tsx`: present recipes as beginner paths rather than static examples.
- `src/panes/Palette.tsx`: add part search, beginner labels, explanations, and "why this part" affordances.
- `src/panes/Viewer3D.tsx` and `src/panes/Schematic.tsx`: add guided wiring overlays, highlighted next pins, and learner-facing explanation hooks.
- `src/drc/index.ts`: preserve existing safety checks and expose clearer learner explanations and fix actions.
- `src/panes/SimPane.tsx`, `src/panes/CodePane.tsx`, and `src/panes/BuildPane.tsx`: add beginner-oriented checkpoint wording around simulation, generated code, ESP-IDF build, flash, and monitor.
- `src/agent/tools.ts`, `src/agent/expertPrompt.ts`, and `src/agent/codexcli.ts`: add tools and prompt rules for recommendations, visible app control, catalog lookup/import, and learning summaries.
- `src/catalog/index.ts`, `src/catalog/hydrate.ts`, `src/catalog/thumbnails.ts`, `src/panes/CatalogEditorPanel.tsx`, and `src/panes/CatalogEditor3D.tsx`: build on the existing local catalog, thumbnail, GLB, and pin authoring workflow.
- `electron/main.ts`, `electron/preload.ts`, and `src/global.d.ts`: may need IPC additions for external catalog lookup, generated/draft asset writing, and richer Codex app snapshots.
- Tests in `tests/catalog.test.ts`, `tests/drc.test.ts`, `tests/schema.test.ts`, `tests/sim.test.ts`, and agent/tool tests should cover the beginner paths and recommendation/import behavior.
