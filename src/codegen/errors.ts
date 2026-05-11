import { CatalogTrustError, DraftCatalogPartError } from './trust'

// Classify incoming codegen/internal error strings into beginner-facing routes:
// draft-part blockers, wiring resolution, pin compatibility, and IR build failures.
// Matches trust-gate errors such as "draft catalog parts: sensor1".
export const DRAFT_PARTS_RE = /draft catalog parts/i
// Matches user-visible wiring failures plus generated-code diagnostics like
// "// skip set_output: unresolved led1.anode" shown in the Code pane.
export const MISSING_WIRING_RE = /missing wiring|unresolved pin|unresolved .*target|skip (?:set_output|toggle):\s*unresolved/i
// Matches resolver errors where a selected board/component pin cannot serve the requested role.
export const INCOMPATIBLE_PIN_RE = /type mismatch|invalid pin|pin type/i
// Matches internal IR construction failures before C files can be generated.
export const IR_FAILURE_RE = /\bIR\s*(?:build|generation|output|failure|error)\b|\bintermediate representation\b|\bbuildIr\b/i

export function beginnerCodegenError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof CatalogTrustError) return message
  if (error instanceof DraftCatalogPartError) return message
  // Preserve wrapped/string draft-part errors that cross IPC or test boundaries without the class prototype.
  if (DRAFT_PARTS_RE.test(message)) return message
  if (MISSING_WIRING_RE.test(message)) {
    return 'Code generation needs clearer wiring first. Check that every behavior target is connected to a board pin, then regenerate.'
  }
  if (INCOMPATIBLE_PIN_RE.test(message)) {
    return 'Code generation found an incompatible pin type. Review the selected part pin and board GPIO assignment.'
  }
  if (IR_FAILURE_RE.test(message)) {
    return 'Code generation could not resolve the project into firmware. Run DRC, fix the first wiring issue, then try again.'
  }
  return 'Code generation is blocked by the current project. Review project parts and wiring, then try again.'
}
