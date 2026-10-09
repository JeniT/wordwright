import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { DeleteAccountInputSchema } from '@lfwa/core'
import { requireUser, SESSION_COOKIE, type AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import type { AccountService } from '../services/accounts'
import { toHttpError } from './auth'

export function accountRoutes(accounts: AccountService, limiter: RateLimiter) {
  return new Hono<AppEnv>()
    .use(requireUser(accounts))
    .delete('/', zValidator('json', DeleteAccountInputSchema), async (c) => {
      const user = c.get('user')
      if (!limiter.allow(user.id)) throw new HTTPException(429, { message: 'Too many attempts' })
      const { confirmEmail, password } = c.req.valid('json')
      await accounts.deleteAccount(user, confirmEmail, password).catch(toHttpError)
      deleteCookie(c, SESSION_COOKIE, { path: '/' })
      return c.body(null, 204)
    })
}
