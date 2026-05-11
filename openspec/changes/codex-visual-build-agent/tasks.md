# Codex Visual Build Agent Tasks

## 1. Context Snapshot

- [x] 1.1 Define `CodexSceneContext`, project summary, render summary, schematic summary, validation summary, catalog summary, image context, permissions, and autonomy tier types.
- [x] 1.2 Add a scoped context IPC endpoint/tool that returns current Circuitiny state without exposing unrelated OS data.
- [x] 1.3 Add screenshot/canvas image references only when enabled by user settings or explicit request.
- [x] 1.4 Add tests for context completeness, ID stability, and screenshot approval behavior.

## 2. Scoped Action Tools

- [x] 2.1 Implement typed tools for add part, place part, move part, delete item, connect pins, and connect breadboard holes.
- [x] 2.2 Implement typed tools for catalog search, identity lookup, and draft part import with approval gates.
- [x] 2.3 Implement typed tools for DRC, physical DRC, simulation, code generation, build, flash, monitor, and Reality Check request.
- [x] 2.4 Add tests for tool permissions, malformed tool arguments, and action result schemas.

## 3. Agent Action History And Rollback

- [x] 3.1 Group Codex tool calls into inspectable action sessions.
- [x] 3.2 Show plan, tool calls, changed objects, validation results, and beginner summaries in the UI.
- [x] 3.3 Add rollback for the most recent agent change group when the underlying project state supports it.
- [x] 3.4 Add tests for rollback and mixed user/agent edits.

## 4. Autonomy, Approval, And Effort Controls

- [x] 4.1 Add autonomy tier selector: explain-only, draft-edit, guided-edit, hardware-gated.
- [x] 4.2 Add approval prompts for external downloads, catalog writes, file overwrites, camera/photo analysis, build/flash, and serial monitor access.
- [x] 4.3 Expose Codex reasoning effort options low, medium, high, and xhigh in the GUI, preserving existing provider compatibility.
- [x] 4.4 Persist effort and autonomy settings.
- [x] 4.5 Add tests for approval gating and persisted settings.

## 5. Verification Loop

- [x] 5.1 Require DRC after Codex net/component edits.
- [x] 5.2 Require physical DRC after Codex breadboard placement edits.
- [x] 5.3 Require simulation or generated-code inspection after behavior/code changes.
- [x] 5.4 Require explicit user approval before build/flash/monitor actions.
- [x] 5.5 Add tests proving Codex cannot claim ready status without the relevant validation result.

## 6. Verification

- [x] 6.1 Validate with `openspec validate codex-visual-build-agent --strict`.
- [x] 6.2 Verify implementation with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] 6.3 Verify an end-to-end flow: learner asks Codex to build a button-controlled LED -> Codex edits -> validates -> explains -> stops before flash until approved.

Manual verification checklist for 6.3:

- Load Button + LED.
- Use scoped tools to inspect, add, and validate.
- Confirm DRC and physical DRC results are shown.
- Click Flash and verify the approval modal appears before `idfStart`.
- Cancel once to confirm no hardware action starts.
- Approve to allow the backend `approved: true` path.
