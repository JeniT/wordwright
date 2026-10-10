import { Hono } from 'hono'
import { DraftInputSchema } from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { validateJson } from '../validate'

/**
 * Mounted under `/profiles/:profileId`, after membership has been checked. Drafts are created and
 * listed through their idea (`/ideas/:id/drafts`); these routes open, save and delete one by id.
 */
export function draftRoutes(store: Store) {
  const { drafts } = store
  return new Hono<AppEnv>()
    .get('/:id', (c) => {
      const draft = drafts.get(c.req.param('profileId')!, c.req.param('id'))
      return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
    })
    .put('/:id', validateJson(DraftInputSchema), (c) => {
      const draft = drafts.update(c.req.param('profileId')!, c.req.param('id'), c.req.valid('json'))
      return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
    })
    .delete('/:id', (c) =>
      drafts.delete(c.req.param('profileId')!, c.req.param('id'))
        ? c.body(null, 204)
        : c.json({ error: 'Not found' }, 404),
    )
}
