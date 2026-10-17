import { withShape } from '../services/icon-shape'
import { Hono, type MiddlewareHandler } from 'hono'
import {
  FeedError,
  MAX_SOURCES_PER_PUBLICATION,
  RECENT_DAYS_DEFAULT,
  PostRefsSchema,
  RECENT_DAYS_MAX,
  SourceInputSchema,
  SourceOrderSchema,
  type FeedFetcher,
} from '@wordwright/core'
import type { FeedItemService } from '../services/feed-items'
import type { FeedPostService } from '../services/feed-posts'
import type { AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'
import { validateJson } from '../validate'
import { imageResponse } from './image-response'
import { fail } from '../errors'
import { param } from './params'

/** Reading a feed can take a while; longer than this and the person is better told to try again. */
const ADD_TIMEOUT_MS = 20_000

/**
 * Mounted under `/publications/:publicationId`. Any member can read and change the list: it is shared
 * working material, like the drafts.
 */
export function sourceRoutes(
  store: Store,
  feeds: FeedFetcher,
  addLimiter: RateLimiter,
  member: MiddlewareHandler<AppEnv>,
  feedItems: FeedItemService,
  feedPosts: FeedPostService,
) {
  const { sources } = store
  const tooMany = () =>
    fail(
      409,
      `A publication can have up to ${MAX_SOURCES_PER_PUBLICATION} sources. Remove one you no longer read to make room.`,
    )
  const tooManyAdds = () => fail(429, 'You have added a lot of sources. Try again later.')
  const readFeed = (url: string, signal = AbortSignal.timeout(ADD_TIMEOUT_MS)) =>
    feeds.inspect(url, { signal }).catch((err: unknown) => {
      if (err instanceof FeedError) throw fail(422, err.message)
      throw err
    })
  const discover = (url: string, signal: AbortSignal) =>
    feeds.discover(url, { signal }).catch((err: unknown) => {
      if (err instanceof FeedError) throw fail(422, err.message)
      throw err
    })
  const duplicate = () => fail(409, 'That feed is already in your list.')

  return (
    new Hono<AppEnv>()
      .use(member)
      .get('/', (c) => c.json(sources.list(param(c, 'publicationId'))))

      .post('/', validateJson(SourceInputSchema), async (c) => {
        const publicationId = param(c, 'publicationId')
        const { url } = c.req.valid('json')
        if (sources.has(publicationId, url)) throw duplicate()
        if (sources.count(publicationId) >= MAX_SOURCES_PER_PUBLICATION) throw tooMany()
        // Each add makes our server fetch pages from the internet, so cap how many one person can start.
        if (!addLimiter.allow(c.get('user').id)) throw tooManyAdds()

        const signal = AbortSignal.timeout(ADD_TIMEOUT_MS)
        // A website may offer several feeds. Which one is wanted is the person's call, so say what
        // is on offer and add nothing; each choice then comes back here as an address of its own.
        const offered = await discover(url, signal)
        if (offered.length > 1) {
          return c.json({
            choices: offered.map((o) => ({
              ...o,
              alreadyAdded: sources.has(publicationId, o.url),
            })),
          })
        }

        // Read the feed first: it tells us what to call it, and refuses things that aren't feeds.
        const feed = await readFeed(offered[0]!.url, signal)
        const icon = await withShape(await feeds.fetchIcon(feed, { signal }))

        // The checks are repeated: other requests may have run while we were waiting on the network.
        // `feed.url` can differ from `url` (a website address led to its feed).
        return c.json(
          store.transaction(() => {
            if (sources.has(publicationId, feed.url)) throw duplicate()
            if (sources.count(publicationId) >= MAX_SOURCES_PER_PUBLICATION) throw tooMany()
            return sources.add(publicationId, feed.url, feed, icon)
          }),
          201,
        )
      })

      .get('/:id/icon', (c) => {
        const icon = sources.getIcon(param(c, 'publicationId'), param(c, 'id'))
        if (!icon) throw fail(404, 'Not found')
        return imageResponse(c, icon)
      })

      // The newest posts from all the feeds together. Registered before `/:id/...` routes.
      .get('/recent', async (c) => {
        const days = Number(c.req.query('days') ?? RECENT_DAYS_DEFAULT)
        if (!Number.isInteger(days) || days < 1 || days > RECENT_DAYS_MAX) {
          throw fail(400, `Choose between 1 and ${RECENT_DAYS_MAX} days.`)
        }
        return c.json(
          await feedItems.recent(
            c.get('user').id,
            param(c, 'publicationId'),
            sources.list(param(c, 'publicationId')),
            days,
            { refresh: c.req.query('refresh') === 'true' },
          ),
        )
      })

      // Deciding about posts of the combined list: put on the publication's reading list, ignore, or take back.
      .post('/recent/add', validateJson(PostRefsSchema), (c) =>
        c.json(
          feedPosts.add(param(c, 'publicationId'), c.get('user').id, c.req.valid('json').posts),
        ),
      )
      .post('/recent/ignore', validateJson(PostRefsSchema), (c) =>
        c.json(
          feedPosts.ignore(param(c, 'publicationId'), c.get('user').id, c.req.valid('json').posts),
        ),
      )
      .post('/recent/reconsider', validateJson(PostRefsSchema), (c) =>
        c.json(feedPosts.reconsider(param(c, 'publicationId'), c.req.valid('json').posts)),
      )

      // The feed's recent posts: the kept copy if it is recent, else the feed is asked again.
      .get('/:id/items', async (c) => {
        const source = sources.find(param(c, 'publicationId'), param(c, 'id'))
        if (!source) throw fail(404, 'Not found')
        return c.json(
          await feedItems.items(c.get('user').id, source, {
            refresh: c.req.query('refresh') === 'true',
          }),
        )
      })

      // Registered before `/:id` so that "order" is not taken for an id.
      .put('/order', validateJson(SourceOrderSchema), (c) => {
        const publicationId = param(c, 'publicationId')
        const ok = store.transaction(() => sources.reorder(publicationId, c.req.valid('json').ids))
        if (!ok) {
          throw fail(
            409,
            'The list has changed since you opened it. Reload the page and try again.',
          )
        }
        return c.json(sources.list(publicationId))
      })

      .delete('/:id', (c) => {
        const removed = store.transaction(() =>
          sources.remove(param(c, 'publicationId'), param(c, 'id')),
        )
        if (!removed) throw fail(404, 'Not found')
        return c.body(null, 204)
      })
  )
}
