import {
  WHOLE_DRAFT,
  excerptOf,
  splitBlocks,
  type CommentEdit,
  type CommentInput,
  type Draft,
  type DraftComment,
} from '@wordwright/core'
import type { Store } from '../db/store'
import { fail, notFound } from '../errors'

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
      blockText: block?.text ?? null,
      // Only words that are really in the paragraph can be underlined later, so anything else is dropped.
      quote: block && input.quote && block.text.includes(input.quote) ? input.quote : null,
      text: input.text,
    },
    review?.id ?? null,
  )
}

/**
 * The comment this person may reword or delete: their own, written by a person, and not yet resolved. A reviewer's
 * lives in their review, so the review must be the one passed and still open. Anything else is "not found" or
 * refused, so the editor cannot touch another person's comment (they resolve it instead), nor the AI's.
 */
function ownComment(
  store: Store,
  draft: Draft,
  userId: string,
  commentId: string,
  reviewId: string | null,
): DraftComment {
  const found = store.comments.get(draft.id, commentId)
  // Someone else's comment is not found rather than refused, so its existence is not given away.
  if (!found || found.byAi || found.authorId !== userId || found.reviewId !== reviewId) {
    throw notFound()
  }
  if (found.resolved) {
    throw fail(409, 'This comment has been resolved, so it can’t be changed.')
  }
  return found
}

export function editComment(
  store: Store,
  draft: Draft,
  userId: string,
  commentId: string,
  edit: CommentEdit,
  reviewId: string | null = null,
): DraftComment {
  ownComment(store, draft, userId, commentId, reviewId)
  store.comments.setText(draft.id, commentId, edit.text)
  return store.comments.get(draft.id, commentId)!
}

/** Permanent. A used critique is not given back: the AI's reading was already done. */
export function deleteComment(
  store: Store,
  draft: Draft,
  userId: string,
  commentId: string,
  reviewId: string | null = null,
): void {
  ownComment(store, draft, userId, commentId, reviewId)
  store.comments.remove(draft.id, commentId)
}
