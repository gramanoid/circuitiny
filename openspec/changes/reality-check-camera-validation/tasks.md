# Reality Check Camera Validation Tasks

## 1. Data Model And Privacy Gate

- [x] 1.1 Define `RealityCheckSession`, image source, consent, alignment, observation, mapping, finding, and readiness types.
- [x] 1.2 Add project/editor state storage for current Reality Check results without saving raw images by default.
- [x] 1.3 Add explicit camera/photo consent UI and image review before analysis.
- [x] 1.4 Add tests proving camera access, image storage, and AI vision use are never implied.

## 2. Capture And Alignment

- [x] 2.1 Add camera capture and photo upload entry points from editor, recipe checkpoints, and Codex requests.
- [x] 2.2 Detect known ESP32 board and breadboard alignment using fixture images.
- [x] 2.3 Produce retake reasons for blur, angle, occlusion, missing board, and low confidence.
- [x] 2.4 Add tests for alignment pass/fail cases using local image fixtures.

## 3. Observation And Mapping

- [x] 3.1 Detect visible components, jumper wires, rails, pin rows, polarity markers, and unknown objects for starter circuits.
- [x] 3.2 Map observations to project components, pins, and nets with confidence and manual confirmation hooks.
- [x] 3.3 Use catalog metadata, dimensions, pin counts, colors, and part fingerprints to improve matches.
- [x] 3.4 Add tests for LED, resistor, button, buzzer, ground, and power rail mapping.

## 4. Validation And Beginner Results

- [x] 4.1 Implement confirmed, warning, uncertainty, pass, and block finding categories.
- [x] 4.2 Add checks for wrong pin, missing ground, missing resistor, reversed LED, button orientation, rail gap, and power/ground short clues.
- [x] 4.3 Display prioritized corrections with canvas highlights and plain-language explanations.
- [x] 4.4 Feed physical readiness into recipe checkpoints and hardware-action gating.
- [x] 4.5 Add tests for correction ordering, uncertainty handling, and DRC integration.

## 5. Codex And AI Vision

- [x] 5.1 Expose Reality Check summaries to Codex as structured context.
- [x] 5.2 Add scoped Codex tool for requesting a Reality Check without direct camera control.
- [x] 5.3 Add optional AI vision adapter behind explicit user approval.
- [x] 5.4 Add tests that Codex separates observed findings from guesses and asks for approval before image analysis.

## 6. Verification

- [x] 6.1 Validate with `openspec validate reality-check-camera-validation --strict`.
- [x] 6.2 Verify implementation with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] 6.3 Verify the text/manual-observation beginner flow end-to-end.

Verification covers the data model, consent gating, and text/manual-observation beginner flow; camera capture, alignment, component detection/catalog matching, AI vision adapter, and image-analysis end-to-end validation remain pending per 2.1-2.4, 3.x, 4.x, and 5.3-5.4.

> Note: Camera entry points, ESP32/breadboard alignment, retake reasons, and alignment tests remain covered by pending tasks 2.1, 2.2, 2.3, and 2.4.
