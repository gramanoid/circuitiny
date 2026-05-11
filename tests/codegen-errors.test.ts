import { describe, expect, it } from 'vitest'
import { CatalogTrustError, DraftCatalogPartError } from '../src/codegen/trust'
import {
  DRAFT_PARTS_RE,
  INCOMPATIBLE_PIN_RE,
  IR_FAILURE_RE,
  MISSING_WIRING_RE,
  beginnerCodegenError,
} from '../src/codegen/errors'

describe('beginner code generation errors', () => {
  it('passes through reviewed draft catalog part blockers', () => {
    const error = new DraftCatalogPartError(['sensor1 (draft-sensor)'])

    expect(beginnerCodegenError(error)).toBe(error.message)
  })

  it('passes through catalog trust errors unchanged', () => {
    const error = new CatalogTrustError(['draft-sensor'], ['missing-sensor'])

    expect(beginnerCodegenError(error)).toBe(error.message)
  })

  it('maps wiring-resolution failures to a beginner wiring instruction', () => {
    expect(beginnerCodegenError(new Error('missing wiring for led1.anode'))).toContain('needs clearer wiring')
    expect(beginnerCodegenError(new Error('unresolved pin board.gpio99'))).toContain('needs clearer wiring')
    expect(beginnerCodegenError(new Error('unresolved behavior target led1.out'))).toContain('needs clearer wiring')
    expect(beginnerCodegenError(new Error('// skip set_output: unresolved button.out'))).toContain('needs clearer wiring')
    expect(beginnerCodegenError(new Error('skip set_output internal branch'))).toContain('blocked by the current project')
  })

  it('maps pin compatibility failures to a part-pin review instruction', () => {
    expect(beginnerCodegenError(new Error('invalid pin type for led1.anode'))).toContain('incompatible pin type')
    expect(beginnerCodegenError(new Error('type mismatch on board GPIO assignment'))).toContain('incompatible pin type')
    expect(beginnerCodegenError(new Error('pin type cannot drive that output'))).toContain('incompatible pin type')
  })

  it('maps IR build failures to the DRC-first recovery path', () => {
    expect(beginnerCodegenError(new Error('buildIr failed for project'))).toContain('could not resolve')
    expect(beginnerCodegenError(new Error('intermediate representation missing net'))).toContain('could not resolve')
    expect(beginnerCodegenError(new Error('IR generation failed'))).toContain('could not resolve')
  })

  it('keeps an actionable fallback for unknown failures', () => {
    expect(beginnerCodegenError(new Error('unexpected codegen state'))).toContain('blocked by the current project')
    expect(beginnerCodegenError(new Error(''))).toContain('blocked by the current project')
  })

  it('handles non-Error thrown values gracefully', () => {
    expect(beginnerCodegenError('string error')).toContain('blocked by the current project')
    expect(beginnerCodegenError(null)).toContain('blocked by the current project')
    expect(beginnerCodegenError(undefined)).toContain('blocked by the current project')
  })

  it('keeps codegen error classifiers focused on intended failure routes', () => {
    expect(DRAFT_PARTS_RE.test('review draft catalog parts: sensor1')).toBe(true)
    expect(DRAFT_PARTS_RE.test('review approved catalog metadata')).toBe(false)

    expect(MISSING_WIRING_RE.test('missing wiring for led1.anode')).toBe(true)
    expect(MISSING_WIRING_RE.test('skip set_output: unresolved led1.anode')).toBe(true)
    expect(MISSING_WIRING_RE.test('skip toggle: unresolved led1.anode')).toBe(true)
    expect(MISSING_WIRING_RE.test('target found and wired')).toBe(false)

    expect(INCOMPATIBLE_PIN_RE.test('type mismatch on board GPIO assignment')).toBe(true)
    expect(INCOMPATIBLE_PIN_RE.test('invalid pin type for led1.anode')).toBe(true)
    expect(INCOMPATIBLE_PIN_RE.test('mismatched types in user documentation')).toBe(false)

    expect(IR_FAILURE_RE.test('IR build error')).toBe(true)
    expect(IR_FAILURE_RE.test('intermediate representation missing net')).toBe(true)
    expect(IR_FAILURE_RE.test('first build is ready')).toBe(false)
  })
})
