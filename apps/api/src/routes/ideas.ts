import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import {
  AcceptProposalInputSchema,
  DraftInputSchema,
  DraftOrderSchema,
  IdeaInputSchema,
  IdeaLinkInputSchema,
  IdeaUpdateSchema,
  markdownToNotes,
  ReadingItemReadSchema,
  ResearchInputSchema,
  ResearchItemIdsSchema,
  SendMessageInputSchema,
} from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { BrainstormService, Turn } from '../services/brainstorm'
import type { IdeaLinkService } from '../services/idea-links'
import type { ResearchService } from '../services/research'
import { NoteEditService } from '../services/note-edits'
import { noteRoutes } from './notes'
import { toLlmHttpError } from './llm'
import { validateJson } from '../validate'

const notFound = () => new HTTPException(404, { message: 'Not found' })
const notFoundError = (): never => {
  throw notFound()
}
type Ctx = Context<AppEnv>

/** Mounted under `/profiles/:profileId`, after membership has been checked. */
export function ideaRoutes(
  store: Store,
  links: IdeaLinkService,
  brainstorm: BrainstormService,
  research: ResearchService,
) {
  const { ideas, drafts, notes } = store
  const noteEdits = new NoteEditService(store)
  /** A path parameter every route here has; a missing one can only mean the URL didn't match. */
  const param = (c: Ctx, name: string) => c.req.param(name) ?? notFoundError()
  const profileOf = (c: Ctx) => param(c, 'profileId')
  /** The idea named in the URL, or a 404 (also when it belongs to a different profile). */
  const find = (c: Ctx) => {
    const idea = ideas.get(profileOf(c), param(c, 'id'))
    if (!idea) throw notFound()
    return idea
  }

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(ideas.list(profileOf(c))))
      .post('/', validateJson(IdeaInputSchema), (c) =>
        c.json(ideas.create(profileOf(c), c.get('user').id, c.req.valid('json')), 201),
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
          throw new HTTPException(409, {
            message:
              "This idea has quotations, which can't be edited. Change the other notes one at a time in the Notes list.",
          })
        }
        return c.json(ideas.update(idea.profileId, idea.id, changes))
      })
      .delete('/:id', (c) => {
        const idea = find(c)
        ideas.delete(idea.profileId, idea.id)
        return c.body(null, 204)
      })

      .post('/:id/links', validateJson(IdeaLinkInputSchema), async (c) => {
        const idea = find(c)
        await links.add(
          { profileId: idea.profileId, ideaId: idea.id },
          c.get('user').id,
          c.req.valid('json'),
          c.req.raw.signal,
        )
        return c.json(find(c), 201)
      })
      .patch('/:id/links/:linkId', validateJson(IdeaLinkInputSchema), async (c) => {
        const idea = find(c)
        await links.update(
          { profileId: idea.profileId, ideaId: idea.id },
          c.req.param('linkId'),
          c.get('user').id,
          c.req.valid('json'),
          c.req.raw.signal,
        )
        return c.json(find(c))
      })
      .put('/:id/links/:linkId/read', validateJson(ReadingItemReadSchema), (c) => {
        const idea = find(c)
        if (!ideas.setLinkRead(idea.id, c.req.param('linkId'), c.req.valid('json').read)) {
          throw notFound()
        }
        return c.json(find(c))
      })
      .delete('/:id/links/:linkId', (c) => {
        const idea = find(c)
        if (!ideas.removeLink(idea.id, c.req.param('linkId'))) throw notFound()
        return c.body(null, 204)
      })

      // ---- notes: index cards, in the order the person arranged them ----
      .route(
        '/:id/notes',
        noteRoutes(store, noteEdits, (c) => ({ profileId: profileOf(c), ideaId: find(c).id }), {
          drafts: true,
        }),
      )

      // Starts a draft that develops this idea. Open the draft itself at `/drafts/:id`.
      .post('/:id/drafts', validateJson(DraftInputSchema), (c) => {
        const idea = find(c)
        const draft = drafts.create(idea.profileId, c.get('user').id, c.req.valid('json'), idea.id)
        ideas.touch(idea.id)
        return c.json(draft, 201)
      })
      .put('/:id/drafts/order', validateJson(DraftOrderSchema), (c) => {
        const idea = find(c)
        const ok = store.transaction(() => drafts.reorder(idea.id, c.req.valid('json').ids))
        if (!ok) {
          throw new HTTPException(409, {
            message: 'The drafts have changed since you opened this page. Reload and try again.',
          })
        }
        ideas.touch(idea.id)
        return c.json(find(c))
      })
      // ---- brainstorming: one thread per idea, shared by the profile's members ----
      .get('/:id/conversation', (c) => c.json(brainstorm.conversation(find(c))))
      .post('/:id/conversation/messages', validateJson(SendMessageInputSchema), (c) => {
        const idea = find(c)
        const { id, name } = c.get('user')
        let turn: Turn
        try {
          // Everything that can still be an ordinary error response (no key, throttled, busy) is checked here.
          turn = brainstorm.begin(idea, { id, name }, c.req.valid('json'))
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
      })
      .post('/:id/conversation/proposals/:proposalId/accept', async (c) => {
        const idea = find(c)
        const input = AcceptProposalInputSchema.safeParse(await c.req.json().catch(() => ({})))
        if (!input.success)
          throw new HTTPException(400, { message: 'Check the details and try again' })
        const { id, name } = c.get('user')
        return c.json(
          brainstorm.accept(idea, c.req.param('proposalId'), { id, name }, input.data.overwrite),
        )
      })
      .post('/:id/conversation/proposals/:proposalId/dismiss', (c) => {
        const { id, name } = c.get('user')
        return c.json(brainstorm.dismiss(find(c), c.req.param('proposalId'), { id, name }))
      })
      .delete('/:id/conversation', (c) => {
        brainstorm.restart(find(c))
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
        c.json(research.add(find(c), c.req.param('runId'), c.req.valid('json').itemIds)),
      )
      .post('/:id/research/:runId/dismiss', validateJson(ResearchItemIdsSchema), (c) =>
        c.json(research.dismiss(find(c), c.req.param('runId'), c.req.valid('json').itemIds)),
      )
      .post('/:id/research/:runId/reconsider', validateJson(ResearchItemIdsSchema), (c) =>
        c.json(research.reconsider(find(c), c.req.param('runId'), c.req.valid('json').itemIds)),
      )
      .delete('/:id/research/:runId', (c) => {
        research.delete(find(c), c.req.param('runId'))
        return c.body(null, 204)
      })
  )
}
