## 1. Recipe And Learning Model

- [x] 1.1 Extend the template data model with beginner recipe metadata: goal, concepts, estimated time, required parts, wiring steps, checkpoints, hardware notes, and follow-up experiments.
- [x] 1.2 Convert the existing Blink LED, Button + LED, and SOS Blinker templates into beginner recipes using the extended metadata.
- [x] 1.3 Add tests that verify recipe metadata references real catalog components, valid pin refs, valid nets, and expected behavior IDs.

## 2. Beginner Recipe UI

- [x] 2.1 Update the template picker so beginner recipes show goal, concepts, parts, difficulty, and the first learning checkpoint.
- [x] 2.2 Add a beginner guidance panel that displays the current recipe step, why it matters, expected result, and next action.
- [x] 2.3 Add state for active recipe progress without breaking normal project editing or saved `.circuitiny.json` files.
- [x] 2.4 Add a way to hide or exit guidance so advanced users can keep the current direct editing workflow.

## 3. Wiring Guidance And Safety Explanations

- [x] 3.1 Add active-step highlighting for source and target pins in the 3D viewer and schematic.
- [x] 3.2 Add beginner explanations for DRC errors and warnings, reusing the existing DRC rule IDs and fix hints.
- [x] 3.3 Add UI actions for safe fixes that already exist, such as reassigning unsafe GPIO connections.
- [x] 3.4 Add tests for the beginner explanation mapping for dangerous DRC rules and common warnings.

## 4. Simulation, Code, And Hardware Checkpoints

- [x] 4.1 Connect recipe checkpoints to simulation state so a recipe can mark behavior as observed or failed.
- [x] 4.2 Add beginner explanations in the Sim pane for expected observations and likely causes when behavior does not match.
- [x] 4.3 Add beginner annotations in the Code pane that connect generated code sections to the active recipe behavior.
- [x] 4.4 Add beginner recovery messages in Build/Flash for common ESP-IDF, target, serial-port, and bootloader failures while preserving raw logs.

## 5. Codex Guided App Control

- [x] 5.1 Expand Codex context summaries to include active recipe progress, current checkpoint, selected component, DRC explanation summaries, and visible app state.
- [x] 5.2 Add Codex prompt rules requiring a plan, beginner explanation, DRC validation after wiring, and confirmation before risky actions.
- [x] 5.3 Add tool-call logging in the chat UI so the learner can see what Codex inspected or changed.
- [x] 5.4 Add cancellation support for Codex CLI runs so Stop terminates the active request instead of only aborting the local loop.
- [x] 5.5 Add tests or harness coverage for Codex tool loops that perform recipe-guided component, wiring, behavior, and validation actions.

## 6. Part Discovery And Recommendations

- [x] 6.1 Add a normalized part recommendation type covering part family, catalog match, confidence, beginner explanation, required companion parts, voltage/current cautions, pins, source links, and render strategy.
- [x] 6.2 Add a local catalog search/recommendation tool that maps beginner intent to existing catalog parts before using external lookup.
- [x] 6.3 Add companion-part rules for LEDs, buttons, I2C devices, relay/inductive loads, analog sensors, and displays.
- [x] 6.4 Add a Codex tool for recommending parts from a goal and returning beginner-safe options with clear tradeoffs.
- [x] 6.5 Add tests for recommendation ranking, local-first behavior, unknown-part handling, and companion-part detection.

## 7. Draft Catalog Import And Rendering

- [x] 7.1 Add draft catalog metadata for AI-draft, reviewed, and source/confidence state without breaking existing hydrated catalog entries.
- [x] 7.2 Add a reviewed import flow that writes draft `component.json` entries only after user approval.
- [x] 7.3 Add primitive renderers for common beginner part families when no GLB exists.
- [x] 7.4 Update Palette and Catalog Editor to show draft/review status, render confidence, source metadata, and review warnings.
- [x] 7.5 Add tests for draft import validation, primitive render fallback, and promotion from draft to reviewed.

## 8. Verification And Packaging

- [x] 8.1 Run `pnpm typecheck`.
- [x] 8.2 Run `pnpm test`.
- [x] 8.3 Run `pnpm build`.
- [x] 8.4 Smoke-test a beginner recipe in the running Electron app from recipe launch through simulation.
- [x] 8.5 Smoke-test Codex recommending a non-obvious part and either selecting a local match or creating a reviewed draft.
- [x] 8.6 Rebuild the macOS app and reinstall to `/Applications/Circuitiny.app` after implementation.
