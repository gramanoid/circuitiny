import { describe, expect, it } from 'vitest'
import { validateSafetyReviewMetadata } from '../src/parts/types'

describe('part safety review metadata', () => {
  it('requires approved and rejected reviews to have valid ISO timestamps', () => {
    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: 'alex',
      review_timestamp: '2026-05-09T00:00:00.000Z',
    }).valid).toBe(true)

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: 'alex',
      review_timestamp: '2026-05-09T00:00:00.000+00:00',
    }).valid).toBe(true)

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: 'alex',
      review_timestamp: '2026-05-09T00:00:00.123456Z',
    }).valid).toBe(true)

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'rejected',
      reviewer_id: 'alex',
      review_timestamp: '2026-05-09T00:00:00Z',
    }).valid).toBe(true)

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: 'alex',
      review_timestamp: 'not a date',
    }).valid).toBe(false)

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: 'alex',
      review_timestamp: ' 2026-05-09T00:00:00.000Z ',
    }).errors).toContain('approved/rejected requires valid ISO review_timestamp.')

    // validateSafetyReviewMetadata requires UTC (+00:00/Z) timestamps.
    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: 'alex',
      review_timestamp: '2026-05-09T00:00:00+05:00',
    }).errors).toContain('approved/rejected requires valid ISO review_timestamp.')

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'rejected',
      reviewer_id: '',
      review_timestamp: '2026-05-09T00:00:00.000Z',
    }).errors).toContain('approved/rejected requires reviewer_id.')

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      review_timestamp: '2026-05-09T00:00:00.000Z',
    }).errors).toContain('approved/rejected requires reviewer_id.')

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'rejected',
      review_timestamp: '2026-05-09T00:00:00.000Z',
    }).errors).toContain('approved/rejected requires reviewer_id.')

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: '   ',
      review_timestamp: '2026-05-09T00:00:00.000Z',
    }).errors).toContain('approved/rejected requires reviewer_id.')

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'approved',
      reviewer_id: 'alex',
    }).errors).toContain('approved/rejected requires valid ISO review_timestamp.')

    expect(validateSafetyReviewMetadata({
      safety_review_status: 'rejected',
      reviewer_id: 'alex',
    }).errors).toContain('approved/rejected requires valid ISO review_timestamp.')
  })

  it('accepts UTC fractional-second timestamps at learner review precision', () => {
    for (const review_timestamp of [
      '2026-05-09T00:00:00.1Z',
      '2026-05-09T00:00:00.12Z',
      '2026-05-09T00:00:00.123456Z',
    ]) {
      expect(validateSafetyReviewMetadata({
        safety_review_status: 'approved',
        reviewer_id: 'alex',
        review_timestamp,
      }).valid).toBe(true)
    }
  })

  it('rejects partial pending or invalid review states', () => {
    expect(validateSafetyReviewMetadata({ safety_review_status: 'pending' }).valid).toBe(true)
    expect(validateSafetyReviewMetadata({}).valid).toBe(true)
    expect(validateSafetyReviewMetadata({ safety_review_status: 'pending', reviewer_id: 'alex' }).valid).toBe(false)
    expect(validateSafetyReviewMetadata({ review_timestamp: 'not a date' }).errors).toContain('pending/undefined must not include review_timestamp.')
    expect(validateSafetyReviewMetadata({ review_timestamp: '2026-05-09T00:00:00.000Z' }).valid).toBe(false)
    const invalidMetadata = { safety_review_status: 'maybe' } as unknown as Parameters<typeof validateSafetyReviewMetadata>[0]
    expect(validateSafetyReviewMetadata(invalidMetadata).valid).toBe(false)
  })
})
