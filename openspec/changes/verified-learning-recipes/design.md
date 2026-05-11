# Verified Learning Recipes Design

## Context

The existing `beginner-learning-flows` spec already requires guided recipe launch, step-by-step wiring guidance, beginner safety explanations, simulation checkpoints, and a code/hardware bridge. Verified Learning Recipes deepens this from instructional text into an evidence-driven state machine. The learner should always know what they are trying to prove and why the app believes it is complete.

This is the beginner spine that ties together realistic parts, datasheets, physical breadboards, Reality Check, Codex, simulation, ESP-IDF, and serial monitor output.

## Goals / Non-Goals

**Goals:**

- Make every recipe step explicit, validated, and recoverable.
- Teach the physical and software reason for each milestone.
- Use app validation signals instead of manual "click done" whenever possible.
- Help beginners recover from common mistakes with targeted hints.
- Persist progress and let the learner resume safely.
- Let Codex tutor and generate follow-up lessons without skipping validation.

**Non-Goals:**

- Avoid gamification that hides engineering correctness.
- Do not force a linear path when a recipe intentionally allows exploration.
- Hardware flash always requires explicit approval.
- Recipe completion cannot be based solely on chat claims.

## Decisions

- **VerifiedRecipe validation model:** use evidence-driven validation instead of manual checkoff wherever Circuitiny can observe project state, DRC, simulation, build, hardware, or Reality Check results.
- **Evidence Gates policy:** each milestone separates required, supporting, blocking, and manual evidence so a helpful signal cannot replace required proof.
- **Adaptive Hints behavior:** hints are progressive and state-driven, using the current blocker before showing broader teaching copy.
- **Codex Tutoring Rules:** Codex can explain and suggest fixes, but cannot mark milestones complete or flash hardware without approval and passing evidence.
- **Manual Evidence caveats:** manual evidence is allowed only for proof the app cannot measure, and it stays visibly weaker than automated evidence.

## Recipe Model

Add `VerifiedRecipe`:

- `metadata`: goal, concepts, level, estimated time, required/recommended parts, safety notes.
- `milestones`: ordered or branching state machine.
- `actions`: identify part, place part, wire endpoints, inspect DRC, simulate, generate code, build, flash, monitor, Reality Check, reflect, experiment.
- `evidence`: project state, DRC pass, physical DRC pass, simulation observation, codegen file section, build log, flash log, serial monitor pattern, Reality Check finding, user confirmation.
- `hints`: progressive hints tied to failure causes and learner history.
- `expectedObservations`: LED blink, button press effect, serial output, sensor value range, voltage warning, visible layout.
- `progress`: completed milestones, attempts, mistakes encountered, resumed-at state.

## Evidence Gates

Each milestone declares acceptable evidence:

- `required`: must pass before the step can complete.
- `supporting`: helps explain or confirm but is not enough alone.
- `blocking`: prevents progress until fixed.
- `manual`: allowed only when the thing cannot be measured by the app.

Examples:

- Wiring milestone: DRC pass plus project net match.
- Physical placement milestone: physical DRC pass plus Reality Check when the recipe step declares physical confirmation is required; otherwise physical DRC alone suffices.
- Simulation milestone: expected virtual component state.
- Hardware milestone: build pass, user-approved flash, and serial/observable result.

## Adaptive Hints

Hints should respond to actual state:

- DRC says missing resistor -> show resistor-in-series explanation.
- Simulation fails but DRC passes -> check behavior configuration or active input state.
- Build fails due missing ESP-IDF -> explain setup path and preserve raw logs.
- Reality Check uncertainty -> ask for a clearer angle or manual confirmation.

Hints should be progressive:

1. Conceptual nudge.
2. Specific area to inspect.
3. Exact endpoints or setting.
4. Option to let Codex fix after explaining the change.

## Codex Tutoring Rules

Codex can:

- Explain the current milestone.
- Read validation evidence.
- Suggest or apply fixes within the chosen autonomy tier.
- Generate follow-up experiments after completion.

Codex cannot:

- Mark a milestone complete without evidence.
- Skip safety blockers.
- Flash hardware without approval.
- Hide raw logs when build/flash fails.

## Risks / Trade-offs

- Too many checkpoints can feel slow -> make evidence visible and steps small.
- Some learning requires manual observation -> support manual evidence with clear caveats.
- Beginners may want Codex to solve everything -> keep hints educational and require explanations after auto-fixes.
- Recipe schema can become rigid -> support optional and branching milestones.

## Migration Plan

1. Add verified recipe schema and state machine.
2. Convert existing beginner recipes to milestone/evidence format.
3. Add UI for evidence, hints, progress, and resume.
4. Integrate DRC, simulation, codegen, build/flash logs, and serial monitor evidence.
5. Add physical DRC and Reality Check evidence as those features land.
6. Add Codex tutoring constraints and follow-up lesson recommendations.

## Implementation Notes

- `VerifiedRecipe` conversion and evidence evaluation live in `src/learning/verifiedRecipes.ts`, with coverage in `tests/verified-recipes.test.ts`.
- Evidence does not expire automatically in v1; resume state is restored, and physical/hardware milestones ask the learner to re-run physical DRC or Reality Check after a break.
- Low-confidence Reality Check evidence blocks only when it is declared blocking; otherwise it becomes a warning/uncertain hint and can be paired with manual evidence.
- Manual evidence is limited to milestones whose required evidence includes `manual`, and the UI keeps it visibly distinct from automated proof.
- Manual evidence expiry policy is authoritative here; related feature specs should reference this block instead of duplicating it.
- Manual evidence expiry rules:
  - Expires when structural edits touch referenced component pin connectivity, net topology, or behavior logic/parameters that affect functionality.
  - Cosmetic edits such as 3D visual position/rotation, naming, styling, or render-only transforms do not expire evidence when they leave physical hole assignments and pin connectivity unchanged.
  - Physical hole/pin assignment, breadboard row/column, pad mapping, or component orientation changes that alter electrical connectivity do expire evidence.
  - App restart still asks hardware-facing milestones for revalidation.
  - Implemented in `src/learning/verifiedRecipes.ts` with coverage in `tests/verified-recipes.test.ts`.
- Codex autonomy tiers can prepare build/flash steps, but hardware approval remains a separate required action.

## Open Questions

- Should v2 introduce automatic freshness/expiration metadata for automated `VerifiedRecipe` evidence, beyond the v1 choice where only physical/hardware milestones ask for revalidation through `src/learning/verifiedRecipes.ts` and `tests/verified-recipes.test.ts`?
- What exact threshold should promote low-confidence Reality Check evidence from warning to blocking in evidence gates, and should that threshold be milestone-specific?
