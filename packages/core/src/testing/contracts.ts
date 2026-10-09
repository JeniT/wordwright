import { describe, expect, it } from 'vitest'
import type { LLMProvider } from '../providers/llm'
import { FeedError, type FeedFetcher } from '../providers/feeds'
import type { SearchProvider } from '../providers/search'

/**
 * Behaviour every LLMProvider must satisfy. Run it against the fake in CI and,
 * optionally, against real adapters with credentials.
 */
export function llmProviderContract(name: string, create: () => LLMProvider) {
  describe(`LLMProvider contract: ${name}`, () => {
    const request = { messages: [{ role: 'user' as const, content: 'Say hello' }] }

    it('has a name', () => {
      expect(create().name).not.toBe('')
    })

    it('completes with non-empty text', async () => {
      expect((await create().complete(request)).length).toBeGreaterThan(0)
    })

    it('streams chunks that concatenate to a non-empty string', async () => {
      let text = ''
      for await (const chunk of create().stream(request)) text += chunk
      expect(text.length).toBeGreaterThan(0)
    })

    it('rejects when the signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      await expect(create().complete({ ...request, signal: controller.signal })).rejects.toThrow()
    })
  })
}

export function searchProviderContract(name: string, create: () => SearchProvider) {
  describe(`SearchProvider contract: ${name}`, () => {
    it('returns an array respecting the limit', async () => {
      const results = await create().search('anything', { limit: 1 })
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeLessThanOrEqual(1)
    })
  })
}

/**
 * Behaviour every FeedFetcher must satisfy. `setup` supplies a fetcher plus addresses it can be
 * asked about: a working feed (with a title), an address that is not a feed, and one that can't be reached.
 */
export function feedFetcherContract(
  name: string,
  setup: () => Promise<{
    fetcher: FeedFetcher
    feed: string
    notAFeed: string
    unreachable: string
    close?: () => Promise<void>
  }>,
) {
  describe(`FeedFetcher contract: ${name}`, () => {
    it('reads the title of a feed and reports the address it was found at', async () => {
      const { fetcher, feed, close } = await setup()
      try {
        const details = await fetcher.inspect(feed)
        expect(details.title.trim()).not.toBe('')
        expect(() => new URL(details.url)).not.toThrow()
        expect(details.description === null || typeof details.description === 'string').toBe(true)
      } finally {
        await close?.()
      }
    })

    it('rejects, with a message for people, when the address is not a feed', async () => {
      const { fetcher, notAFeed, close } = await setup()
      try {
        const err = await fetcher.inspect(notAFeed).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(FeedError)
        expect((err as FeedError).reason).toBe('not-a-feed')
        expect((err as FeedError).message).not.toBe('')
      } finally {
        await close?.()
      }
    })

    it('rejects when the address cannot be reached', async () => {
      const { fetcher, unreachable, close } = await setup()
      try {
        await expect(fetcher.inspect(unreachable)).rejects.toBeInstanceOf(FeedError)
      } finally {
        await close?.()
      }
    })

    it('never rejects when asked for an icon, even if there is none', async () => {
      const { fetcher, feed, close } = await setup()
      try {
        const details = await fetcher.inspect(feed)
        const icon = await fetcher.fetchIcon(details)
        expect(icon === null || icon.data.length > 0).toBe(true)
        const missing = await fetcher.fetchIcon({
          url: 'https://nowhere.invalid/feed',
          title: 'x',
          description: null,
          siteUrl: 'https://nowhere.invalid',
          iconUrl: 'https://nowhere.invalid/logo.png',
        })
        expect(missing).toBeNull()
      } finally {
        await close?.()
      }
    })
  })
}
