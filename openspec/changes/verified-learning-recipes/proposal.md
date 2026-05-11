# Verified Learning Recipes

## Why

Beginners learn best with validated milestones. Verified Learning Recipes connect DRC, simulation, build/flash, and physical validation into an evidence-driven lesson engine.

## What Changes

- **BREAKING** Introduce a recipe state machine with explicit milestones: concept, part identification, placement, wiring, DRC, simulation, code generation, build, flash, monitor, physical Reality Check, and reflection.
- **BREAKING** Make each step declare what evidence completes it and what evidence is insufficient.
- Enable adaptive hints that respond to the learner's current DRC/simulation/build/Reality Check state without simply giving away the whole answer.
- **BREAKING** Support recipe resume/history so learners can stop, fix hardware later, and continue from a known state.
- Add curriculum generation hooks so Codex can recommend the next lesson from completed milestones and mistakes.

## Impact

- Recipe schema: milestones, evidence requirements, hints, remediation, expected observations, and completion history.
- UI: stepper, current evidence, next action, hints, progress, and resume state.
- Validation: step completion reads from DRC, physical DRC, simulation, generated code, build/flash logs, serial monitor, and Reality Check.
- Tests: recipe state transitions, validation evidence gates, hint selection, resume, and Codex tutoring constraints.
