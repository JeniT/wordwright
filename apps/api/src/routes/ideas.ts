import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import {
  AcceptProposalInputSchema,
  DraftInputSchema,
  IdeaInputSchema,
  IdeaLinkInputSchema,
  IdeaUpdateSchema,
  SendMessageInputSchema,
} from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { BrainstormService, Turn } from '../services/brainstorm'
import type { IdeaLinkService } from '../services/idea-links'
import { toLlmHttpError } from './llm'
import { validateJson } from '../validate'

const notFound = () => new HTTPException(404, { message: 'Not found' })

/** Mounted under `/profiles/:profileId`, after membership has been checked. */
export function ideaRoutes(store: Store, links: IdeaLinkService, brainstorm: BrainstormService) {
  const { ideas, drafts } = store
  const profileOf = (c: { req: { param: (name: string) => string | undefined } }) =>
    c.req.param('profileId')!
  /** The idea named in the URL, or a 404 (also when it belongs to a different profile). */
  const find = (c: { req: { param: (name: string) => string | undefined } }) => {
    const idea = ideas.get(profileOf(c), c.req.param('id')!)
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
        return c.json(ideas.update(idea.profileId, idea.id, c.req.valid('json')))
      })
      .delete('/:id', (c) => {
        const idea = find(c)
        ideas.delete(idea.profileId, idea.id)
        return c.body(null, 204)
      })

      .post('/:id/links', validateJson(IdeaLinkInputSchema), async (c) => {
        const saved = await links.add(
          find(c),
          c.get('user').id,
          c.req.valid('json'),
          c.req.raw.signal,
        )
        return c.json(saved, 201)
      })
      .patch('/:id/links/:linkId', validateJson(IdeaLinkInputSchema), async (c) => {
        const saved = await links.update(
          find(c),
          c.req.param('linkId'),
          c.get('user').id,
          c.req.valid('json'),
          c.req.raw.signal,
        )
        return c.json(saved)
      })
      .delete('/:id/links/:linkId', (c) => {
        const idea = find(c)
        if (!ideas.removeLink(idea.id, c.req.param('linkId'))) throw notFound()
        return c.body(null, 204)
      })

      // Starts a draft that develops this idea. Open the draft itself at `/drafts/:id`.
      .post('/:id/drafts', validateJson(DraftInputSchema), (c) => {
        const idea = find(c)
        const draft = drafts.create(idea.profileId, c.get('user').id, c.req.valid('json'), idea.id)
        ideas.touch(idea.id)
        return c.json(draft, 201)
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
  )
}
