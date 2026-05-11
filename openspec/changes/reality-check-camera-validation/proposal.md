# Reality Check Camera Validation

## Why

Beginners need to verify that their physical circuit matches the Circuitiny project before flashing firmware or assuming a tutorial failed. Reality Check Mode uses camera validation to compare the real build against the virtual circuit and turn mistakes into beginner-safe corrections.

## What Changes

- Add a privacy-explicit camera/photo validation mode for checking physical builds against the current project.
- Match visible physical parts, board orientation, pins, wires, polarity markers, and obvious missing companion parts to Circuitiny component instances and nets.
- Produce a beginner correction report that separates confirmed issues, uncertain observations, and safe next actions.
- **BREAKING** Feed Reality Check results into recipes, DRC, Codex guidance, and build/flash readiness where checkpoints require visible-build evidence.
- Support manual confirmation when the camera cannot confidently identify a part, wire, or pin.
- Do not claim full electrical proof from an image; Reality Check is a visible-build validation layer that complements DRC, simulation, and ESP-IDF logs.

## Impact

- UI: new Reality Check entry point, camera/photo consent flow, image review view, correction list, and manual confirmation controls.
- Data: image-derived observations, confidence scores, alignment transforms, component mappings, and validation result history.
- Safety: build/flash readiness can include visible-build warnings without replacing existing DRC blockers.
- Tests: deterministic image fixtures, mocked camera input, alignment unit tests, and recipe integration tests.
- Privacy: no image is captured, stored, or sent to AI/model services unless the user explicitly starts the check and approves the requested use.
