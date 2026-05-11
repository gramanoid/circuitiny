import { describe, expect, it } from 'vitest'
import { anthropicThinkingPatternsForTest, parseAnthropicThinkingSupport } from '../src/agent/anthropic'

describe('Anthropic model thinking support detection', () => {
  it.each([
    ['claude-3-7-sonnet-20250219', 'legacy'],
    ['claude-sonnet-3-7', 'legacy'],
    ['claude-sonnet-4-20250514', 'legacy'],
    ['claude-opus-4-1-20250805', 'legacy'],
    ['claude-4-1-opus-20250805', 'legacy'],
    ['claude-haiku-4-5', 'legacy'],
    ['claude-sonnet-4-6', 'adaptive'],
    ['claude-4-6-sonnet', 'adaptive'],
    ['claude-opus-4-7', 'adaptive'],
    ['claude-opus-4-7-20270101', 'adaptive'],
    ['claude-sonnet-4-6-research', 'adaptive'],
    ['claude-haiku-5-0-20261201', 'adaptive'],
    ['claude-haiku-preview', 'adaptive'],
    ['claude-3-5-haiku-20241022', 'none'],
    ['claude-mythos-preview', 'none'],
    ['Claude Sonnet 4.1 20250805', 'none'],
    ['claude_opus_4_20250514', 'none'],
    ['claude-2-1', 'none'],
    ['sonnet-4-without-family-prefix', 'none'],
  ] as const)('classifies %s as %s', (model, support) => {
    expect(parseAnthropicThinkingSupport(model)).toBe(support)
  })

  it('keeps regex pattern boundaries explicit for valid and invalid naming variants', () => {
    expect(anthropicThinkingPatternsForTest.claude37Sonnet.test('claude-3-7-sonnet-20250219')).toBe(true)
    expect(anthropicThinkingPatternsForTest.claude37Sonnet.test('claude-sonnet-3-7-latest')).toBe(true)
    expect(anthropicThinkingPatternsForTest.claude4Thinking.test('claude-sonnet-4-5-20251001')).toBe(true)
    expect(anthropicThinkingPatternsForTest.claude4Thinking.test('claude-4-1-opus-research')).toBe(true)
    expect(anthropicThinkingPatternsForTest.claudeAdaptiveThinking.test('claude-haiku-5-0-20261201')).toBe(true)
    expect(anthropicThinkingPatternsForTest.claudeAdaptiveThinking.test('claude-4-6-sonnet-preview')).toBe(true)
    expect(anthropicThinkingPatternsForTest.claudePreviewThinking.test('claude-haiku-preview')).toBe(true)
    expect(anthropicThinkingPatternsForTest.claudePreviewThinking.test('claude-opus-research-20261201')).toBe(true)

    const invalidModels = [
      'claude--4',
      'claude-4--sonnet',
      'claude-sonnet-4-123',
      'sonnet-4',
      'claude-mythos-preview',
      'claude_opus_4_20250514',
    ]
    for (const model of invalidModels) {
      expect(anthropicThinkingPatternsForTest.claude37Sonnet.test(model)).toBe(false)
      expect(anthropicThinkingPatternsForTest.claude4Thinking.test(model)).toBe(false)
      expect(anthropicThinkingPatternsForTest.claudeAdaptiveThinking.test(model)).toBe(false)
      expect(anthropicThinkingPatternsForTest.claudePreviewThinking.test(model)).toBe(false)
      expect(parseAnthropicThinkingSupport(model)).toBe('none')
    }
  })

  it.each([
    ['claude37Sonnet', 'claude-sonnet-3-7-latest', 'legacy'],
    ['claude4Thinking', 'claude-haiku-4-5-20251001', 'legacy'],
    ['claudeAdaptiveThinking', 'claude-opus-4-7-20270101', 'adaptive'],
    ['claudePreviewThinking', 'claude-opus-research-20261201', 'adaptive'],
  ] as const)('keeps exported %s pattern covered by parse support', (patternName, model, support) => {
    expect(anthropicThinkingPatternsForTest[patternName].test(model)).toBe(true)
    expect(parseAnthropicThinkingSupport(model)).toBe(support)
  })
})
