import {
  ACTIVE_DRAFT_DAYS,
  type ActiveDraft,
  type ActiveDrafts,
  type SnapshotReviews,
} from '@wordwright/core'
import type { Store } from '../db/store'

const DAY_MS = 24 * 60 * 60 * 1000

const hasUnresolved = (d: Pick<ActiveDraft, 'review'>) => (d.review?.unresolved ?? 0) > 0

/** How all of a draft's review requests stand together; null if none was ever sent. */
function totals(snapshots: readonly SnapshotReviews[]): ActiveDraft['review'] {
  if (!snapshots.length) return null
  return {
    asked: snapshots.reduce((n, s) => n + s.open + s.ended + s.pending, 0),
    ended: snapshots.reduce((n, s) => n + s.ended, 0),
    unresolved: snapshots.reduce((n, s) => n + s.unresolved, 0),
  }
}

/**
 * The drafts `userId` edits that are worth carrying on with (Keep writing, #310): saved in the last
 * `ACTIVE_DRAFT_DAYS` days, or with a review still in progress, or with comments the editor hasn't answered. Drafts
 * with unanswered comments come first, then the rest by last save. Read when a page is opened; nothing is sent.
 */
export function activeDrafts(
  store: Store,
  userId: string,
  options: { publicationId?: string; ideaId?: string; limit: number; now: Date },
): ActiveDrafts {
  const cutoff = options.now.getTime() - ACTIVE_DRAFT_DAYS * DAY_MS
  const active = store.drafts
    .editedWithin(userId, options)
    .map((d) => {
      const snapshots = store.reviews.snapshotSummaries(d.id, options.now)
      return {
        draft: { ...d, review: totals(snapshots) },
        inProgress: snapshots.some((s) => s.open + s.pending > 0),
      }
    })
    .filter(
      ({ draft, inProgress }) =>
        new Date(draft.updatedAt).getTime() >= cutoff || inProgress || hasUnresolved(draft),
    )
    .map(({ draft }) => draft)
  // A stable sort keeps the newest-first order from the store within each group.
  const ordered = [...active.filter(hasUnresolved), ...active.filter((d) => !hasUnresolved(d))]
  return { drafts: ordered.slice(0, options.limit), hasMore: ordered.length > options.limit }
}
