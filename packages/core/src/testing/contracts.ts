import { describe, expect, it } from 'vitest'
import type { LLMChatEvent, LLMChatRequest, LLMProvider } from '../providers/llm'
import { FeedError, type FeedFetcher } from '../providers/feeds'
import type { PageInfoFetcher } from '../providers/pages'
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

    describe('chat', () => {
      const chatRequest: LLMChatRequest = {
        system: 'You are brief.',
        messages: [{ role: 'user', content: 'Say hello' }],
      }
      const collect = async (provider: LLMProvider, req: LLMChatRequest) => {
        const events: LLMChatEvent[] = []
        for await (const event of provider.chat(req)) events.push(event)
        return events
      }

      it('streams text and ends with exactly one done event carrying a stop reason and usage', async () => {
        const events = await collect(create(), chatRequest)
        expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
        const done = events.at(-1)!
        expect(done.type).toBe('done')
        if (done.type !== 'done') return
        expect(['end', 'max_tokens', 'tool_use', 'refusal']).toContain(done.stopReason)
        expect(done.usage.inputTokens).toBeGreaterThanOrEqual(0)
        expect(done.usage.outputTokens).toBeGreaterThanOrEqual(0)
        const text = events.map((e) => (e.type === 'text' ? e.text : '')).join('')
        expect(text.length).toBeGreaterThan(0)
      })

      it('only reports tool calls that name a declared tool, with an object input and an id', async () => {
        const tools = [
          {
            name: 'update_idea',
            description: 'Propose a new title for the idea.',
            inputSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
        ]
        const events = await collect(create(), { ...chatRequest, tools })
        for (const event of events) {
          if (event.type !== 'tool_call') continue
          expect(event.id).not.toBe('')
          expect(tools.map((t) => t.name)).toContain(event.name)
          expect(typeof event.input).toBe('object')
        }
      })

      it('accepts a conversation that already contains a tool call and its result', async () => {
        const events = await collect(create(), {
          messages: [
            { role: 'user', content: 'Suggest a title.' },
            {
              role: 'assistant',
              content: [
                { type: 'text', text: 'How about this?' },
                { type: 'tool_call', id: 'call-1', name: 'update_idea', input: { name: 'New' } },
              ],
            },
            {
              role: 'user',
              content: [
                { type: 'tool_result', toolCallId: 'call-1', content: 'The person accepted it.' },
                { type: 'text', text: 'Thanks. What next?' },
              ],
            },
          ],
          tools: [
            {
              name: 'update_idea',
              description: 'Propose a new title for the idea.',
              inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
            },
          ],
        })
        expect(events.at(-1)?.type).toBe('done')
      })

      it('rejects when the signal is already aborted', async () => {
        const controller = new AbortController()
        controller.abort()
        await expect(
          collect(create(), { ...chatRequest, signal: controller.signal }),
        ).rejects.toThrow()
      })
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

/**
 * Behaviour every PageInfoFetcher must satisfy. The caller says which addresses to try, because a
 * real adapter needs a server (or stubbed DNS) behind them.
 */
export function pageInfoFetcherContract(
  name: string,
  create: () => PageInfoFetcher,
  scenarios: {
    titled: { url: string; title: string }
    untitled: string
    /** An address whose site doesn't exist. */
    missing: string
  },
) {
  describe(`PageInfoFetcher contract: ${name}`, () => {
    it('returns the title of a page that has one', async () => {
      const info = await create().fetchInfo(scenarios.titled.url)
      expect(info).toEqual({ title: scenarios.titled.title })
    })

    it('returns no title, and no problem, for a page without one', async () => {
      expect(await create().fetchInfo(scenarios.untitled)).toEqual({ title: null })
    })

    it('says so when the site does not exist', async () => {
      expect(await create().fetchInfo(scenarios.missing)).toEqual({
        title: null,
        problem: 'not-found',
      })
    })

    it('resolves with no title, rather than throwing, when already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      expect(await create().fetchInfo(scenarios.titled.url, controller.signal)).toEqual({
        title: null,
      })
    })
  })
}
