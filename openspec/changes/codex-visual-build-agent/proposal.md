# Codex Visual Build Agent

## Why

Codex should be able to see the circuit, act through scoped Circuitiny tools, and verify results so beginners can ask for safe guided builds instead of receiving detached chat advice.

## What Changes

- Introduce a structured scene/canvas context snapshot for Codex that includes project state, visible selection, rendered objects, DRC, recipe state, catalog data, and screenshot/canvas image when approved.
- Provide scoped app tools for Codex to add parts, place parts, wire pins or breadboard holes, run DRC, run simulation, generate code, build, flash, inspect logs, search the catalog, import draft parts, and request Reality Check (a physical-build validation that compares visible wiring/parts against Circuitiny's expected circuit and flags risky mismatches before build/flash).
- Implement autonomy levels and approval gates for risky actions such as external downloads, catalog writes, file overwrite, hardware flash, and camera/photo analysis; **BREAKING** `idfStart` now carries an optional `approved?: boolean` gate for hardware-affecting runs.
- Add post-action verification so Codex must inspect DRC/simulation/build/visual state before claiming success.
- Expose GPT-5.5 reasoning effort choices `low`, `medium`, `high`, and `xhigh` in beginner-facing GUI surfaces and pass them to the Codex provider.
- **BREAKING** Migrate legacy `none`/`minimal` reasoning values to `low` with a non-modal notice and audit event.
- Add an advanced opt-out flag to preserve explicit backend-only behavior when selected.
- Use `medium` as the recommended beginner GUI default because it balances latency, cost, and reliability; Codex CLI backend calls default to `high` when no effort is supplied to match the existing local CLI bridge.

## Impact

- IPC/tooling: new action endpoints and result schemas for Circuitiny-local tools.
- UI: Codex action plan, tool-call history, approval prompts, rollback/revert controls, and reasoning effort selector.
- Safety: explicit autonomy tier, risky-action approvals, and post-action validation requirements.
- Tests: tool permission tests, action-result tests, rollback tests, and end-to-end agent flow tests with mocked Codex responses.
