---
name: openspec-archive-change
description: Archive a completed change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Archive a completed change in the experimental workflow.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   Run `openspec list --json` to get available changes. Use the **AskUserQuestion tool** to let the user select.

   Show only active changes (not already archived).
   Include the schema used for each change if available.

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

   Rationale: `openspec-archive-change` is destructive and effectively
   irreversible, so selection must be explicit through `openspec list --json`
   and the AskUserQuestion tool. `openspec-apply-change` may auto-select a
   single active change because applying is less destructive and easier to
   inspect or revert before archiving.

2. **Check artifact completion status**

   Run `openspec status --change "<name>" --json` to check artifact completion.

   Parse the JSON to understand:
   - `schemaName`: The workflow being used
   - `artifacts`: List of artifacts with their status (`done` or other)

   **If any artifacts are not `done`:**
   - Display warning listing incomplete artifacts
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Check for delta specs at `openspec/changes/<name>/specs/`. If none exist, proceed without sync prompt.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `openspec/specs/<capability>/spec.md`
   - Determine what changes would be applied (adds, modifications, removals, renames)
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now", "Sync anyway", "Cancel"

   If user chooses sync, invoke the `openspec-sync-specs` skill directly with the change name and delta spec summary, then proceed to archive after the sync result is known. If sync fails or conflicts, default to aborting the archive and present choices: abort and resolve manually, archive anyway with a warning note, or retry sync with conflict-resolution options. "Sync anyway" forces a re-sync even if the specs look current, useful when main specs were edited manually since the last sync; log the sync outcome before archiving.

5. **Perform the archive**

   Prefer the CLI because it handles date-prefixing, conflict detection, spec merging, and validation:
   ```bash
   openspec archive <name> --yes
   ```

   Manual fallback only: these commands require a Unix-like shell such as macOS Terminal, Linux, WSL, or Git Bash. In PowerShell:
   ```powershell
   New-Item -ItemType Directory -Force openspec/changes/archive
   $DATE = Get-Date -Format "yyyy-MM-dd"
   $TARGET = "openspec/changes/archive/$DATE-<name>"
   if (Test-Path $TARGET) { Write-Error "Archive target already exists: $TARGET"; exit 1 }
   Move-Item "openspec/changes/<name>" $TARGET
   ```

   Create the archive directory if it doesn't exist:
   ```bash
   mkdir -p openspec/changes/archive
   ```

   Generate target name using current date: `YYYY-MM-DD-<change-name>`
   ```bash
   DATE="$(date +%F)"
   ```

   **Check if target already exists:**
   - If yes: Fail with error, suggest renaming existing archive or using different date
   - If no: Move the change directory to archive

   ```bash
   TARGET="openspec/changes/archive/${DATE}-<name>"
   if [ -e "$TARGET" ]; then echo "Archive target already exists: $TARGET" >&2; exit 1; fi
   mv "openspec/changes/<name>" "$TARGET"
   ```

6. **Display summary**

   Show archive completion summary including:
   - Change name
   - Schema that was used
   - Archive location
   - Whether specs were synced (if applicable)
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")

All artifacts complete. All tasks complete.
```

**Guardrails**
- Always prompt for change selection if not provided
- Use artifact graph (openspec status --json) for completion checking
- Don't block archive on warnings - just inform and confirm
- Preserve .openspec.yaml when moving to archive (it moves with the directory)
- Show clear summary of what happened
- If sync is requested, use openspec-sync-specs approach (agent-driven)
- If delta specs exist, always run the sync assessment and show the combined summary before prompting
