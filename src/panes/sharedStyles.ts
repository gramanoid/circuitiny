import type { CSSProperties } from 'react'

export const ERROR_PANEL_STYLE: CSSProperties = {
  padding: 12,
  color: 'var(--color-error-text, #ffd6d1)',
  background: 'var(--color-error-bg, #140909)',
  height: '100%',
  boxSizing: 'border-box',
}

export const RECOVERY_PANEL_STYLE: CSSProperties = {
  margin: 8,
  padding: 8,
  border: '1px solid var(--color-recovery-border, #4a3320)',
  borderRadius: 4,
  boxSizing: 'border-box',
  background: 'var(--color-recovery-bg, #17110b)',
  color: 'var(--color-recovery-text, #f0c27a)',
  whiteSpace: 'normal',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  lineHeight: 1.4,
}
