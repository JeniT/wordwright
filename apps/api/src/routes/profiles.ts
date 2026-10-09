import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { AddMemberInputSchema, ProfileInputSchema } from '@lfwa/core'
import { requireMember, type AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { assistRoutes } from './assist'
import { draftRoutes } from './drafts'
import type { LlmKeyService } from '../services/llm'

export function profileRoutes(store: Store, llmKeys: LlmKeyService) {
  const member = requireMember(store)
  const owner = requireMember(store, true)

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(store.profiles.listForUser(c.get('user').id)))

      .post('/', zValidator('json', ProfileInputSchema), (c) => {
        const user = c.get('user')
        const id = store.profiles.create(c.req.valid('json').name, user.id)
        return c.json(store.profiles.get(id, user.id), 201)
      })

      .get('/:profileId', member, (c) =>
        c.json(store.profiles.get(c.req.param('profileId'), c.get('user').id)),
      )

      .patch('/:profileId', owner, zValidator('json', ProfileInputSchema), (c) => {
        const id = c.req.param('profileId')
        store.profiles.rename(id, c.req.valid('json').name)
        return c.json(store.profiles.get(id, c.get('user').id))
      })

      .delete('/:profileId', owner, (c) => {
        store.profiles.delete(c.req.param('profileId'))
        return c.body(null, 204)
      })

      // Sharing: add someone who already has an account.
      .post('/:profileId/members', owner, zValidator('json', AddMemberInputSchema), (c) => {
        const id = c.req.param('profileId')
        // Sharing gives someone access to your work, so both sides must have proven their addresses.
        if (!c.get('user').emailVerified) {
          throw new HTTPException(403, {
            message: 'Please confirm your email address before sharing a profile',
          })
        }
        const target = store.users.findByEmail(c.req.valid('json').email)
        // An unconfirmed address may belong to someone who merely typed it in, so treat it as unknown.
        if (!target?.emailVerified) {
          throw new HTTPException(404, { message: 'No account with that email address' })
        }
        if (store.profiles.roleOf(id, target.id)) {
          throw new HTTPException(409, { message: 'Already a member' })
        }
        store.profiles.addMember(id, target.id, 'editor')
        return c.json(store.profiles.get(id, c.get('user').id), 201)
      })

      // Owners remove others; anyone can remove themselves, except the owner (who must delete
      // the profile or hand it over first).
      .delete('/:profileId/members/:userId', member, (c) => {
        const id = c.req.param('profileId')
        const me = c.get('user').id
        const targetId = c.req.param('userId')
        const isOwner = c.get('role') === 'owner'
        if (targetId !== me && !isOwner) throw new HTTPException(403, { message: 'Owner only' })
        if (targetId === me && isOwner) {
          throw new HTTPException(400, {
            message: 'Owners cannot leave; delete the profile instead',
          })
        }
        if (!store.profiles.roleOf(id, targetId))
          throw new HTTPException(404, { message: 'Not found' })
        store.profiles.removeMember(id, targetId)
        return c.body(null, 204)
      })

      .route('/:profileId/drafts', new Hono<AppEnv>().use(member).route('/', draftRoutes(store)))
      .route(
        '/:profileId/assist',
        new Hono<AppEnv>().use(member).route('/', assistRoutes(store, llmKeys)),
      )
  )
}
