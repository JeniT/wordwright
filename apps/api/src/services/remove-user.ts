import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'

/**
 * Removes a user and everything that belongs only to them: credentials, identities, sessions, tokens,
 * memberships, and every profile (with its drafts) where they are the sole member. In shared profiles
 * they're removed and, if they were the owner, the longest-standing member becomes owner; drafts they
 * wrote there stay. Invitations other people sent to their address go too.
 *
 * Must be called inside `store.transaction`. Shared by "delete my account" and the cleanup of
 * never-confirmed accounts, so the two can never disagree about what deletion means.
 */
export function removeUserAndOwnedData(store: Store, user: UserRecord) {
  for (const profileId of store.profiles.listIdsForUser(user.id)) {
    const others = store.profiles.members(profileId).filter((m) => m.userId !== user.id)
    if (others.length === 0) {
      store.profiles.delete(profileId)
    } else if (store.profiles.roleOf(profileId, user.id) === 'owner') {
      if (!others.some((m) => m.role === 'owner')) {
        store.profiles.setRole(profileId, others[0]!.userId, 'owner')
      }
    }
  }
  store.invitations.deleteForEmail(user.email)
  store.users.delete(user.id) // cascades: credential, identities, sessions, resets, memberships
}
