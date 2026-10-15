import { handDraftsToOwner } from './draft-editor'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'

/**
 * Removes a user and everything that belongs only to them: credentials, identities, sessions, tokens,
 * memberships, and every publication (with its drafts) where they are the sole member. In shared publications
 * they're removed and drafts they wrote there stay. If they were the only owner, the longest-standing member becomes
 * owner here, because the one caller that can reach this (the cleanup of never-confirmed accounts) has no one to ask,
 * and such an account can't have invited anyone. "Delete my account" refuses that case first (`AccountService.deleteAccount`). Invitations other people sent to their address go too.
 *
 * With `keepName` their display name stays on their notes, messages and the like in publications that continue (#153);
 * without it no trace of the name is left.
 *
 * Must be called inside `store.transaction`. Shared by "delete my account" and the cleanup of
 * never-confirmed accounts, so the two can never disagree about what deletion means.
 */
export function removeUserAndOwnedData(
  store: Store,
  user: UserRecord,
  { keepName = false }: { keepName?: boolean } = {},
) {
  for (const publicationId of store.publications.listIdsForUser(user.id)) {
    const others = store.publications.members(publicationId).filter((m) => m.userId !== user.id)
    if (others.length === 0) {
      store.publications.delete(publicationId)
    } else if (store.publications.roleOf(publicationId, user.id) === 'owner') {
      if (!others.some((m) => m.role === 'owner')) {
        store.publications.setRole(publicationId, others[0]!.userId, 'owner')
      }
    }
    if (others.length > 0) handDraftsToOwner(store, publicationId, user.id)
  }
  if (keepName) store.users.keepNameOnContributions(user.id, user.name)
  store.invitations.deleteForEmail(user.email)
  store.reviews.deleteForEmail(user.email)
  store.users.delete(user.id) // cascades: credential, identities, sessions, resets, memberships
}
