import { FakeFeedFetcher, type FeedFetcher } from '@lfwa/core'
import type { Config } from '../config'
import { HttpFeedFetcher } from './http-feed-fetcher'

/**
 * A fake that treats every `*.example` address as a feed named after its host (with a logo), except
 * those containing "notafeed" or "unreachable", so e2e tests can see both outcomes without a network.
 */
export const exampleFeeds = () =>
  new FakeFeedFetcher({}, (address) => {
    const { host } = new URL(address)
    return host.endsWith('.example') && !address.includes('notafeed')
      ? {
          title: `Feed of ${host}`,
          description: `Posts from ${host}`,
          siteUrl: `https://${host}/`,
          icon: true,
        }
      : undefined
  })

export const createFeedFetcher = (config: Pick<Config, 'FAKE_FEEDS'>): FeedFetcher =>
  config.FAKE_FEEDS ? exampleFeeds() : new HttpFeedFetcher()
