import type { DraftReviewTotals, SnapshotReviews } from '@wordwright/core'

/** "20 Oct 2026, 14:32": when a review request was sent, which is its title until the editor names it. */
export const reviewDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Its name, or the date and time it was sent. */
export const reviewTitle = (r: SnapshotReviews) => r.name ?? reviewDateTime(r.sentAt)

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "2 of 5 reviews complete", or "All reviews closed" when nobody is left to wait for. Closed ones don't count. */
const progress = (ended: number, asked: number) =>
  asked ? `${ended} of ${asked} reviews complete` : 'All reviews closed'

/**
 * How a review request stands: "1 of 2 reviews complete · 3 comments". The first number is who has finished, of those
 * reading, finished or yet to answer the invitation.
 */
export function reviewSummary(r: SnapshotReviews) {
  return `${progress(r.ended, r.open + r.ended + r.pending)} · ${plural(r.comments, 'comment', 'comments')}`
}

/**
 * How all of a draft's review requests stand together, for its row in Keep writing: "2 of 5 reviews complete ·
 * 4 unresolved comments". Nothing for a draft that was never sent for review.
 */
export function draftReviewSummary(totals: DraftReviewTotals | null) {
  if (!totals) return ''
  const unresolved = totals.unresolved
    ? plural(totals.unresolved, 'unresolved comment', 'unresolved comments')
    : 'No unresolved comments'
  return `${progress(totals.ended, totals.asked)} · ${unresolved}`
}
