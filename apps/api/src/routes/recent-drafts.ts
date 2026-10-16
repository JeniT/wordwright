import { Hono } from 'hono'
import { RECENT_DRAFTS_LIMIT } from '@wordwright/core'
import type { AppEnv } from '../auth/middleware'
import type { DraftStore } from '../db/drafts'

/** Mounted at `/drafts`, for a signed-in person: not tied to one publication, so Home can offer the next draft to pick up. */
export function recentDraftRoutes(drafts: DraftStore) {
  return new Hono<AppEnv>().get('/recent', (c) =>
    c.json(drafts.recentFor(c.get('user').id, RECENT_DRAFTS_LIMIT)),
  )
}
