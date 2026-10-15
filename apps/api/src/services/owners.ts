import type { PublicationRole } from '@lfwa/core'
import type { Store } from '../db/store'
import { fail } from '../errors'

export const NEEDS_ANOTHER_OWNER = 'Make someone else an owner first, or delete the publication.'

const ownersOf = (store: Store, publicationId: string) =>
  store.publications.members(publicationId).filter((m) => m.role === 'owner')

/** What to tell an owner who tries to leave: stepping down comes first, and the only owner needs a successor. */
export function ownerCannotLeaveMessage(store: Store, publicationId: string, userId: string) {
  return ownersOf(store, publicationId).some((m) => m.userId !== userId)
    ? 'Step down as owner first, then you can leave.'
    : `You are the only owner. ${NEEDS_ANOTHER_OWNER}`
}

/**
 * Owners make members owners and owners members (CONTEXT.md, "Owner"). A publication always keeps at least one owner:
 * the count is checked inside the same transaction as the change, so two owners removing each other at once
 * can't leave none (the second is refused). Draft editors are separate and don't change.
 */
export function setMemberRole(
  store: Store,
  publicationId: string,
  actorId: string,
  targetId: string,
  role: PublicationRole,
) {
  store.transaction(() => {
    // Re-checked here, not only by the route, because a concurrent change may have just removed the actor's role.
    if (store.publications.roleOf(publicationId, actorId) !== 'owner') throw fail(403, 'Owner only')
    const current = store.publications.roleOf(publicationId, targetId)
    if (!current) throw fail(404, 'Not found')
    if (current === role) return
    if (role === 'member') {
      if (ownersOf(store, publicationId).length <= 1) {
        throw fail(409, `There must be at least one owner. ${NEEDS_ANOTHER_OWNER}`)
      }
    }
    store.publications.setRole(publicationId, targetId, role)
  })
}

/** True when `userId` is the only owner of a publication that other people also belong to. */
export function isSoleOwnerOfSharedPublication(
  store: Store,
  publicationId: string,
  userId: string,
) {
  const members = store.publications.members(publicationId)
  return (
    members.length > 1 &&
    members.some((m) => m.userId === userId && m.role === 'owner') &&
    ownersOf(store, publicationId).length === 1
  )
}
