import { Hono, type MiddlewareHandler } from 'hono'
import { VenuePostsInputSchema, VenueSamplesInputSchema } from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'
import { fail } from '../errors'
import type { VenueSampleService } from '../services/venue-samples'
import { validateJson } from '../validate'
import { param } from './params'

/**
 * Mounted under `/profiles/:profileId`. Both routes make our server fetch other people's pages, so they are
 * throttled per person, and they read and store nothing of the profile: they only help to choose and read posts.
 */
export function venueRoutes(
  store: Store,
  service: VenueSampleService,
  limiter: RateLimiter,
  member: MiddlewareHandler<AppEnv>,
) {
  const throttle = (userId: string) => {
    if (!limiter.allow(userId)) {
      throw fail(429, 'You have looked at a lot of sample posts. Try again in a little while.')
    }
  }

  return (
    new Hono<AppEnv>()
      .use(member)

      // The venue's newest posts, from its own site (or the address given, if the website isn't saved yet).
      .post('/posts', validateJson(VenuePostsInputSchema), async (c) => {
        throttle(c.get('user').id)
        const profile = store.profiles.get(param(c, 'profileId'), c.get('user').id)
        const siteUrl = c.req.valid('json').siteUrl ?? profile?.siteUrl
        if (!siteUrl) {
          throw fail(400, 'Add the venue’s website first, or paste links to a few of its posts.')
        }
        return c.json(await service.recentPosts(siteUrl))
      })

      .post('/samples', validateJson(VenueSamplesInputSchema), async (c) => {
        throttle(c.get('user').id)
        return c.json({ samples: await service.read(c.req.valid('json').urls) })
      })
  )
}
