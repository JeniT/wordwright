import type { ProfileAttention, SnapshotReviews } from '@lfwa/core'
import type { Store } from '../db/store'

/** A snapshot whose reviews are all over, with some finished, and comments still waiting for the editor. */
export const needsAttention = (snapshots: readonly SnapshotReviews[]) =>
  snapshots.some((s) => s.open === 0 && s.ended > 0 && s.unresolved > 0)

/**
 * What is waiting on this person in the profile, once, for its landing page (#159): offers to them, their own open
 * offers, and how the reviews of drafts they edit stand. It is read when the page is opened and nothing more:
 * no emails, no counts elsewhere, nothing that asks to be come back to.
 */
export function profileAttention(
  store: Store,
  profileId: string,
  userId: string,
): ProfileAttention {
  const reviews = store.drafts
    .list(profileId)
    .filter((d) => d.editorId === userId)
    .flatMap((d) => {
      const snapshots = store.reviews.snapshotSummaries(d.id)
      return snapshots.length
        ? [{ draftId: d.id, title: d.title, snapshots, needsAttention: needsAttention(snapshots) }]
        : []
    })
  return {
    offered: store.handovers
      .openOffers(profileId, userId, 'to')
      .map((o) => ({ draftId: o.draftId, title: o.title, fromName: o.otherName })),
    waiting: store.handovers
      .openOffers(profileId, userId, 'by')
      .map((o) => ({ draftId: o.draftId, title: o.title, toName: o.otherName })),
    reviews,
  }
}
