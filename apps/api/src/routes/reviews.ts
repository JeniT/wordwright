import { Hono } from 'hono'
import {
  ChangeHandleInputSchema,
  CommentInputSchema,
  DeclineInvitationInputSchema,
  InvitationTokenInputSchema,
} from '@lfwa/core'
import { requireUser, type AppEnv } from '../auth/middleware'
import type { AccountService } from '../services/accounts'
import { AccountError } from '../services/accounts'
import type { ReviewService } from '../services/reviews'
import { validateJson } from '../validate'
import { fail } from '../errors'
import { param } from './params'

/** The reviewer's own reviews at `/reviews`: the only routes a reviewer-only account can reach (besides `/auth/me`). */
export function reviewRoutes(reviews: ReviewService, accounts: AccountService) {
  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(reviews.list(c.get('user'))))
      // "Start writing": choose a username and become a full account. The app then goes on to a first publication.
      .post('/start-writing', validateJson(ChangeHandleInputSchema), (c) => {
        try {
          const user = reviews.startWriting(c.get('user'), c.req.valid('json').handle)
          return c.json(accounts.toPublic(user))
        } catch (err) {
          if (err instanceof AccountError && err.code === 'handle_in_use')
            throw fail(409, err.message)
          throw err
        }
      })
      .get('/:id', (c) => c.json(reviews.open(c.get('user'), param(c, 'id'))))
      .post('/:id/comments', validateJson(CommentInputSchema), (c) =>
        c.json(reviews.comment(c.get('user'), param(c, 'id'), c.req.valid('json')), 201),
      )
      .post('/:id/end', (c) => {
        reviews.end(c.get('user'), param(c, 'id'))
        return c.body(null, 204)
      })
  )
}

/** Link-holder routes at `/review-invitations`. Previewing and declining work signed out; accepting needs sign-in. */
export function reviewInvitationRoutes(reviews: ReviewService, accounts: AccountService) {
  return new Hono<AppEnv>()
    .post('/preview', validateJson(InvitationTokenInputSchema), (c) =>
      c.json(reviews.preview(c.req.valid('json').token)),
    )
    .post('/decline', validateJson(DeclineInvitationInputSchema), (c) => {
      const { token, block } = c.req.valid('json')
      reviews.decline(token, block)
      return c.json({ ok: true })
    })
    .post('/accept', requireUser(accounts), validateJson(InvitationTokenInputSchema), (c) =>
      c.json(reviews.accept(c.get('user'), c.req.valid('json').token)),
    )
}
