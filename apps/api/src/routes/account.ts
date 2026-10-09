import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import {
  BrainstormPromptInputSchema,
  ChangeEmailInputSchema,
  ChangePasswordInputSchema,
  DeleteAccountInputSchema,
} from '@lfwa/core'
import { requireUser, SESSION_COOKIE, type AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import type { AccountService } from '../services/accounts'
import type { BrainstormPromptService } from '../services/brainstorm-prompt'
import { validateJson } from '../validate'
import { toHttpError } from './auth'

export function accountRoutes(
  accounts: AccountService,
  limiter: RateLimiter,
  brainstormPrompts: BrainstormPromptService,
) {
  return (
    new Hono<AppEnv>()
      .use(requireUser(accounts))
      // Guessing the current password is the attack here, so attempts are throttled per person.
      .post('/password', zValidator('json', ChangePasswordInputSchema), async (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw new HTTPException(429, { message: 'Too many attempts' })
        const { currentPassword, newPassword } = c.req.valid('json')
        const sessionToken = getCookie(c, SESSION_COOKIE)!
        await accounts
          .changePassword(user, sessionToken, currentPassword, newPassword)
          .catch(toHttpError)
        return c.json({ ok: true })
      })
      // Guessing the password is the attack here too; and each request emails a stranger.
      .post('/email', zValidator('json', ChangeEmailInputSchema), async (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw new HTTPException(429, { message: 'Too many attempts' })
        const { newEmail, password } = c.req.valid('json')
        await accounts.requestEmailChange(user, newEmail, password).catch(toHttpError)
        return c.json({ ok: true })
      })
      .post('/password/setup-email', (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw new HTTPException(429, { message: 'Too many attempts' })
        try {
          accounts.requestPasswordSetup(user)
        } catch (err) {
          toHttpError(err)
        }
        return c.json({ ok: true })
      })
      // The person's own version of the brainstorming prompt (or the default, until they change it).
      .get('/brainstorm-prompt', (c) => c.json(brainstormPrompts.get(c.get('user').id)))
      .put('/brainstorm-prompt', validateJson(BrainstormPromptInputSchema), (c) =>
        c.json(brainstormPrompts.save(c.get('user').id, c.req.valid('json').prompt)),
      )
      .delete('/brainstorm-prompt', (c) => c.json(brainstormPrompts.reset(c.get('user').id)))
      .delete('/', zValidator('json', DeleteAccountInputSchema), async (c) => {
        const user = c.get('user')
        if (!limiter.allow(user.id)) throw new HTTPException(429, { message: 'Too many attempts' })
        const { confirmEmail, password } = c.req.valid('json')
        await accounts.deleteAccount(user, confirmEmail, password).catch(toHttpError)
        deleteCookie(c, SESSION_COOKIE, { path: '/' })
        return c.body(null, 204)
      })
  )
}
