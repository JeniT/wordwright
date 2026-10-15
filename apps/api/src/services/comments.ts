import {
  WHOLE_DRAFT,
  excerptOf,
  splitBlocks,
  type CommentInput,
  type Draft,
  type DraftComment,
} from '@wordwright/core'
import type { Store } from '../db/store'
import { fail } from '../errors'

/**
 * The comments this person may see on the draft: the editor sees every one, resolved or not; everyone else sees only
 * their own that are still open (independent review, see CONTEXT.md). Every route that returns comments, or counts
 * them, goes through here.
 */
export function visibleComments(store: Store, draft: Draft, userId: string): DraftComment[] {
  const all = store.comments.all(draft.id)
  if (draft.editorId === userId) return all
  // A review's comments are about its snapshot and belong to that review, not to the live draft's list.
  return all.filter((c) => c.authorId === userId && !c.resolved && c.reviewId === null)
}

/** Adds a member's comment about a paragraph of the draft as it is saved now, or about all of it. */
export function addComment(
  store: Store,
  draft: Draft,
  userId: string,
  input: CommentInput,
  /** For a reviewer: the review, and the snapshot's words their paragraph is found in (not the live draft's). */
  review?: { id: string; body: string },
): DraftComment {
  const whole = input.block === WHOLE_DRAFT
  const block = whole
    ? undefined
    : splitBlocks(review?.body ?? draft.body).find((b) => b.id === input.block)
  if (!whole && !block) {
    throw fail(
      400,
      "That paragraph isn't in the draft any more. Reload the page to see the latest version, then comment again.",
    )
  }
  return store.comments.add(
    draft.id,
    userId,
    {
      block: block?.id ?? WHOLE_DRAFT,
      hash: block?.hash ?? null,
      excerpt: block ? excerptOf(block.text) : '',
      text: input.text,
    },
    review?.id ?? null,
  )
}
