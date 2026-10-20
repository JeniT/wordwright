import { describe, expect, it } from 'vitest'
import { draftReviewSummary, reviewSummary } from './review-request'

const snapshot = (over: object = {}) => ({
  id: 's1',
  sentAt: '2026-02-01T09:30:00Z',
  name: null,
  open: 0,
  ended: 1,
  closed: 0,
  pending: 0,
  comments: 3,
  unresolved: 2,
  ...over,
})

describe('how one review request stands', () => {
  it('counts who has finished of those asked, then the comments', () => {
    expect(reviewSummary(snapshot({ open: 1, ended: 1, pending: 1, comments: 3 }))).toBe(
      '1 of 3 reviews complete · 3 comments',
    )
  })

  it('says all closed when nobody is left to wait for', () => {
    expect(reviewSummary(snapshot({ ended: 0, closed: 2, comments: 1 }))).toBe(
      'All reviews closed · 1 comment',
    )
  })
})

describe('how all the reviews of a draft stand', () => {
  it('says nothing for a draft never sent for review', () => {
    expect(draftReviewSummary(null)).toBe('')
  })

  it('counts finished reviews of those asked, then the unresolved comments', () => {
    expect(draftReviewSummary({ asked: 5, ended: 2, unresolved: 4 })).toBe(
      '2 of 5 reviews complete · 4 unresolved comments',
    )
  })

  it('says so when no comment is left unanswered, and in the singular for one', () => {
    expect(draftReviewSummary({ asked: 2, ended: 2, unresolved: 0 })).toBe(
      '2 of 2 reviews complete · No unresolved comments',
    )
    expect(draftReviewSummary({ asked: 1, ended: 0, unresolved: 1 })).toBe(
      '0 of 1 reviews complete · 1 unresolved comment',
    )
  })

  it('says all closed when nobody is left to wait for', () => {
    expect(draftReviewSummary({ asked: 0, ended: 0, unresolved: 3 })).toBe(
      'All reviews closed · 3 unresolved comments',
    )
  })
})
