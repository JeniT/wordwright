import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  DraftInputSchema,
  IdeaInputSchema,
  IdeaLinkInputSchema,
  IdeaUpdateSchema,
  MAX_IDEA_LINKS,
} from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { validateJson } from '../validate'

const notFound = () => new HTTPException(404, { message: 'Not found' })

/** Mounted under `/profiles/:profileId`, after membership has been checked. */
export function ideaRoutes(store: Store) {
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

      .post('/:id/links', validateJson(IdeaLinkInputSchema), (c) => {
        const idea = find(c)
        if (idea.links.length >= MAX_IDEA_LINKS) {
          throw new HTTPException(409, {
            message: `An idea can have up to ${MAX_IDEA_LINKS} links. Remove one you no longer need to make room.`,
          })
        }
        ideas.addLink(idea.id, c.req.valid('json'))
        return c.json(ideas.get(idea.profileId, idea.id), 201)
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
  )
}
