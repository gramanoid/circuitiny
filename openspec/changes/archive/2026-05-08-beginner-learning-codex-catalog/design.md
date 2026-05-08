## Context

Circuitiny is already close to the product shape the beginner workflow needs. It has a seeded project, board picker, reusable templates, component palette, 3D wiring, schematic view, behavior editor, simulation, code generation, ESP-IDF build/flash, local catalog hydration, GLB thumbnails, and a Catalog Editor for authoring `component.json` plus pins. The recent Codex provider adds ChatGPT-backed `gpt-5.5`, visual context, scoped app actions, and reasoning effort selection.

The main problem is not missing infrastructure; it is missing teaching structure. A beginner needs the app to answer "what am I building, why this part, where does this wire go, how do I know it is safe, what did the code do, and what should I try next?" while keeping them inside the same circuit canvas.

## Goals / Non-Goals

**Goals:**

- Make the first-run and project-building experience feel like guided learning, not an empty CAD tool.
- Build on existing templates, DRC, sim, generated code, build/flash, local catalog, and Codex tools.
- Let Codex recommend parts from beginner intent and explain tradeoffs in beginner language.
- Let Codex operate the visible app safely through scoped UI tools while preserving user control.
- Let unknown parts become reviewed draft catalog entries that can be rendered, edited, and tested before appearing as trusted parts.
- Keep the implementation incremental: a useful beginner path should ship before broad external catalog coverage.

**Non-Goals:**

- Do not build an unrestricted web shopping or purchasing flow.
- Do not let Codex silently install arbitrary external parts as trusted catalog entries.
- Do not require cloud APIs for the core beginner learning loop.
- Do not replace the existing Catalog Editor, DRC engine, behavior DSL, codegen, or ESP-IDF build surface.
- Do not promise perfect physical part geometry for every external recommendation in the first slice.

## Decisions

### Decision: Treat templates as learning recipes

Use the existing `TEMPLATES` array as the seed for a richer recipe model instead of creating a separate lesson system. Each recipe can add beginner metadata: concepts, parts, estimated time, wiring steps, checkpoints, expected sim results, hardware notes, and suggested follow-up experiments.

Alternative considered: create a separate `lessons/` system. That would duplicate project definitions and drift away from the real templates that users can launch.

### Decision: Add explanations beside existing checks

DRC already catches dangerous cases such as flash pins, input-only output, voltage mismatch, shorts, strapping pins, LED resistor mistakes, current budget, and I2S direction. The beginner layer should add explanation objects and UI affordances around those checks rather than fork new safety logic.

Alternative considered: add a separate "beginner validation" engine. That would create conflicting safety results and make future fixes harder.

### Decision: Use Codex as a guided operator, not an invisible automator

Codex may inspect project state, screenshots, and app snapshots, then use scoped app actions and project tools. It must summarize planned changes, ask confirmation before risky/import actions, run DRC after wiring changes, and present a beginner explanation after each meaningful step.

Confirmation levels map to the Codex confirmation flow used by `CodexActionExecutor` and `CodexConfirmationModal`: catalog import and generated draft parts require explicit confirmation; wiring changes require a soft prompt before the first mutation in a plan; part recommendations may be automatic but must be logged in the chat; project deletion, overwrite, and bulk edits require explicit confirmation; external tool execution such as build, flash, monitor, file writes outside the project, or operating-system control requires explicit confirmation.

Alternative considered: give Codex raw computer-use control over the whole macOS app. Scoped DOM/project tools are safer, easier to test, and enough for Circuitiny workflows.

### Decision: Prefer local catalog first, external discovery second

Part recommendation should first search built-in and hydrated local catalog entries. If no good match exists, Codex can use external lookup to propose a part, but it enters Circuitiny as a draft with source metadata, beginner explanation, pin confidence, schematic symbol, render strategy, and user approval state.

Alternative considered: connect directly to external catalogs as the main source of truth. That makes the beginner flow network-dependent and turns catalog quality into an external API problem.

### Decision: Render unknown parts with a staged fallback

Rendering should use a staged model:

1. existing GLB from the catalog when available,
2. primitive renderer for common part families such as LEDs, resistors, buttons, sensors, displays, servos, relays, and strip lights,
3. imported/generated GLB draft for complex parts,
4. generic labeled block only as an explicit low-confidence fallback.

Alternative considered: require a GLB before any part can be recommended. That blocks learning on visual asset availability.

### Decision: Introduce trust states for catalog parts

Catalog entries should be classified as built-in, user-installed, AI-draft, or reviewed. AI-draft parts can be used in planning and preview, but Circuitiny should flag them until the learner reviews pins, voltage, required companion parts, schematic symbol, and render.

Alternative considered: treat all generated catalog entries as normal entries. That hides uncertainty from beginners exactly when they need it most.

## Risks / Trade-offs

- External part data can be wrong or incomplete -> require source URLs, confidence labels, user review, and safe fallback suggestions.
- Codex may over-automate and reduce learning -> require step summaries, visible checkpoints, and "why" explanations after actions.
- Beginner explanations can clutter the expert interface -> add a Beginner mode surface and keep expert controls available but quieter.
- Part rendering can become a rabbit hole -> ship common primitive renderers first, then add GLB import/generation as a reviewed draft path.
- Recipe metadata can drift from actual project behavior -> derive wiring, components, DRC, code, and sim status from the live project when possible.
- Build/flash errors are intimidating -> translate common ESP-IDF and serial-port failures into beginner recovery steps while preserving raw logs.

## Migration Plan

No migration is required. This change is additive: existing projects continue to load through the current schema, and new learning/catalog metadata is optional until a recipe or draft catalog entry uses it.

## Open Questions

None at this time.
