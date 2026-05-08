Context note, 2026-05-08: this is a post-implementation baseline for the current working tree. References to the Codex CLI provider, DRC explanations, recipe infrastructure, and Catalog Editor metadata reflect the repository state after this change, not the original pre-change app.

# Existing Feature Analysis

## What Already Overlaps With The Request

- Beginner examples already exist as real project templates: Blink LED, Button + LED, and SOS Blinker include components, nets, behaviors, and beginner difficulty tags in `src/templates/index.ts:14`.
- Circuitiny already has a real safety layer: DRC reports errors/warnings with rule IDs, messages, involved pins, and fix hints in `src/drc/index.ts:8` and runs rules for unsafe GPIOs, voltage mismatch, shorts, dangling nets, strapping pins, LED resistor issues, direction mismatch, and current budget in `src/drc/index.ts:20`.
- Codex already has useful project tools: it can inspect the project, list catalog entries, add/remove components, connect pins, run DRC, write firmware, set behaviors, save, list GLB models, inspect UI elements, click/type/press keys, fetch docs/datasheets, and run preflight planning in `src/agent/tools.ts:26`.
- The current Codex tool surface already includes beginner-relevant helpers: `blink`, `set_on_boot`, `on_button_press`, and `plan_circuit` reduce raw behavior authoring for common first projects in `src/agent/tools.ts:204` and `src/agent/tools.ts:342`.
- `plan_circuit` already checks unknown catalog IDs, missing LED resistors, missing I2C pull-ups, safe GPIOs, Wi-Fi/ADC2 restrictions, and restricted pins in `src/agent/tools.ts:806`.
- The app already supports user-added parts from `~/.circuitiny/catalog/`, including `component.json`, pins, schematic symbol inference, optional sim metadata, and GLB data registration in `src/catalog/hydrate.ts:22`.
- The Catalog Editor already loads existing component bundles, imports GLB files, edits metadata, edits pins, and exports a `.glb + .json` bundle in `src/panes/CatalogEditorPanel.tsx:15`.
- Simulation already blocks on DRC errors, runs behavior simulation, supports firmware/native simulation mode, and exposes compile/run logs in `src/panes/SimPane.tsx:26`.
- The app already has undo/redo infrastructure and project mutation snapshots in `src/store.ts:113`, which can be reused for AI action checkpoints.
- The GPT-5.5 reasoning effort GUI and Codex CLI provider already exist in the current working tree and should be treated as baseline, not future work.

## Original Gaps Against The Beginner-Learning Request

- Templates are static launch points, not guided lessons: they do not yet include wiring steps, concepts, expected observations, "why this matters", or progression.
- DRC messages are useful but still engineering-first: beginners need explanations of physical consequences and one-click safe recovery paths.
- Simulation shows state/logs but does not yet know the expected outcome of a lesson or tell the learner whether they succeeded.
- Code generation is visible but not taught: the learner needs a bridge from "this behavior" to "these generated firmware lines".
- Build/flash exists but common ESP-IDF and serial-port failures need beginner recovery wording.
- Codex can operate tools, but tool actions are not yet shown as a learning trace in the chat UI.
- Part search is local and ID-based; there is no intent-based recommendation layer for "I want to sense X" or "what part do I need for Y?".
- Catalog import exists, but there is no AI-draft trust state, source/confidence metadata, or review gate before a generated/imported part becomes trusted.
- Rendering supports GLBs and some hardcoded fallback bodies, but there is no explicit primitive-rendering strategy for unknown recommended parts.

## Implemented Build-On Work

This change built on the existing system rather than adding a separate tutorial product. Implemented work includes:

1. LearningRecipe types and helpers in `src/learning/recipes.ts`.
2. DRC explanations in `src/learning/drcExplanations.ts` plus build recovery hints in `src/panes/BuildPane.tsx`.
3. Codex IPC handlers `codexChat`/`codexStop`, screenshot context, scoped app tools, and visible reasoning effort controls.
4. The `recommend_parts` tool with local-first beginner recommendations and companion parts.
5. Catalog trust metadata, `ai-draft` handling, and `create_draft_part` for reviewed draft entries through the existing Catalog Editor.

## Remaining Work

- Add more recipe coverage beyond the first beginner paths.
- Expand curated/local catalog metadata and GLB coverage.
- Add external part lookup/photo intake as a separate OpenSpec change.
- Continue improving learner-facing explanations from real usage.
