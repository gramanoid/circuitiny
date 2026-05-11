# Reality Check Camera Validation Design

## Context

Circuitiny has already structured project state, catalog parts, DRC, generated ESP-IDF code, simulation, Codex context, and beginner recipes. Those systems know what the circuit should be. Reality Check Mode adds a parallel observation layer that asks what the physical circuit appears to be, then compares those observations with project state.

The feature is intentionally conservative. It should help a beginner catch the common visible mistakes: wrong ESP32 pin, missing ground, LED polarity reversed, resistor omitted, button rotated incorrectly, power rail not connected, and part placed in a different location than the recipe expects. It should not pretend to measure voltage, continuity, hidden shorts, or invisible component values from a single photo.

## Goals / Non-Goals

**Goals:**

- Let a beginner validate a real build using the Mac camera or an uploaded photo.
- Keep capture consent explicit and visible.
- Align the photo to known board/breadboard geometry when possible.
- Map observed parts and wires to Circuitiny project instances and nets.
- Explain mistakes in plain language with a correction order that reduces risk.
- Reuse part catalog metadata and future realistic GLBs to improve recognition.
- Make uncertainty useful instead of noisy by asking the learner to confirm ambiguous items.

**Non-Goals:**

- Always-on camera access is not permitted.
- Images are not uploaded to external services without explicit consent.
- A photo alone cannot guarantee electrical safety.
- Reality Check does not replace DRC, simulation, multimeter checks, build, flash, or serial monitor validation.
- No requirement that the learner owns a perfect camera setup or a printed marker.

## Decisions

### Decision: Reality Check is local and transient by default

`RealityCheckSession` stores derived findings by default. Raw images stay transient unless the learner explicitly chooses image storage or AI vision use.

### Decision: Deterministic checks run before AI vision

Known board, breadboard, wire, and catalog fingerprints are checked locally first. Optional AI vision is a fallback for ambiguous observations after explicit approval.

### Decision: DRC remains authoritative for electrical rules

Reality Check can block or warn based on visible physical issues, but it does not replace DRC, simulation, build logs, or real measurements.

### Decision: Uncertainty is surfaced as learner action

Low-confidence observations become retake/manual-confirm prompts instead of hidden model scores or overconfident pass/fail claims.

## Design

### Data Model

Add a `RealityCheckSession` stored with volatile editor state and optional saved history:

- `id`, `createdAt`, `source`: `camera` or `photo`.
- `imageRef`: local transient image reference or saved project attachment when the user opts in.
- `consent`: camera granted, image storage allowed, AI vision allowed.
- `alignment`: target board type, transform, confidence, required retake reasons.
- `observations`: detected board, components, pins, wires, polarity markers, labels, rails, and unknown objects.
- `mappings`: observation-to-project component/pin/net matches with confidence.
- `findings`: confirmed issue, warning, uncertainty, or pass.
- `readiness`: whether the physical check should block, warn, or pass the next hardware action.

Persist `RealityCheckSession` metadata and derived `findings` to localStorage under a key tied to stable project ID and `.circuitiny.json` `schemaVersion`; exclude transient `imageRef` unless the user opts into attachment storage. The storage wrapper records project ID, schemaVersion, savedAt, and session, then migrates older compatible entries in place, invalidates future/incompatible schema entries, and purges sessions older than 30 days. Raw images without storage consent live only in transient in-memory state such as revocable blob URLs and are removed on session end, restart, project close, or window unload. Saved attachments belong in the project attachments store, while findings persist as text metadata so readiness can reload without retaining the raw image.

### Capture Flow

1. The learner clicks Reality Check from the editor, a recipe, or Codex.
2. The app explains what will be checked and asks for camera or file input.
3. The learner reviews the photo before analysis.
4. The app attempts board alignment and asks for a retake if the image is unusable.
5. Observations are mapped to project state.
6. Results appear as a prioritized correction list with highlighted pins/components in the editor.

### Recognition Layers

Use layered detection so the feature can improve over time:

- Deterministic geometry for known boards, breadboards, rails, pin rows, and major component outlines.
- Catalog fingerprints for realistic parts: expected size, color hints, pin count, package style, labels, and polarity markers.
- Optional AI vision adapter for ambiguous detection when the user explicitly allows it.
- Manual confirmation UI for "I found something here, is this the LED?" moments.

The deterministic layer should deliver value without network access. AI vision improves coverage but does not become a hard dependency.

### Validation Rules

Reality Check findings map to beginner-safe categories:

- `block`: visible power/ground short, missing ground for active circuit, reversed LED/polarized capacitor where current path is expected, USB/power risk, or wrong voltage rail.
- `warn`: uncertain part, wire color mismatch, hard-to-see endpoint, missing optional companion part, or physical layout differs from recipe but still maps electrically.
- `info`: confirmed match, suggested cleanup, or next measurement to take.

DRC remains the source of truth for project electrical rules. Reality Check adds evidence about the physical build and can block build/flash only when the app policy says a visible issue is too risky.

### Confidence Thresholds

Deterministic alignment or wire-mapping evidence that identifies a safety-critical mismatch maps to `block`; low-confidence local observations map to `warn` with retake/manual-confirm guidance; confirmed matches map to `pass` only for the visible checks performed. Numeric thresholds live as physical-reality-check constants. V1 starts with conservative placeholder rules: safety-critical mismatch confidence >= 0.70 maps to `block`, unclear endpoint or part confidence < 0.70 maps to `warn`, and only deterministic or confirmed matches map to `pass`.

### Threshold Calibration (Future)

Threshold calibration collects at least 100 real photos spanning controlled bench shots and in-field beginner photos across representative lighting, camera quality, hand positions, and common accessibility/skill levels.

### Threshold Versioning

Threshold updates store a threshold version on each session, replay a regression dataset before release, and use canary rollout so persisted sessions remain readable while new findings use the new constants.

### Beginner UX

The result view should be action-oriented:

- "Fix this first" ordering.
- One highlighted physical endpoint and one Circuitiny endpoint at a time.
- Side-by-side "what Circuitiny expects" and "what I see" descriptions.
- Retake guidance when lighting, blur, angle, or occlusion prevents confidence.
- No raw confidence jargon unless expanded.

### Codex Integration

Codex may ask to run Reality Check or inspect results. It must:

- Ask the user to start camera/photo capture.
- Use structured findings before interpreting pixels.
- Separate observed facts from guesses.
- Never claim a physical build is safe solely because the photo looks correct.

## Risks / Trade-offs

- Photos vary heavily in lighting and angle -> require confidence thresholds, retake prompts, and manual confirmation.
- Beginner trust risk -> use conservative language and never overclaim electrical safety.
- Privacy risk -> default to local/transient image handling.
- Recognition scope can explode -> begin with ESP32 dev boards, breadboards, LEDs, resistors, buttons, buzzers, common sensors, and jumper wires.

## Rollout Plan

1. Add UI shell, consent flow, photo import, and result model.
   - Migration Strategy: persist `RealityCheckSession` wrappers with `schemaVersion` and a stable project id in localStorage. `migrateRealityCheckSessions` upgrades legacy raw sessions in place, clears incompatible schema/project/version entries, and `purgeOldRealityCheckSessions` removes sessions older than 30 days. Rollback is conservative: unreadable or future-version entries are cleared, raw images remain transient unless `imageStorageAllowed` is true, and migration failures are surfaced through local warning telemetry.
   - Quota Strategy: `checkRealityCheckQuota` sums persisted Reality Check entries before save/load migration, excludes transient image references, warns near the configured storage threshold, and triggers oldest-session purge or save refusal before browser quota errors affect the learner.
2. Implement board/breadboard alignment fixtures for known starter boards.
3. Add deterministic checks for common beginner mistakes.
4. Integrate with recipes and DRC readiness.
5. Add optional AI vision adapter and Codex result explanation.
6. Expand part fingerprints as the realistic model library grows.

## Future Work / Out Of Scope For V1

- Consent wording ships as short local-only vs AI-assisted choices in the Reality Check UI and can be copy-tested later.
- Starter fingerprints begin with LED, resistor, button, and ESP32 board pins, then expand to common sensors.
- Build/flash gating blocks confirmed blocking findings; warnings and uncertain findings require learner acknowledgment or recipe-specific requirements.

## Open Questions

- What confidence constants should `RealityCheckSession` persistence and schemaVersion migration preserve when alignment or wire mapping changes between releases?
- Which breadboard variants should the deterministic recognition layer prioritize after the starter board path: mini, half-size, full-size, or branded variants with split rails?
- How should physical validation interact with electrical DRC when one passes and the other blocks, especially for deterministic checks versus optional AI vision observations?
