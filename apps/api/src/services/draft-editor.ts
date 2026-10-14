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
 * Hands the drafts a leaving member edits to the profile's longest-standing owner, so every draft keeps an editor.
 * Call while the member is still listed or just after: they are skipped either way.
 */
export function handDraftsToOwner(store: Store, profileId: string, leavingUserId: string) {
  const others = store.profiles.members(profileId).filter((m) => m.userId !== leavingUserId)
  const next = others.find((m) => m.role === 'owner') ?? others[0]
  if (next) store.drafts.reassignEditor(profileId, leavingUserId, next.userId)
}
