import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatOpenAI } from '../src/agent/openai'
import type { AgentCallbacks, Msg, ProviderConfig } from '../src/agent/types'

function callbacks(): AgentCallbacks {
  return {
    onMessage: vi.fn(),
    onToken: vi.fn(),
    onToolCall: vi.fn(),
    onError: vi.fn(),
  }
}

function mockOpenAiRequests(): Array<Record<string, unknown>> {
  const requests: Array<Record<string, unknown>> = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }))
  return requests
}

async function captureReasoningEffort(model: string, reasoningEffort: ProviderConfig['reasoningEffort']): Promise<unknown> {
  const requests = mockOpenAiRequests()
  const cb = callbacks()
  const messages: Msg[] = [{ role: 'user', content: 'hi' }]

  await chatOpenAI(messages, {
    provider: 'openai',
    model,
    apiKey: 'test-key',
    baseUrl: 'https://openai.test/v1',
    reasoningEffort,
    maxToolLoops: 1,
  }, cb)

  expect(cb.onError).not.toHaveBeenCalled()
  expect(requests).toHaveLength(1)
  return requests[0]?.reasoning_effort
}

describe('OpenAI reasoning effort payloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['gpt-5', 'minimal', 'minimal'],
    ['gpt-5.5', 'minimal', 'minimal'],
    ['gpt-5.1', 'minimal', 'low'],
    ['gpt-5.1', 'none', 'none'],
    ['gpt-5-pro', 'xhigh', 'high'],
    ['gpt-4.1', 'high', undefined],
  ] as const)('normalizes %s %s to %s', async (model, effort, expected) => {
    await expect(captureReasoningEffort(model, effort)).resolves.toBe(expected)
  })
})
