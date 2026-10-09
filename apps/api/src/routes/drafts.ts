import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { DraftInputSchema } from '@lfwa/core'
import type { DraftRepository } from '../db/drafts'

export function draftRoutes(drafts: DraftRepository) {
  return new Hono()
    .get('/', (c) => c.json(drafts.list()))
    .post('/', zValidator('json', DraftInputSchema), (c) =>
      c.json(drafts.create(c.req.valid('json')), 201),
    )
    .get('/:id', (c) => {
      const draft = drafts.get(c.req.param('id'))
      return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
    })
    .put('/:id', zValidator('json', DraftInputSchema), (c) => {
      const draft = drafts.update(c.req.param('id'), c.req.valid('json'))
      return draft ? c.json(draft) : c.json({ error: 'Not found' }, 404)
    })
    .delete('/:id', (c) =>
      drafts.delete(c.req.param('id')) ? c.body(null, 204) : c.json({ error: 'Not found' }, 404),
    )
}
