import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import {
  detectImageType,
  type FeedFetcher,
  MAX_IMAGE_BYTES,
  MAX_OWNED_PROFILES,
  ProfileInputSchema,
  ProfileUpdateSchema,
} from '@lfwa/core'
import { requireMember, type AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { validateJson } from '../validate'
import { assistRoutes } from './assist'
import { draftRoutes } from './drafts'
import { imageResponse } from './image-response'
import { ideaRoutes } from './ideas'
import { sourceRoutes } from './sources'
import { moveRoutes, profileReadingRoutes } from './reading'
import { noteRoutes } from './notes'
import { NoteEditService } from '../services/note-edits'
import { MoveService } from '../services/moves'
import type { BrainstormService } from '../services/brainstorm'
import type { ResearchService } from '../services/research'
import type { FeedItemService } from '../services/feed-items'
import type { IdeaLinkService } from '../services/idea-links'
import { profileInvitationRoutes } from './invitations'
import type { RateLimiter } from '../auth/rate-limit'
import type { InvitationService } from '../services/invitations'
import type { LlmKeyService } from '../services/llm'

export interface ProfileRouteDeps {
  store: Store
  llmKeys: LlmKeyService
  invitations: InvitationService
  /** Per person: each invitation emails a stranger. */
  inviteLimiter: RateLimiter
  feeds: FeedFetcher
  /** Per person: each new source makes the server fetch pages. */
  feedLimiter: RateLimiter
  feedItems: FeedItemService
  ideaLinks: IdeaLinkService
  brainstorm: BrainstormService
  research: ResearchService
}

export function profileRoutes({
  store,
  llmKeys,
  invitations,
  inviteLimiter,
  feeds,
  feedLimiter,
  feedItems,
  ideaLinks,
  brainstorm,
  research,
}: ProfileRouteDeps) {
  const member = requireMember(store)
  const owner = requireMember(store, true)
  const noteEdits = new NoteEditService(store)
  const moves = new MoveService(store)

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(store.profiles.listForUser(c.get('user').id)))

      .post('/', validateJson(ProfileInputSchema), (c) => {
        const user = c.get('user')
        if (store.profiles.countOwnedBy(user.id) >= MAX_OWNED_PROFILES) {
          throw new HTTPException(409, {
            message: `You can have up to ${MAX_OWNED_PROFILES} profiles. Delete one you no longer use to make room.`,
          })
        }
        const { name, siteUrl } = c.req.valid('json')
        const id = store.profiles.create(name, user.id, siteUrl ?? null)
        return c.json(store.profiles.get(id, user.id), 201)
      })

      .get('/:profileId', member, (c) =>
        c.json(store.profiles.get(c.req.param('profileId'), c.get('user').id)),
      )

      .patch('/:profileId', owner, validateJson(ProfileUpdateSchema), (c) => {
        const id = store.profiles.update(c.req.param('profileId'), c.req.valid('json'))
        return c.json(store.profiles.get(id, c.get('user').id))
      })

      .delete('/:profileId', owner, (c) => {
        store.profiles.delete(c.req.param('profileId'))
        return c.body(null, 204)
      })

      // The picture is raw bytes in the request body. What it is gets decided by looking at the
      // bytes, never by the Content-Type the client claims.
      .get('/:profileId/image', member, (c) => {
        const image = store.profiles.getImage(c.req.param('profileId'))
        if (!image) throw new HTTPException(404, { message: 'Not found' })
        return imageResponse(c, image)
      })

      .put(
        '/:profileId/image',
        owner,
        bodyLimit({
          maxSize: MAX_IMAGE_BYTES,
          onError: () => {
            throw new HTTPException(413, {
              message: `That image is too large. Choose one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
            })
          },
        }),
        async (c) => {
          const id = c.req.param('profileId')
          const data = new Uint8Array(await c.req.arrayBuffer())
          const contentType = detectImageType(data)
          if (!contentType) {
            throw new HTTPException(415, {
              message: 'That file is not a PNG, JPEG, WebP or GIF image. Choose a different one.',
            })
          }
          store.profiles.setImage(id, { contentType, data })
          return c.json(store.profiles.get(id, c.get('user').id))
        },
      )

      .delete('/:profileId/image', owner, (c) => {
        store.profiles.deleteImage(c.req.param('profileId'))
        return c.body(null, 204)
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

      .route(
        '/:profileId/invitations',
        new Hono<AppEnv>()
          .use(owner)
          .route('/', profileInvitationRoutes(invitations, inviteLimiter)),
      )
      .route('/:profileId/drafts', new Hono<AppEnv>().use(member).route('/', draftRoutes(store)))
      .route(
        '/:profileId/ideas',
        new Hono<AppEnv>()
          .use(member)
          .route('/', ideaRoutes(store, ideaLinks, brainstorm, research)),
      )
      .route('/:profileId/sources', sourceRoutes(store, feeds, feedLimiter, member, feedItems))
      // The profile's own reading list and notes, gathered before there is an idea.
      .route(
        '/:profileId/reading',
        new Hono<AppEnv>().use(member).route('/', profileReadingRoutes(store, ideaLinks)),
      )
      .route(
        '/:profileId/notes',
        new Hono<AppEnv>().use(member).route(
          '/',
          noteRoutes(
            store,
            noteEdits,
            (c) => ({ profileId: c.req.param('profileId')!, ideaId: null }),
            {
              drafts: false,
            },
          ),
        ),
      )
      .route('/:profileId/move', new Hono<AppEnv>().use(member).route('/', moveRoutes(moves)))
      .route(
        '/:profileId/assist',
        new Hono<AppEnv>().use(member).route('/', assistRoutes(store, llmKeys)),
      )
  )
}
