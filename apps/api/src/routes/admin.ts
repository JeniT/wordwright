import { Hono } from 'hono'
import { z } from 'zod'
import { AdminDecisionSchema } from '@wordwright/core'
import { requireAdmin, type AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import type { AdminService } from '../services/admin'
import { validateJson } from '../validate'
import { fail } from '../errors'
import { param } from './params'

const DecisionInputSchema = z.object({ decision: AdminDecisionSchema })

/** Mounted at `/admin` behind sign-in. Everyone who is not an admin gets 404, as for a page that doesn't exist. */
export function adminRoutes(admin: AdminService, limiter: RateLimiter) {
  return new Hono<AppEnv>()
    .use(requireAdmin)
    .get('/accounts', (c) => c.json(admin.accounts()))
    .post('/accounts/:id/decision', validateJson(DecisionInputSchema), (c) => {
      const me = c.get('user')
      if (!limiter.allow(me.id)) throw fail(429, 'That is a lot of decisions. Try again later.')
      admin.decide(me, param(c, 'id'), c.req.valid('json').decision)
      return c.json(admin.accounts())
    })
}
