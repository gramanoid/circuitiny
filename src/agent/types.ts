import type { CodexCliReasoningEffort } from './reasoningEffort'

export type ProviderReasoningEffort = CodexCliReasoningEffort | 'none'

export interface Msg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id?: string; function: { name: string; arguments: any } }>
  tool_name?: string
  tool_call_id?: string
  name?: string
}

export interface AgentCallbacks {
  onMessage: (m: Msg) => void
  onToken: (delta: string) => void
  onToolCall: (name: string, args: any, result: any) => void
  onError: (err: string) => void
}

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'claudecode' | 'codexcli'

export interface ProviderConfig {
  provider: ProviderType
  model: string
  apiKey?: string
  baseUrl?: string   // custom Ollama host or OpenRouter base
  // ProviderReasoningEffort still accepts legacy "minimal" while reading old
  // saved configs, but current UI/processing normalizes it to "low"; persist
  // low/medium/high/xhigh for new settings.
  reasoningEffort?: ProviderReasoningEffort
  // Intentionally snake_case because provider request payloads use max_tokens.
  max_tokens?: number
  maxToolLoops?: number
  expertMode?: boolean
  signal?: AbortSignal
}

export const PROVIDER_DEFAULTS: Record<ProviderType, { label: string; defaultModel: string; baseUrl: string; needsKey: boolean }> = {
  ollama:      { label: 'Ollama (local)',   defaultModel: 'qwen3.5:latest',             baseUrl: 'http://localhost:11434',        needsKey: false },
  openai:      { label: 'OpenAI API',       defaultModel: 'gpt-5.5',                    baseUrl: 'https://api.openai.com/v1',     needsKey: true  },
  anthropic:   { label: 'Anthropic',        defaultModel: 'claude-sonnet-4-6',          baseUrl: 'https://api.anthropic.com',     needsKey: true  },
  openrouter:  { label: 'OpenRouter',       defaultModel: 'anthropic/claude-sonnet-4.6', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true  },
  claudecode:  { label: 'Claude Code (Pro)', defaultModel: 'sonnet',                    baseUrl: '',                              needsKey: false },
  codexcli:    { label: 'Codex CLI (ChatGPT)', defaultModel: 'gpt-5.5',                 baseUrl: '',                              needsKey: false },
}
