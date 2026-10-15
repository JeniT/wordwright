import { Hono } from 'hono'
import {
  CommentInputSchema,
  CommentResolveSchema,
  DraftInsertionInputSchema,
  OptionUseInputSchema,
  REPHRASE,
  countWords,
  DraftSaveSchema,
  HandoverTargetSchema,
  SendForReviewInputSchema,
} from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { addComment, visibleComments } from '../services/comments'
import { critiqueState } from '../services/critique'
import { requireEditor } from '../services/draft-editor'
import type { HandoverService } from '../services/handover'
import type { RateLimiter } from '../auth/rate-limit'
import type { ReviewService } from '../services/reviews'
import { validateJson } from '../validate'
import { fail, notFound } from '../errors'
import { param } from './params'

/**
 * Mounted under `/publications/:publicationId`, after membership has been checked. Drafts are created and
 * listed through their idea (`/ideas/:id/drafts`); these routes open, save and delete one by id.
 */
export function draftRoutes(
  store: Store,
  handover: HandoverService,
  reviews: ReviewService,
  inviteLimiter: RateLimiter,
) {
  const { drafts, notes, ideas, comments } = store
  /** The draft a route is about, or a 404. */
  const draftOf = (c: Parameters<typeof param>[0]) => {
    const draft = drafts.get(param(c, 'publicationId'), param(c, 'id'))
    if (!draft) throw notFound()
    return draft
  }
  return (
    new Hono<AppEnv>()
      .get('/:id', (c) => {
        const draft = drafts.get(param(c, 'publicationId'), param(c, 'id'))
        return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
      })
      // Only the editor saves, and only from the version they last saw: a stale save is refused (409), never merged.
      .put('/:id', validateJson(DraftSaveSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        const current = drafts.get(publicationId, param(c, 'id'))
        if (!current) return c.json({ error: 'Not found' }, 404)
        requireEditor(current, c.get('user').id)
        const { version, ...input } = c.req.valid('json')
        const saved = drafts.update(publicationId, current.id, input, version)
        if (!saved) {
          throw fail(
            409,
            'This draft has been saved somewhere else since you opened it. Reload the page to see the latest version.',
          )
        }
        return c.json(saved)
      })
      // The latest critique's summary with how many looks are used. It is the editor's alone: for everyone else it says
      // nothing, not even how many looks have been spent (independent review).
      .get('/:id/critique', (c) => {
        const draft = draftOf(c)
        const state = critiqueState(store, draft.id, c.get('user').id)
        return c.json(
          draft.editorId === c.get('user').id ? state : { ...state, round: null, used: 0 },
        )
      })
      // Comments on the draft, from members and the AI, as this person may see them (see `visibleComments`).
      .get('/:id/comments', (c) => {
        const draft = draftOf(c)
        return c.json(visibleComments(store, draft, c.get('user').id))
      })
      // Any member may comment on any draft, however they are not its editor.
      .post('/:id/comments', validateJson(CommentInputSchema), (c) => {
        const draft = draftOf(c)
        return c.json(addComment(store, draft, c.get('user').id, c.req.valid('json')), 201)
      })
      // Only the editor resolves a comment, and it answers with the comments as the editor now sees them.
      .put('/:id/comments/:commentId', validateJson(CommentResolveSchema), (c) => {
        const draft = draftOf(c)
        requireEditor(draft, c.get('user').id)
        if (!comments.setResolved(draft.id, param(c, 'commentId'), c.req.valid('json').resolved)) {
          throw notFound()
        }
        return c.json(visibleComments(store, draft, c.get('user').id))
      })
      // Words pulled into the draft from the idea's notes, and where they came from.
      .get('/:id/insertions', (c) => {
        const draft = drafts.get(param(c, 'publicationId'), param(c, 'id'))
        return draft ? c.json(drafts.insertions(draft.id)) : c.json({ error: 'Not found' }, 404)
      })
      .post('/:id/insertions', validateJson(DraftInsertionInputSchema), (c) => {
        const draft = drafts.get(param(c, 'publicationId'), param(c, 'id'))
        if (!draft) return c.json({ error: 'Not found' }, 404)
        requireEditor(draft, c.get('user').id)
        const { noteId, text } = c.req.valid('json')
        // The origin and source come from the note, never from the request, so they can't be claimed falsely.
        const note = draft.ideaId ? notes.get(draft.ideaId, noteId) : undefined
        if (!note) {
          throw fail(400, "That note isn't on this draft's idea.")
        }
        // A quotation goes into a draft only as a blockquote, so it can't pass for the writer's own words.
        if (note.quote && text.split('\n').some((line) => line.trim() && !line.startsWith('>'))) {
          throw fail(
            400,
            'A quotation has to go into the draft as a quotation (every line starting with >).',
          )
        }
        const idea = ideas.get(draft.publicationId, draft.ideaId!)
        const item = idea?.links.find((l) => l.id === note.readingItemId)
        const inserted = store.transaction(() => {
          const id = drafts.addInsertion(draft.id, {
            noteId: note.id,
            noteAuthorId: note.authorId,
            insertedBy: c.get('user').id,
            text,
            origin: note.origin,
            source: item
              ? { title: item.title || item.url, url: item.url, authors: item.authors }
              : null,
          })
          notes.setAdded(draft.ideaId!, note.id, true)
          ideas.touch(draft.ideaId!)
          return id
        })
        return c.json(
          drafts.insertions(draft.id).find((i) => i.id === inserted),
          201,
        )
      })
      // The writer used an option from a Rephrase window: record that these words began as an AI option.
      .post('/:id/option-insertions', validateJson(OptionUseInputSchema), (c) => {
        const draft = drafts.get(param(c, 'publicationId'), param(c, 'id'))
        if (!draft) return c.json({ error: 'Not found' }, 404)
        requireEditor(draft, c.get('user').id)
        const use = c.req.valid('json')
        if (countWords(use.aim) < REPHRASE.aimMinWords) {
          throw fail(400, 'Say in a few words what you wanted this to do.')
        }
        const id = drafts.addOptionInsertion(draft.id, c.get('user').id, use)
        return c.json(
          drafts.insertions(draft.id).find((i) => i.id === id),
          201,
        )
      })
      // Moving the editor role: offer, accept, decline, withdraw, ask, reassign. Each answers with the new state.
      .get('/:id/handover', (c) => c.json(handover.state(draftOf(c))))
      .post('/:id/handover/offer', validateJson(HandoverTargetSchema), (c) =>
        c.json(handover.offer(draftOf(c), c.get('user'), c.req.valid('json').userId)),
      )
      .delete('/:id/handover/offer', (c) => c.json(handover.withdraw(draftOf(c), c.get('user'))))
      .post('/:id/handover/offer/accept', (c) => c.json(handover.accept(draftOf(c), c.get('user'))))
      .post('/:id/handover/offer/decline', (c) =>
        c.json(handover.decline(draftOf(c), c.get('user'))),
      )
      .post('/:id/handover/asks', (c) => c.json(handover.ask(draftOf(c), c.get('user'))))
      .delete('/:id/handover/asks/:askId', (c) =>
        c.json(handover.closeAsk(draftOf(c), c.get('user'), param(c, 'askId'))),
      )
      .post('/:id/handover/reassign', validateJson(HandoverTargetSchema), (c) =>
        c.json(handover.reassign(draftOf(c), c.get('user'), c.req.valid('json').userId)),
      )
      // Sending the draft for review: a snapshot is frozen and people are asked to review it (the editor only).
      .get('/:id/reviewers', (c) => c.json(reviews.reviewers(draftOf(c), c.get('user').id)))
      .post('/:id/send-for-review', validateJson(SendForReviewInputSchema), (c) => {
        // Each email goes to a stranger from our server, so one person's are capped, like publication invitations.
        const input = c.req.valid('json')
        for (let n = 0; n < input.emails.length; n++) {
          if (!inviteLimiter.allow(c.get('user').id)) {
            throw fail(429, 'You have sent a lot of invitations. Try again later.')
          }
        }
        reviews.send(c.get('user'), draftOf(c), input)
        // The same answer whatever happened, so it reveals nothing about who has an account or has blocked us.
        return c.json({ ok: true }, 202)
      })
      .post('/:id/reviewers/close', (c) =>
        c.json({ closed: reviews.closeAll(draftOf(c), c.get('user').id) }),
      )
      .delete('/:id/reviewers/invitations/:invitationId', (c) => {
        reviews.withdrawInvitation(draftOf(c), c.get('user').id, param(c, 'invitationId'))
        return c.body(null, 204)
      })
      .delete('/:id/reviewers/:reviewId', (c) => {
        reviews.close(draftOf(c), c.get('user').id, param(c, 'reviewId'))
        return c.body(null, 204)
      })
      .delete('/:id', (c) =>
        drafts.delete(param(c, 'publicationId'), param(c, 'id'))
          ? c.body(null, 204)
          : c.json({ error: 'Not found' }, 404),
      )
  )
}
