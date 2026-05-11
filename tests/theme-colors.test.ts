import { describe, expect, it } from 'vitest'
import { darkTheme } from '../src/theme/colors'

const AA_NORMAL_TEXT = 4.5
const AAA_NORMAL_TEXT = 7

function relativeLuminance(hex: string): number {
  const parts = hex.slice(1).match(/../g)
  if (!parts || parts.length !== 3) throw new Error(`Invalid hex color: ${hex}`)
  const channels = parts.map((part) => parseInt(part, 16) / 255)
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const r = linear[0] ?? 0
  const g = linear[1] ?? 0
  const b = linear[2] ?? 0
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
}

function assertTokenContrast(token: keyof typeof darkTheme, minRatio: number, level: string): void {
  expect(token in darkTheme, `${token} not found in darkTheme`).toBe(true)
  expect(
    contrastRatio(darkTheme[token], darkTheme.background),
    `${token} should meet WCAG ${level}`,
  ).toBeGreaterThanOrEqual(minRatio)
}

describe('theme color contrast', () => {
  it('keeps text tokens readable on the dark app background', () => {
    const aaaTokens = ['text', 'textStrong', 'textMetaAccent', 'textSoft'] as const
    const aaOnlyTokens = ['textMuted'] as const
    const aaTokens = [...aaaTokens, ...aaOnlyTokens] as const

    for (const token of aaTokens) assertTokenContrast(token, AA_NORMAL_TEXT, 'AA')
    for (const token of aaaTokens) assertTokenContrast(token, AAA_NORMAL_TEXT, 'AAA')
  })
})
