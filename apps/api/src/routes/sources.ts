import { Hono, type MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  FeedError,
  MAX_SOURCES_PER_PROFILE,
  SourceInputSchema,
  SourceOrderSchema,
  type FeedFetcher,
} from '@lfwa/core'
import type { FeedItemService } from '../services/feed-items'
import type { AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'
import { validateJson } from '../validate'
import { imageResponse } from './image-response'

/** Reading a feed can take a while; longer than this and the person is better told to try again. */
const ADD_TIMEOUT_MS = 20_000

/**
 * Mounted under `/profiles/:profileId`. Any member can read and change the list: it is shared
 * working material, like the drafts.
 */
export function sourceRoutes(
  store: Store,
  feeds: FeedFetcher,
  addLimiter: RateLimiter,
  member: MiddlewareHandler<AppEnv>,
  feedItems: FeedItemService,
) {
  const { sources } = store
  const tooMany = () =>
    new HTTPException(409, {
      message: `A profile can have up to ${MAX_SOURCES_PER_PROFILE} sources. Remove one you no longer read to make room.`,
    })
  const tooManyAdds = () =>
    new HTTPException(429, { message: 'You have added a lot of sources. Try again later.' })
  const readFeed = (url: string, signal = AbortSignal.timeout(ADD_TIMEOUT_MS)) =>
    feeds.inspect(url, { signal }).catch((err: unknown) => {
      if (err instanceof FeedError) throw new HTTPException(422, { message: err.message })
      throw err
    })
  const discover = (url: string, signal: AbortSignal) =>
    feeds.discover(url, { signal }).catch((err: unknown) => {
      if (err instanceof FeedError) throw new HTTPException(422, { message: err.message })
      throw err
    })
  const duplicate = () => new HTTPException(409, { message: 'That feed is already in your list.' })

  return (
    new Hono<AppEnv>()
      .use(member)
      .get('/', (c) => c.json(sources.list(c.req.param('profileId')!)))

      .post('/', validateJson(SourceInputSchema), async (c) => {
        const profileId = c.req.param('profileId')!
        const { url } = c.req.valid('json')
        if (sources.has(profileId, url)) throw duplicate()
        if (sources.count(profileId) >= MAX_SOURCES_PER_PROFILE) throw tooMany()
        // Each add makes our server fetch pages from the internet, so cap how many one person can start.
        if (!addLimiter.allow(c.get('user').id)) throw tooManyAdds()

        const signal = AbortSignal.timeout(ADD_TIMEOUT_MS)
        // A website may offer several feeds. Which one is wanted is the person's call, so say what
        // is on offer and add nothing; each choice then comes back here as an address of its own.
        const offered = await discover(url, signal)
        if (offered.length > 1) {
          return c.json({
            choices: offered.map((o) => ({ ...o, alreadyAdded: sources.has(profileId, o.url) })),
          })
        }

        // Read the feed first: it tells us what to call it, and refuses things that aren't feeds.
        const feed = await readFeed(offered[0]!.url, signal)
        const icon = await feeds.fetchIcon(feed, { signal })

        // The checks are repeated: other requests may have run while we were waiting on the network.
        // `feed.url` can differ from `url` (a website address led to its feed).
        return c.json(
          store.transaction(() => {
            if (sources.has(profileId, feed.url)) throw duplicate()
            if (sources.count(profileId) >= MAX_SOURCES_PER_PROFILE) throw tooMany()
            return sources.add(profileId, feed.url, feed, icon)
          }),
          201,
        )
      })

      .get('/:id/icon', (c) => {
        const icon = sources.getIcon(c.req.param('profileId')!, c.req.param('id'))
        if (!icon) throw new HTTPException(404, { message: 'Not found' })
        return imageResponse(c, icon)
      })

      // The feed's recent posts: the kept copy if it is recent, else the feed is asked again.
      .get('/:id/items', async (c) => {
        const source = sources.find(c.req.param('profileId')!, c.req.param('id'))
        if (!source) throw new HTTPException(404, { message: 'Not found' })
        return c.json(
          await feedItems.items(c.get('user').id, source, {
            refresh: c.req.query('refresh') === 'true',
          }),
        )
      })

      // Registered before `/:id` so that "order" is not taken for an id.
      .put('/order', validateJson(SourceOrderSchema), (c) => {
        const profileId = c.req.param('profileId')!
        const ok = store.transaction(() => sources.reorder(profileId, c.req.valid('json').ids))
        if (!ok) {
          throw new HTTPException(409, {
            message: 'The list has changed since you opened it. Reload the page and try again.',
          })
        }
        return c.json(sources.list(profileId))
      })

      .delete('/:id', (c) => {
        const removed = store.transaction(() =>
          sources.remove(c.req.param('profileId')!, c.req.param('id')),
        )
        if (!removed) throw new HTTPException(404, { message: 'Not found' })
        return c.body(null, 204)
      })
  )
}
