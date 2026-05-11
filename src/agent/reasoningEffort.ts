export const CODEX_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type CodexCliReasoningEffort = typeof CODEX_REASONING_EFFORTS[number]
// Shared effort aliases for provider UI/code; CODEX_* names stay for IPC/backcompat.
export const REASONING_EFFORT_LEVELS = CODEX_REASONING_EFFORTS
export type ReasoningEffort = CodexCliReasoningEffort
