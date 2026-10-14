import { splitBlocks, type CommentInput, type Draft, type DraftComment } from '@lfwa/core'
import type { Store } from '../db/store'
import { fail } from '../errors'
import { excerptOf } from './critique'

/**
 * The comments this person may see on the draft: the editor sees every one, resolved or not; everyone else sees only
 * their own that are still open (independent review, see CONTEXT.md). Every route that returns comments, or counts
 * them, goes through here.
 */
export function visibleComments(store: Store, draft: Draft, userId: string): DraftComment[] {
  const all = store.comments.all(draft.id)
  if (draft.editorId === userId) return all
  return all.filter((c) => c.authorId === userId && !c.resolved)
}

/** Adds a member's comment about a paragraph of the draft as it is saved now, or about all of it. */
export function addComment(
  store: Store,
  draft: Draft,
  userId: string,
  input: CommentInput,
): DraftComment {
  if (input.block === 'whole') {
    return store.comments.add(draft.id, userId, {
      block: 'whole',
      hash: null,
      excerpt: '',
      text: input.text,
    })
  }
  const block = splitBlocks(draft.body).find((b) => b.id === input.block)
  if (!block) {
    throw fail(
      400,
      "That paragraph isn't in the draft any more. Reload the page to see the latest version, then comment again.",
    )
  }
  return store.comments.add(draft.id, userId, {
    block: block.id,
    hash: block.hash,
    excerpt: excerptOf(block.text),
    text: input.text,
  })
}
