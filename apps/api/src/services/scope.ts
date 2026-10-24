import type { Owner } from '../db/owner'
import type { Store } from '../db/store'

/**
 * Whose articles or notes something is about: an idea's (`ideaId`), or the publication's own (null). Everything
 * that works on either goes through this, so an idea's and a publication's differ only in where they are kept and in
 * how the messages talk about them.
 */
export interface ListScope {
  publicationId: string
  ideaId: string | null
}

export const ownerOf = (scope: ListScope): Owner =>
  scope.ideaId ?? { publicationId: scope.publicationId }

/** "An idea" or "A publication": how a refusal names what is full. */
export const subjectOf = (scope: ListScope) => (scope.ideaId ? 'An idea' : 'A publication')

/** "this idea" or "this publication's articles". */
export const hereOf = (scope: ListScope) =>
  scope.ideaId ? 'this idea' : 'this publication’s articles'

/** An idea records when it last changed; a publication has no such date. */
export function touch(store: Store, scope: ListScope) {
  if (scope.ideaId) store.ideas.touch(scope.ideaId)
}
