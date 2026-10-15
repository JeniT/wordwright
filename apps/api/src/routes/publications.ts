import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  detectImageType,
  type FeedFetcher,
  MAX_IMAGE_BYTES,
  MAX_OWNED_PUBLICATIONS,
  MemberRoleInputSchema,
  PublicationDescriptionInputSchema,
  PublicationInputSchema,
  PublicationUpdateSchema,
} from '@lfwa/core'
import { requireMember, type AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import { validateJson } from '../validate'
import { assistRoutes } from './assist'
import { draftRoutes } from './drafts'
import { imageResponse } from './image-response'
import { ideaRoutes } from './ideas'
import { sourceRoutes } from './sources'
import { moveRoutes, publicationReadingRoutes } from './reading'
import { noteRoutes } from './notes'
import { NoteEditService } from '../services/note-edits'
import { MoveService } from '../services/moves'
import { FeedPostService } from '../services/feed-posts'
import type { BrainstormService } from '../services/brainstorm'
import type { ResearchService } from '../services/research'
import type { FeedItemService } from '../services/feed-items'
import type { IdeaLinkService } from '../services/idea-links'
import { handDraftsToOwner } from '../services/draft-editor'
import { publicationInvitationRoutes } from './invitations'
import type { RateLimiter } from '../auth/rate-limit'
import { publicationAttention } from '../services/attention'
import type { HandoverService } from '../services/handover'
import type { ReviewService } from '../services/reviews'
import type { InvitationService } from '../services/invitations'
import type { LlmKeyService } from '../services/llm'
import { fail } from '../errors'
import type { ExportService } from '../services/export'
import { throttleExport, zipResponse } from './zip-response'
import { ownerCannotLeaveMessage, setMemberRole } from '../services/owners'
import { param } from './params'
import { fetchSiteIcon } from '../services/site-icons'

export interface PublicationRouteDeps {
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

export function publicationRoutes({
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
}: PublicationRouteDeps) {
  const member = requireMember(store)
  const owner = requireMember(store, true)
  const noteEdits = new NoteEditService(store)
  const moves = new MoveService(store)
  const feedPosts = new FeedPostService(store)

  // Best effort, and throttled like adding a feed: each fetch makes the server visit a page the person typed.
  const siteIconFor = (userId: string, siteUrl: string) =>
    feedLimiter.allow(userId) ? fetchSiteIcon(feeds, siteUrl) : Promise.resolve(null)

  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(store.publications.listForUser(c.get('user').id)))

      .post('/', validateJson(PublicationInputSchema), async (c) => {
        const user = c.get('user')
        if (store.publications.countOwnedBy(user.id) >= MAX_OWNED_PUBLICATIONS) {
          throw fail(
            409,
            `You can have up to ${MAX_OWNED_PUBLICATIONS} publications. Delete one you no longer use to make room.`,
          )
        }
        const { name, siteUrl } = c.req.valid('json')
        const icon = siteUrl ? await siteIconFor(user.id, siteUrl) : null
        const id = store.transaction(() => {
          const created = store.publications.create(name, user.id, siteUrl ?? null)
          if (icon) store.publications.setSiteIcon(created, icon)
          return created
        })
        return c.json(store.publications.get(id, user.id), 201)
      })

      // What is waiting on this person, for the landing page.
      .get('/:publicationId/attention', member, (c) =>
        c.json(publicationAttention(store, param(c, 'publicationId'), c.get('user').id)),
      )

      .get('/:publicationId', member, (c) =>
        c.json(store.publications.get(param(c, 'publicationId'), c.get('user').id)),
      )

      .patch('/:publicationId', owner, validateJson(PublicationUpdateSchema), async (c) => {
        const user = c.get('user')
        const changes = c.req.valid('json')
        const current = store.publications.get(param(c, 'publicationId'), user.id)
        // The network comes first, outside the transaction. Only a different website has a different icon.
        const websiteChanged = changes.siteUrl !== undefined && changes.siteUrl !== current?.siteUrl
        const icon =
          websiteChanged && changes.siteUrl ? await siteIconFor(user.id, changes.siteUrl) : null
        // One transaction: the name, the website, its icon and the new address change together or not at all.
        const id = store.transaction(() => {
          const next = store.publications.update(param(c, 'publicationId'), changes)
          if (websiteChanged) store.publications.setSiteIcon(next, icon)
          return next
        })
        return c.json(store.publications.get(id, user.id))
      })

      // Anyone who works in the publication can describe it, unlike its name and website, which are the owner's.
      .put(
        '/:publicationId/description',
        member,
        validateJson(PublicationDescriptionInputSchema),
        (c) => {
          const id = param(c, 'publicationId')
          store.publications.setDescription(id, c.req.valid('json').description)
          return c.json(store.publications.get(id, c.get('user').id))
        },
      )

      .delete('/:publicationId', owner, (c) => {
        store.publications.delete(param(c, 'publicationId'))
        return c.body(null, 204)
      })

      // Everything of theirs in this publication, as Markdown (#167); which drafts depends on their role.
      .get('/:publicationId/export', member, (c) => {
        const user = c.get('user')
        throttleExport(exportLimiter, user.id)
        return zipResponse(c, exports.publication(param(c, 'publicationId'), user))
      })

      // The picture is raw bytes in the request body. What it is gets decided by looking at the
      // bytes, never by the Content-Type the client claims.
      .get('/:publicationId/image', member, (c) => {
        const image = store.publications.getImage(param(c, 'publicationId'))
        if (!image) throw fail(404, 'Not found')
        return imageResponse(c, image)
      })

      .get('/:publicationId/site-icon', member, (c) => {
        const icon = store.publications.getSiteIcon(param(c, 'publicationId'))
        if (!icon) throw fail(404, 'Not found')
        return imageResponse(c, icon)
      })

      .put(
        '/:publicationId/image',
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
          const id = param(c, 'publicationId')
          const data = new Uint8Array(await c.req.arrayBuffer())
          const contentType = detectImageType(data)
          if (!contentType) {
            throw fail(
              415,
              'That file is not a PNG, JPEG, WebP or GIF image. Choose a different one.',
            )
          }
          store.publications.setImage(id, { contentType, data })
          return c.json(store.publications.get(id, c.get('user').id))
        },
      )

      .delete('/:publicationId/image', owner, (c) => {
        store.publications.deleteImage(param(c, 'publicationId'))
        return c.body(null, 204)
      })

      .put(
        '/:publicationId/members/:userId/role',
        owner,
        validateJson(MemberRoleInputSchema),
        (c) => {
          const id = param(c, 'publicationId')
          setMemberRole(store, id, c.get('user').id, param(c, 'userId'), c.req.valid('json').role)
          return c.json(store.publications.get(id, c.get('user').id))
        },
      )

      // Owners remove others; anyone can remove themselves, except an owner, who steps down first
      // (or makes someone else an owner, or deletes the publication).
      .delete('/:publicationId/members/:userId', member, (c) => {
        const id = param(c, 'publicationId')
        const me = c.get('user').id
        const targetId = param(c, 'userId')
        const isOwner = c.get('role') === 'owner'
        if (targetId !== me && !isOwner) throw fail(403, 'Owner only')
        if (targetId === me && isOwner) {
          throw fail(400, ownerCannotLeaveMessage(store, id, me))
        }
        if (!store.publications.roleOf(id, targetId)) throw fail(404, 'Not found')
        store.transaction(() => {
          store.publications.removeMember(id, targetId)
          handDraftsToOwner(store, id, targetId)
        })
        return c.body(null, 204)
      })

      .route(
        '/:publicationId/invitations',
        new Hono<AppEnv>()
          .use(owner)
          .route('/', publicationInvitationRoutes(invitations, inviteLimiter)),
      )
      .route(
        '/:publicationId/drafts',
        new Hono<AppEnv>()
          .use(member)
          .route('/', draftRoutes(store, handover, reviews, inviteLimiter)),
      )
      .route(
        '/:publicationId/ideas',
        new Hono<AppEnv>()
          .use(member)
          .route('/', ideaRoutes(store, ideaLinks, brainstorm, research)),
      )
      .route(
        '/:publicationId/sources',
        sourceRoutes(store, feeds, feedLimiter, member, feedItems, feedPosts),
      )
      // The publication's own reading list and notes, gathered before there is an idea.
      .route(
        '/:publicationId/reading',
        new Hono<AppEnv>().use(member).route('/', publicationReadingRoutes(store, ideaLinks)),
      )
      .route(
        '/:publicationId/notes',
        new Hono<AppEnv>().use(member).route(
          '/',
          noteRoutes(
            store,
            noteEdits,
            (c) => ({ publicationId: param(c, 'publicationId'), ideaId: null }),
            {
              drafts: false,
            },
          ),
        ),
      )
      .route('/:publicationId/move', new Hono<AppEnv>().use(member).route('/', moveRoutes(moves)))
      .route(
        '/:publicationId/assist',
        new Hono<AppEnv>().use(member).route('/', assistRoutes(store, llmKeys)),
      )
  )
}
