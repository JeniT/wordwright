import type { PublicationAttention } from '@wordwright/core'
import type { Store } from '../db/store'

/**
 * What is waiting on this person in the publication, once, for its landing page (#159): offers to them and their own
 * open offers. (How the reviews of their drafts stand is Keep writing's: `activeDrafts`, #310.) It is read when the
 * page is opened and nothing more: no emails, no counts elsewhere, nothing that asks to be come back to.
 */
export function publicationAttention(
  store: Store,
  publicationId: string,
  userId: string,
): PublicationAttention {
  return {
    offered: store.handovers
      .openOffers(publicationId, userId, 'to')
      .map((o) => ({ draftId: o.draftId, title: o.title, fromName: o.otherName })),
    waiting: store.handovers
      .openOffers(publicationId, userId, 'by')
      .map((o) => ({ draftId: o.draftId, title: o.title, toName: o.otherName })),
  }
}
