import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  detectImageType,
  type FeedFetcher,
  MAX_IMAGE_BYTES,
  MAX_OWNED_PROFILES,
  MemberRoleInputSchema,
  ProfileDescriptionInputSchema,
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
import { FeedPostService } from '../services/feed-posts'
import type { BrainstormService } from '../services/brainstorm'
import type { ResearchService } from '../services/research'
import type { FeedItemService } from '../services/feed-items'
import type { IdeaLinkService } from '../services/idea-links'
import { handDraftsToOwner } from '../services/draft-editor'
import { profileInvitationRoutes } from './invitations'
import type { RateLimiter } from '../auth/rate-limit'
import { profileAttention } from '../services/attention'
import type { HandoverService } from '../services/handover'
import type { ReviewService } from '../services/reviews'
import type { InvitationService } from '../services/invitations'
import type { LlmKeyService } from '../services/llm'
import { fail } from '../errors'
import type { ExportService } from '../services/export'
import { throttleExport, zipResponse } from './zip-response'
import { ownerCannotLeaveMessage, setMemberRole } from '../services/owners'
import { param } from './params'

export interface ProfileRouteDeps {
  store: Store
  llmKeys: LlmKeyService
  invitations: InvitationService
  handover: HandoverService
  reviews: ReviewService
  /** Per person: each invitation emails a stranger. */
  inviteLimiter: RateLimiter
  exports: ExportService
  /** Per person: building an export costs the server real work. */
  exportLimiter: RateLimiter
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
  handover,
  reviews,
  inviteLimiter,
  exports,
  exportLimiter,
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
  const feedPosts = new FeedPostService(store)

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(store.profiles.listForUser(c.get('user').id)))

      .post('/', validateJson(ProfileInputSchema), (c) => {
        const user = c.get('user')
        if (store.profiles.countOwnedBy(user.id) >= MAX_OWNED_PROFILES) {
          throw fail(
            409,
            `You can have up to ${MAX_OWNED_PROFILES} profiles. Delete one you no longer use to make room.`,
          )
        }
        const { name, siteUrl } = c.req.valid('json')
        const id = store.profiles.create(name, user.id, siteUrl ?? null)
        return c.json(store.profiles.get(id, user.id), 201)
      })

      // What is waiting on this person, for the landing page.
      .get('/:profileId/attention', member, (c) =>
        c.json(profileAttention(store, param(c, 'profileId'), c.get('user').id)),
      )

      .get('/:profileId', member, (c) =>
        c.json(store.profiles.get(param(c, 'profileId'), c.get('user').id)),
      )

      .patch('/:profileId', owner, validateJson(ProfileUpdateSchema), (c) => {
        // One transaction: the name, the website and the new address change together or not at all.
        const id = store.transaction(() =>
          store.profiles.update(param(c, 'profileId'), c.req.valid('json')),
        )
        return c.json(store.profiles.get(id, c.get('user').id))
      })

      // Anyone who works in the profile can describe it, unlike its name and website, which are the owner's.
      .put('/:profileId/description', member, validateJson(ProfileDescriptionInputSchema), (c) => {
        const id = param(c, 'profileId')
        store.profiles.setDescription(id, c.req.valid('json').description)
        return c.json(store.profiles.get(id, c.get('user').id))
      })

      .delete('/:profileId', owner, (c) => {
        store.profiles.delete(param(c, 'profileId'))
        return c.body(null, 204)
      })

      // Everything of theirs in this profile, as Markdown (#167); which drafts depends on their role.
      .get('/:profileId/export', member, (c) => {
        const user = c.get('user')
        throttleExport(exportLimiter, user.id)
        return zipResponse(c, exports.profile(param(c, 'profileId'), user))
      })

      // The picture is raw bytes in the request body. What it is gets decided by looking at the
      // bytes, never by the Content-Type the client claims.
      .get('/:profileId/image', member, (c) => {
        const image = store.profiles.getImage(param(c, 'profileId'))
        if (!image) throw fail(404, 'Not found')
        return imageResponse(c, image)
      })

      .put(
        '/:profileId/image',
        owner,
        bodyLimit({
          maxSize: MAX_IMAGE_BYTES,
          onError: () => {
            throw fail(
              413,
              `That image is too large. Choose one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
            )
          },
        }),
        async (c) => {
          const id = param(c, 'profileId')
          const data = new Uint8Array(await c.req.arrayBuffer())
          const contentType = detectImageType(data)
          if (!contentType) {
            throw fail(
              415,
              'That file is not a PNG, JPEG, WebP or GIF image. Choose a different one.',
            )
          }
          store.profiles.setImage(id, { contentType, data })
          return c.json(store.profiles.get(id, c.get('user').id))
        },
      )

      .delete('/:profileId/image', owner, (c) => {
        store.profiles.deleteImage(param(c, 'profileId'))
        return c.body(null, 204)
      })

      .put('/:profileId/members/:userId/role', owner, validateJson(MemberRoleInputSchema), (c) => {
        const id = param(c, 'profileId')
        setMemberRole(store, id, c.get('user').id, param(c, 'userId'), c.req.valid('json').role)
        return c.json(store.profiles.get(id, c.get('user').id))
      })

      // Owners remove others; anyone can remove themselves, except an owner, who steps down first
      // (or makes someone else an owner, or deletes the profile).
      .delete('/:profileId/members/:userId', member, (c) => {
        const id = param(c, 'profileId')
        const me = c.get('user').id
        const targetId = param(c, 'userId')
        const isOwner = c.get('role') === 'owner'
        if (targetId !== me && !isOwner) throw fail(403, 'Owner only')
        if (targetId === me && isOwner) {
          throw fail(400, ownerCannotLeaveMessage(store, id, me))
        }
        if (!store.profiles.roleOf(id, targetId)) throw fail(404, 'Not found')
        store.transaction(() => {
          store.profiles.removeMember(id, targetId)
          handDraftsToOwner(store, id, targetId)
        })
        return c.body(null, 204)
      })

      .route(
        '/:profileId/invitations',
        new Hono<AppEnv>()
          .use(owner)
          .route('/', profileInvitationRoutes(invitations, inviteLimiter)),
      )
      .route(
        '/:profileId/drafts',
        new Hono<AppEnv>()
          .use(member)
          .route('/', draftRoutes(store, handover, reviews, inviteLimiter)),
      )
      .route(
        '/:profileId/ideas',
        new Hono<AppEnv>()
          .use(member)
          .route('/', ideaRoutes(store, ideaLinks, brainstorm, research)),
      )
      .route(
        '/:profileId/sources',
        sourceRoutes(store, feeds, feedLimiter, member, feedItems, feedPosts),
      )
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
            (c) => ({ profileId: param(c, 'profileId'), ideaId: null }),
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
