import type { PublicationAttention, SnapshotReviews } from '@wordwright/core'
import type { Store } from '../db/store'

/** A snapshot whose reviews are all over, with some finished, and comments still waiting for the editor. */
export const needsAttention = (snapshots: readonly SnapshotReviews[]) =>
  snapshots.some((s) => s.open === 0 && s.ended > 0 && s.unresolved > 0)

/**
 * What is waiting on this person in the publication, once, for its landing page (#159): offers to them, their own open
 * offers, and how the reviews of drafts they edit stand. It is read when the page is opened and nothing more:
 * no emails, no counts elsewhere, nothing that asks to be come back to.
 */
export function publicationAttention(
  store: Store,
  publicationId: string,
  userId: string,
): PublicationAttention {
  const reviews = store.drafts
    .list(publicationId)
    .filter((d) => d.editorId === userId)
    .flatMap((d) => {
      const snapshots = store.reviews.snapshotSummaries(d.id)
      return snapshots.length
        ? [{ draftId: d.id, title: d.title, snapshots, needsAttention: needsAttention(snapshots) }]
        : []
    })
  return {
    offered: store.handovers
      .openOffers(publicationId, userId, 'to')
      .map((o) => ({ draftId: o.draftId, title: o.title, fromName: o.otherName })),
    waiting: store.handovers
      .openOffers(publicationId, userId, 'by')
      .map((o) => ({ draftId: o.draftId, title: o.title, toName: o.otherName })),
    reviews,
  }
}
