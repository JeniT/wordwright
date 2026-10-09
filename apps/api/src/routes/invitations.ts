import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { InviteInputSchema, InvitationTokenInputSchema } from '@lfwa/core'
import { requireUser, type AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import { InvitationError, type InvitationService } from '../services/invitations'
import type { AccountService } from '../services/accounts'

const STATUS = {
  owner_unverified: 403,
  invalid_invitation: 400,
  wrong_account: 403,
  not_found: 404,
} as const

function toHttpError(err: unknown): never {
  if (err instanceof InvitationError)
    throw new HTTPException(STATUS[err.code], { message: err.message })
  throw err
}

/**
 * Owner-facing routes, mounted at `/profiles/:profileId/invitations` behind sign-in and an
 * owner-only membership check.
 */
export function profileInvitationRoutes(invitations: InvitationService, limiter: RateLimiter) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(invitations.listPending(c.req.param('profileId')!)))

    .post('/', zValidator('json', InviteInputSchema), (c) => {
      const owner = c.get('user')
      // Every invitation sends an email to a stranger from our server, so cap how many one person can send.
      if (!limiter.allow(owner.id)) {
        throw new HTTPException(429, {
          message: 'You have sent a lot of invitations. Try again later.',
        })
      }
      try {
        invitations.invite(owner, c.req.param('profileId')!, c.req.valid('json').email)
      } catch (err) {
        toHttpError(err)
      }
      // The same answer whatever happened, so it reveals nothing about who has an account or is already in.
      return c.json({ ok: true }, 202)
    })

    .delete('/:invitationId', (c) => {
      try {
        invitations.revoke(c.req.param('profileId')!, c.req.param('invitationId'))
      } catch (err) {
        toHttpError(err)
      }
      return c.body(null, 204)
    })
}

/** Link-holder routes at `/invitations`. Previewing works signed out; accepting needs sign-in. */
export function invitationRoutes(invitations: InvitationService, accounts: AccountService) {
  return new Hono<AppEnv>()
    .post('/preview', zValidator('json', InvitationTokenInputSchema), (c) => {
      try {
        return c.json(invitations.preview(c.req.valid('json').token))
      } catch (err) {
        return toHttpError(err)
      }
    })
    .post('/accept', requireUser(accounts), zValidator('json', InvitationTokenInputSchema), (c) => {
      try {
        return c.json(invitations.accept(c.get('user'), c.req.valid('json').token))
      } catch (err) {
        return toHttpError(err)
      }
    })
}
