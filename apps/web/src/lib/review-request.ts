import type { SnapshotReviews } from '@wordwright/core'

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

/**
 * How a review request stands: "1/2 complete · 3 comments". The first number is who has finished, of those reading,
 * finished or yet to answer the invitation; closed ones don't count. Everyone closed reads "All closed".
 */
export function reviewSummary(r: SnapshotReviews) {
  const asked = r.open + r.ended + r.pending
  const comments = `${r.comments} ${r.comments === 1 ? 'comment' : 'comments'}`
  return `${asked ? `${r.ended}/${asked} complete` : 'All closed'} · ${comments}`
}
