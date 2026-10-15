import type { Draft } from '@lfwa/core'
import type { Store } from '../db/store'
import { fail } from '../errors'

/** Only a draft's editor may change its words, add notes to it, or ask for a critique (#154). */
export function requireEditor(draft: Draft, userId: string) {
  if (draft.editorId !== userId) {
    throw fail(403, `Only ${draft.editorName} can do that: they are this draft's editor.`)
  }
}

/**
 * Hands the drafts a leaving member edits to the publication's longest-standing owner, so every draft keeps an editor.
 * Call while the member is still listed or just after: they are skipped either way.
 */
export function handDraftsToOwner(store: Store, publicationId: string, leavingUserId: string) {
  const others = store.publications.members(publicationId).filter((m) => m.userId !== leavingUserId)
  const next = others.find((m) => m.role === 'owner') ?? others[0]
  store.handovers.closeForLeaver(publicationId, leavingUserId)
  if (!next) return
  for (const draftId of store.drafts.editedBy(publicationId, leavingUserId)) {
    store.drafts.setEditor(draftId, next.userId)
    store.handovers.addAutomaticReassignment(draftId, next.userId)
  }
}
