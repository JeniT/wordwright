import { Hono } from 'hono'
import {
  DeclineInvitationInputSchema,
  DeclineMyInvitationInputSchema,
  InviteInputSchema,
  InvitationTokenInputSchema,
  SetBlockAllInputSchema,
} from '@wordwright/core'
import { requireUser, type AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import { InvitationError, type InvitationService } from '../services/invitations'
import type { AccountService } from '../services/accounts'
import { validateJson } from '../validate'
import { fail } from '../errors'
import { param } from './params'

const STATUS = {
  owner_unverified: 403,
  email_unverified: 403,
  invalid_invitation: 400,
  wrong_account: 403,
  not_found: 404,
} as const

function toHttpError(err: unknown): never {
  if (err instanceof InvitationError) throw fail(STATUS[err.code], err.message)
  throw err
}

/**
 * Owner-facing routes, mounted at `/publications/:publicationId/invitations` behind sign-in and an
 * owner-only membership check.
 */
export function publicationInvitationRoutes(invitations: InvitationService, limiter: RateLimiter) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(invitations.listPending(param(c, 'publicationId'))))

    .post('/', validateJson(InviteInputSchema), (c) => {
      const owner = c.get('user')
      // Every invitation sends an email to a stranger from our server, so cap how many one person can send.
      if (!limiter.allow(owner.id)) {
        throw fail(429, 'You have sent a lot of invitations. Try again later.')
      }
      try {
        invitations.invite(owner, param(c, 'publicationId'), c.req.valid('json').email)
      } catch (err) {
        toHttpError(err)
      }
      // The same answer whatever happened, so it reveals nothing about who has an account or is already in.
      return c.json({ ok: true }, 202)
    })

    .delete('/:invitationId', (c) => {
      try {
        invitations.revoke(param(c, 'publicationId'), param(c, 'invitationId'))
      } catch (err) {
        toHttpError(err)
      }
      return c.body(null, 204)
    })
}

/** Link-holder routes at `/invitations`. Previewing works signed out; accepting needs sign-in. */
export function invitationRoutes(invitations: InvitationService, accounts: AccountService) {
  return (
    new Hono<AppEnv>()
      .post('/preview', validateJson(InvitationTokenInputSchema), (c) => {
        try {
          return c.json(invitations.preview(c.req.valid('json').token))
        } catch (err) {
          return toHttpError(err)
        }
      })
      // Declining works signed out: the link proves the inbox.
      .post('/decline', validateJson(DeclineInvitationInputSchema), (c) => {
        const { token, block } = c.req.valid('json')
        try {
          invitations.decline(token, block)
        } catch (err) {
          return toHttpError(err)
        }
        return c.json({ ok: true })
      })
      .get('/blocks', requireUser(accounts), (c) => {
        try {
          return c.json(invitations.blocks(c.get('user')))
        } catch (err) {
          return toHttpError(err)
        }
      })
      .put('/blocks/all', requireUser(accounts), validateJson(SetBlockAllInputSchema), (c) => {
        try {
          invitations.setBlockAll(c.get('user'), c.req.valid('json').blocked)
        } catch (err) {
          return toHttpError(err)
        }
        return c.json({ ok: true })
      })
      .delete('/blocks/senders/:senderId', requireUser(accounts), (c) => {
        try {
          invitations.unblockSender(c.get('user'), param(c, 'senderId'))
        } catch (err) {
          return toHttpError(err)
        }
        return c.body(null, 204)
      })
      // What is waiting for the signed-in person (Home offers it without the emailed link).
      .get('/mine', requireUser(accounts), (c) => c.json(invitations.mine(c.get('user'))))
      .post('/mine/:id/accept', requireUser(accounts), (c) => {
        try {
          return c.json(invitations.acceptMine(c.get('user'), param(c, 'id')))
        } catch (err) {
          return toHttpError(err)
        }
      })
      .post(
        '/mine/:id/decline',
        requireUser(accounts),
        validateJson(DeclineMyInvitationInputSchema),
        (c) => {
          try {
            invitations.declineMine(c.get('user'), param(c, 'id'), c.req.valid('json').block)
          } catch (err) {
            return toHttpError(err)
          }
          return c.json({ ok: true })
        },
      )
      .post('/accept', requireUser(accounts), validateJson(InvitationTokenInputSchema), (c) => {
        try {
          return c.json(invitations.accept(c.get('user'), c.req.valid('json').token))
        } catch (err) {
          return toHttpError(err)
        }
      })
  )
}
