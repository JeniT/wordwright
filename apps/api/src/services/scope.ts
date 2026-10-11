import type { Owner } from '../db/owner'
import type { Store } from '../db/store'

/**
 * Whose reading list or notes something is about: an idea's (`ideaId`), or the profile's own (null). Everything
 * that works on either goes through this, so an idea's and a profile's differ only in where they are kept and in
 * how the messages talk about them.
 */
export interface ListScope {
  profileId: string
  ideaId: string | null
}

export const ownerOf = (scope: ListScope): Owner => scope.ideaId ?? { profileId: scope.profileId }

/** "An idea" or "A profile": how a refusal names what is full. */
export const subjectOf = (scope: ListScope) => (scope.ideaId ? 'An idea' : 'A profile')

/** "this idea" or "this profile's reading list". */
export const hereOf = (scope: ListScope) =>
  scope.ideaId ? 'this idea' : 'this profile’s reading list'

/** An idea records when it last changed; a profile has no such date. */
export function touch(store: Store, scope: ListScope) {
  if (scope.ideaId) store.ideas.touch(scope.ideaId)
}
