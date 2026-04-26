// Per-project chat history persisted in localStorage.
// Key: esp-ai:chat:<projectName>
// Keeps the last MAX_MSGS messages; silently drops oldest on overflow.

import type { Msg } from './types'

const MAX_MSGS = 200

function key(projectName: string) {
  return `esp-ai:chat:${projectName}`
}

export function loadChatHistory(projectName: string): Msg[] {
  try {
    const raw = localStorage.getItem(key(projectName))
    return raw ? (JSON.parse(raw) as Msg[]) : []
  } catch {
    return []
  }
}

export function saveChatHistory(projectName: string, msgs: Msg[]) {
  try {
    localStorage.setItem(key(projectName), JSON.stringify(msgs.slice(-MAX_MSGS)))
  } catch {
    // storage quota exceeded — skip silently
  }
}

export function clearChatHistory(projectName: string) {
  localStorage.removeItem(key(projectName))
}
