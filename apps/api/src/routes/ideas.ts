import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  BulkTagInputSchema,
  AcceptProposalInputSchema,
  ConversationTitleInputSchema,
  ProposalEditInputSchema,
  DraftInputSchema,
  DraftOrderSchema,
  IdeaInputSchema,
  IdeaLinkInputSchema,
  IdeaUpdateSchema,
  markdownToNotes,
  NoteTagsInputSchema,
  ReadingItemReadSchema,
  ResearchInputSchema,
  ResearchItemIdsSchema,
  SendMessageInputSchema,
} from '@wordwright/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { BrainstormService, Turn } from '../services/brainstorm'
import type { IdeaLinkService } from '../services/idea-links'
import type { ResearchService } from '../services/research'
import { NoteEditService } from '../services/note-edits'
import { noteRoutes } from './notes'
import { toLlmHttpError } from './llm'
import { validateJson } from '../validate'
import { fail, notFound } from '../errors'
import { param } from './params'

type Ctx = Context<AppEnv>

/** Mounted under `/publications/:publicationId`, after membership has been checked. */
export function ideaRoutes(
  store: Store,
  links: IdeaLinkService,
  brainstorm: BrainstormService,
  research: ResearchService,
) {
  const { ideas, drafts, notes } = store
  const noteEdits = new NoteEditService(store)
  const publicationOf = (c: Ctx) => param(c, 'publicationId')
  /** The idea named in the URL, or a 404 (also when it belongs to a different publication). */
  const find = (c: Ctx) => {
    const idea = ideas.get(publicationOf(c), param(c, 'id'))
    if (!idea) throw notFound()
    return idea
  }

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(ideas.list(publicationOf(c))))
      .post('/', validateJson(IdeaInputSchema), (c) =>
        c.json(ideas.create(publicationOf(c), c.get('user').id, c.req.valid('json')), 201),
      )
      .get('/:id', (c) => c.json(find(c)))
      .patch('/:id', validateJson(IdeaUpdateSchema), (c) => {
        const idea = find(c)
        const changes = c.req.valid('json')
        // The idea's notes as one text (transitional) would rewrite every note, quotations included.
        if (
          changes.notes !== undefined &&
          notes.list(idea.id).some((n) => n.quote) &&
          JSON.stringify(markdownToNotes(changes.notes)) !==
            JSON.stringify(markdownToNotes(idea.notes))
        ) {
          throw fail(
            409,
            "This idea has quotations, which can't be edited. Change the other notes one at a time in the Notes list.",
          )
        }
        return c.json(ideas.update(idea.publicationId, idea.id, changes))
      })
      .delete('/:id', (c) => {
        const idea = find(c)
        ideas.delete(idea.publicationId, idea.id)
        return c.body(null, 204)
      })

      .post('/:id/links', validateJson(IdeaLinkInputSchema), async (c) => {
        const idea = find(c)
        await links.add(
          { publicationId: idea.publicationId, ideaId: idea.id },
          c.get('user').id,
          c.req.valid('json'),
          c.req.raw.signal,
        )
        return c.json(find(c), 201)
      })
      .patch('/:id/links/:linkId', validateJson(IdeaLinkInputSchema), async (c) => {
        const idea = find(c)
        await links.update(
          { publicationId: idea.publicationId, ideaId: idea.id },
          param(c, 'linkId'),
          c.get('user').id,
          c.req.valid('json'),
          c.req.raw.signal,
        )
        return c.json(find(c))
      })
      .put('/:id/links/:linkId/read', validateJson(ReadingItemReadSchema), (c) => {
        const idea = find(c)
        if (!ideas.setLinkRead(idea.id, param(c, 'linkId'), c.req.valid('json').read)) {
          throw notFound()
        }
        return c.json(find(c))
      })
      // Tags added to or taken from several items at once (all or nothing).
      .post('/:id/links/tags', validateJson(BulkTagInputSchema), (c) => {
        const idea = find(c)
        const { ids, add, remove } = c.req.valid('json')
        links.tagMany({ publicationId: idea.publicationId, ideaId: idea.id }, ids, add, remove)
        return c.json(find(c))
      })
      // The item's tags, replaced as a whole (like a note's).
      .put('/:id/links/:linkId/tags', validateJson(NoteTagsInputSchema), (c) => {
        const idea = find(c)
        const tags = c.req.valid('json').tags
        if (!store.transaction(() => ideas.setLinkTags(idea.id, param(c, 'linkId'), tags))) {
          throw notFound()
        }
        return c.json(find(c))
      })
      .delete('/:id/links/:linkId', (c) => {
        const idea = find(c)
        if (!ideas.removeLink(idea.id, param(c, 'linkId'))) throw notFound()
        return c.body(null, 204)
      })

      // ---- notes: index cards, in the order the person arranged them ----
      .route(
        '/:id/notes',
        noteRoutes(
          store,
          noteEdits,
          (c) => ({ publicationId: publicationOf(c), ideaId: find(c).id }),
          {
            drafts: true,
          },
        ),
      )

      // Starts a draft that develops this idea. Open the draft itself at `/drafts/:id`.
      .post('/:id/drafts', validateJson(DraftInputSchema), (c) => {
        const idea = find(c)
        const draft = drafts.create(
          idea.publicationId,
          c.get('user').id,
          c.req.valid('json'),
          idea.id,
        )
        ideas.touch(idea.id)
        return c.json(draft, 201)
      })
      .put('/:id/drafts/order', validateJson(DraftOrderSchema), (c) => {
        const idea = find(c)
        const ok = store.transaction(() => drafts.reorder(idea.id, c.req.valid('json').ids))
        if (!ok) {
          throw fail(
            409,
            'The drafts have changed since you opened this page. Reload and try again.',
          )
        }
        ideas.touch(idea.id)
        return c.json(find(c))
      })
      // ---- Refine: up to a few conversations per idea, shared by the publication's members ----
      .get('/:id/conversations', (c) => c.json(brainstorm.list(find(c))))
      .post('/:id/conversations', (c) => c.json(brainstorm.create(find(c)), 201))
      .get('/:id/conversations/:conversationId', (c) =>
        c.json(brainstorm.conversation(find(c), param(c, 'conversationId'))),
      )
      .post(
        '/:id/conversations/:conversationId/messages',
        validateJson(SendMessageInputSchema),
        (c) => {
          const idea = find(c)
          const { id, name } = c.get('user')
          let turn: Turn
          try {
            // Everything that can still be an ordinary error response (no key, throttled, busy) is checked here.
            turn = brainstorm.begin(
              idea,
              param(c, 'conversationId'),
              { id, name },
              c.req.valid('json'),
            )
          } catch (err) {
            return toLlmHttpError(err)
          }
          return streamSSE(c, async (stream) => {
            // Stop asking the provider (and paying) as soon as the person leaves or presses Stop.
            const stop = new AbortController()
            stream.onAbort(() => stop.abort())
            c.req.raw.signal.addEventListener('abort', () => stop.abort())
            for await (const event of turn.run(stop.signal)) {
              await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
            }
          })
        },
      )
      .post('/:id/conversations/:conversationId/proposals/:proposalId/accept', async (c) => {
        const idea = find(c)
        const input = AcceptProposalInputSchema.safeParse(await c.req.json().catch(() => ({})))
        if (!input.success) throw fail(400, 'Check the details and try again')
        const { id, name } = c.get('user')
        return c.json(
          brainstorm.accept(
            idea,
            param(c, 'conversationId'),
            param(c, 'proposalId'),
            { id, name },
            input.data.overwrite,
          ),
        )
      })
      .post('/:id/conversations/:conversationId/proposals/:proposalId/dismiss', (c) => {
        const { id, name } = c.get('user')
        return c.json(
          brainstorm.dismiss(find(c), param(c, 'conversationId'), param(c, 'proposalId'), {
            id,
            name,
          }),
        )
      })
      .patch(
        '/:id/conversations/:conversationId',
        validateJson(ConversationTitleInputSchema),
        (c) =>
          c.json(brainstorm.rename(find(c), param(c, 'conversationId'), c.req.valid('json').title)),
      )
      .patch(
        '/:id/conversations/:conversationId/proposals/:proposalId',
        validateJson(ProposalEditInputSchema),
        (c) =>
          c.json(
            brainstorm.edit(
              find(c),
              param(c, 'conversationId'),
              param(c, 'proposalId'),
              c.req.valid('json'),
            ),
          ),
      )
      .post('/:id/conversations/:conversationId/proposals/:proposalId/reconsider', (c) =>
        c.json(brainstorm.reconsider(find(c), param(c, 'conversationId'), param(c, 'proposalId'))),
      )
      .delete('/:id/conversations/:conversationId', (c) => {
        brainstorm.delete(find(c), param(c, 'conversationId'))
        return c.body(null, 204)
      })

      // ---- research: a search for reading, kept apart from the conversation ----
      .get('/:id/research', (c) => c.json(research.list(find(c))))
      .post('/:id/research', validateJson(ResearchInputSchema), async (c) => {
        try {
          const run = await research.run(
            find(c),
            c.get('user'),
            c.req.valid('json'),
            c.req.raw.signal,
          )
          return c.json(run, 201)
        } catch (err) {
          return toLlmHttpError(err)
        }
      })
      .post('/:id/research/:runId/add', validateJson(ResearchItemIdsSchema), (c) =>
        c.json(research.add(find(c), param(c, 'runId'), c.req.valid('json').itemIds)),
      )
      .post('/:id/research/:runId/dismiss', validateJson(ResearchItemIdsSchema), (c) =>
        c.json(research.dismiss(find(c), param(c, 'runId'), c.req.valid('json').itemIds)),
      )
      .post('/:id/research/:runId/reconsider', validateJson(ResearchItemIdsSchema), (c) =>
        c.json(research.reconsider(find(c), param(c, 'runId'), c.req.valid('json').itemIds)),
      )
      .delete('/:id/research/:runId', (c) => {
        research.delete(find(c), param(c, 'runId'))
        return c.body(null, 204)
      })
  )
}
