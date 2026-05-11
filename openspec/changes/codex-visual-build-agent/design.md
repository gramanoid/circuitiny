# Codex Visual Build Agent Design

## Context

Circuitiny already has a `codex-guided-app-control` spec that requires visible context, scoped app control, beginner-preserving automation, validation after edits, and reasoning effort visibility. This change deepens that capability into a full build-agent pipeline with explicit tools, visual context, approval gates, and verification loops.

The beginner experience is the main constraint. Codex should be powerful enough to build and fix circuits, but the learner must see what changed, why it changed, and what proved it.

## Goals / Non-Goals

**Goals:**

- Give Codex structured access to what is rendered and selected.
- Let Codex operate the app through scoped Circuitiny actions instead of broad OS control.
- Make every Codex edit inspectable, reversible, and validated.
- Support GPT-5.5 reasoning effort selection in the GUI.
- Let Codex use catalog, datasheet, realistic model, physical breadboard, Reality Check, DRC, simulation, build, flash, and monitor tools as they become available.
- Teach while automating.

**Non-Goals:**

- Unrestricted computer control is not allowed by default.
- Camera/photo use requires learner approval.
- Hardware flashing requires explicit learner confirmation.
- Hidden project overwrites or external downloads are prohibited.
- AI answers must not claim correctness without app-side validation where validation exists.

## Decisions

### Decision: Structured state is authoritative

Codex receives screenshots only as visual context. Circuitiny project IDs, pins, nets, validation status, and tool results remain authoritative because images can be ambiguous.

### Decision: Tools are scoped to Circuitiny actions

Codex operates through typed tools such as scene context, DRC, physical DRC, Reality Check, part identity, catalog import, build, and flash gates. Broad operating-system control is outside the default agent contract.

### Decision: Autonomy tiers define allowed action classes

The four tiers separate inspection, draft/local editing, guided edits, and hardware-gated operations. This keeps beginner learning and safety visible while still allowing deeper automation.

### Decision: Risky actions always need explicit approval

External downloads, catalog writes, camera/photo analysis, build, flash, and monitor actions require explicit learner approval because they touch persistent files, privacy-sensitive inputs, or hardware.

`idfStart` receives an optional `approved?: boolean` flag for hardware-affecting build/flash/monitor runs. Approval is evaluated after the autonomy tier: `hardware-gated` can prepare these runs, but the IPC call is rejected unless the matching approval is present.

### Decision: Reality Check sessions are privacy-scoped

Reality Check sessions store structured observations, findings, a threshold version, and a transient image reference when the learner approves photo analysis. Persistent storage keeps only learner-approved metadata; temporary blob URLs are released on unload or when a new session replaces them.

## Architecture

### Context Snapshot

Add `CodexSceneContext`:

- `projectSummary`: components, nets, behaviors, selected items, active recipe step.
- `renderSummary`: visible objects, camera transform, 3D object bounds, hidden/offscreen state, render errors.
- `schematicSummary`: visible nodes, nets, warnings, selected schematic item.
- `validationSummary`: DRC, physical DRC, simulation status, codegen status, build/flash logs.
- `catalogSummary`: installed parts, draft parts, candidate recommendations, identity confidence.
- `imageContext`: screenshot/canvas image reference when available and approved.
- `permissions`: allowed tools, autonomy tier, pending approvals.

Structured data remains the authority for IDs, pins, nets, and tool effects. Images help with layout, rendering, and user-visible state.

Scene/canvas snapshots are created per Codex request, assigned a context ID, and linked to post-action verification results. Screenshot references are attached only when settings/request state and learner approval allow it; otherwise the snapshot still carries complete structured context and a "screenshot unavailable" status.

### Tool Contract

Codex tools should be narrow, typed, and auditable:

- `get_scene_context`
- `add_part`
- `place_part`
- `connect_pins`
- `connect_holes`
- `move_part`
- `delete_item`
- `search_catalog`
- `lookup_part_identity`
- `import_draft_part`
- `run_drc`
- `run_physical_drc`
- `run_simulation`
- `generate_code`
- `build_firmware`
- `flash_firmware`
- `open_monitor`
- `request_reality_check`
- `rollback_last_agent_change`

Every tool returns a structured result with changed IDs, validation status, warnings, and beginner explanation hooks.

Action history groups tool calls by Codex run. Rollback controls call the same scoped IPC/tooling layer and can revert only the latest compatible group atomically; mixed learner edits or external hardware state require a manual review path.

### Autonomy Levels

- `explain-only`: Codex can inspect and advise.
- `draft-edit`: Codex can create editable draft changes but must ask before applying.
- `guided-edit`: Codex can apply local circuit edits and must validate after each meaningful change.
- `hardware-gated`: Codex can prepare build/flash actions but must ask before hardware operations.

The learner can choose the autonomy level. Risky actions require approval regardless of tier.

### Verification Loop

For any non-trivial edit:

1. Codex states a short plan.
2. Codex calls scoped tools.
3. Circuitiny records the action history.
4. Codex runs appropriate validation.
5. Codex inspects results and summarizes remaining issues.
6. The UI offers rollback for the agent change group.

Validation is matched to action:

- Circuit edit -> DRC.
- Physical placement -> physical DRC.
- Behavior/code change -> simulation or generated code inspection.
- Build request -> ESP-IDF build log.
- Flash request -> explicit user approval plus port/target checks.

### Reasoning Effort

Expose reasoning effort in the Codex settings panel:

- `low`: quick simple help.
- `medium`: default guided builds.
- `high`: hard debugging, datasheets, multi-step repairs.
- `xhigh`: deep architecture, difficult failures, complex physical/camera/datasheet reasoning.

The Codex settings panel SHALL show only `low`, `medium`, `high`, and `xhigh` as beginner-facing primary choices. The backend/provider contract accepts the full value set `none | minimal | low | medium | high | xhigh`; `none` and `minimal` are backend-only or advanced compatibility values and are hidden from the primary beginner UI.

## Risks / Trade-offs

- Too much automation can reduce learning -> require explanations and visible validation.
- Tool surface can become unsafe -> keep action schemas narrow and approval-gated.
- Screenshots can be ambiguous -> structured context is authoritative.
- Long-running builds can block UI -> stream logs and preserve cancel/retry behavior.

## Migration Plan

1. Add context snapshot and read-only Codex inspection.
2. Introduce local circuit-edit tools with action history and rollback.
3. Implement DRC/simulation/code/build validation tools.
4. Provide effort selector and autonomy settings UI.
5. Integrate catalog/identity/import tools.
6. Enable Reality Check and hardware-gated flash/monitor tools.
7. Migrate `idfStart` callers to pass explicit approvals for hardware-affecting runs.
8. Migrate legacy `none`/`minimal` reasoning values to `low` through a visible notice while respecting the advanced opt-out flag.

## Open Questions

- Should screenshot/canvas image access be per-request, per-session, or controlled by a persistent workspace setting?
- When Reality Check and DRC disagree, should hardware gating block on the more conservative result or ask the learner to resolve the conflict?
- How much rollback history should be retained for Codex action groups before it becomes confusing in long beginner sessions?
