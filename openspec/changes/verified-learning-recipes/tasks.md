# Verified Learning Recipes Tasks

## 1. Recipe State Machine

- [x] 1.1 Define verified recipe, milestone, action, evidence, hint, expected observation, and progress types.
- [x] 1.2 Add state transitions for ordered, optional, retry, blocked, and branching milestones.
- [x] 1.3 Persist recipe progress and resume state in project/session storage.
- [x] 1.4 Add tests for milestone ordering, branching, retry, blocked, and resume behavior.

## 2. Evidence Integrations

- [x] 2.1a Add evidence adapters for project state, DRC, simulation, generated code, ESP-IDF build, flash logs, serial monitor, physical DRC, and minimal Reality Check summaries.
- [x] 2.1b Add full Reality Check evidence.
- [x] 2.2 Let each milestone declare required, supporting, blocking, and manual evidence.
- [x] 2.3 Prevent recipe completion when required evidence is missing or blocking evidence exists.
- [x] 2.4 Add tests for evidence gates and false-positive prevention.

## 3. Beginner Lesson UI

- [x] 3.1 Build milestone stepper with current action, required evidence, safety state, and next best action.
- [x] 3.2 Show expected observations for simulation and hardware in beginner terms.
- [x] 3.3 Add progressive hints tied to actual DRC/simulation/build/Reality Check state.
- [x] 3.4 Add resume UI that explains what is already complete and what should be rechecked after a break.
- [x] 3.5 Add tests for hint selection, blocked-step copy, and resume display.

## 4. Codex Tutor Integration

- [x] 4.1 Expose current recipe/milestone/evidence context to Codex.
- [x] 4.2 Constrain Codex so it cannot mark milestones complete without evidence.
- [x] 4.3 Let Codex suggest or perform fixes according to the selected autonomy tier.
- [x] 4.4 Add follow-up experiment recommendations based on completed milestones and repeated mistakes.
- [x] 4.5 Add tests for Codex tutor constraints and follow-up recommendation triggers.

## 5. Starter Recipe Conversion

- [x] 5.1 Convert LED blink into verified recipe format.
- [x] 5.2 Convert button-controlled LED into verified recipe format.
- [x] 5.3 Convert SOS sequence blinker recipe into verified recipe format.
- [x] 5.4 Add physical layout and Reality Check milestones where available.
- [x] 5.5 Add tests for all converted starter recipes.

## 6. Verification

- [x] 6.1 Validate with `openspec validate verified-learning-recipes --strict`.
- [x] 6.2 Verify implementation with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] 6.3 Verify an end-to-end flow: launch recipe -> complete wiring evidence -> pass simulation -> build/flash with approval -> observe result -> receive next experiment.
