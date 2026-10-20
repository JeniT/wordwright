import { Hono } from 'hono'
import { z } from 'zod'
import { ACTIVE_DRAFTS_MAX, ACTIVE_DRAFTS_PAGE } from '@wordwright/core'
import type { AppEnv } from '../auth/middleware'
import { fail } from '../errors'
import { activeDrafts } from '../services/active-drafts'
import type { Store } from '../db/store'

const QuerySchema = z.object({
  publicationId: z.string().min(1).optional(),
  ideaId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(ACTIVE_DRAFTS_MAX).default(ACTIVE_DRAFTS_PAGE),
})

/**
 * Mounted at `/drafts`, for a signed-in person: not tied to one publication, so Home can offer the drafts to carry on
 * with across all of them, and a publication's or an idea's page the ones within it.
 */
export function activeDraftRoutes(store: Store, now: () => Date) {
  return new Hono<AppEnv>().get('/active', (c) => {
    const parsed = QuerySchema.safeParse(c.req.query())
    if (!parsed.success) throw fail(400, 'Those filters are not valid.')
    return c.json(activeDrafts(store, c.get('user').id, { ...parsed.data, now: now() }))
  })
}
