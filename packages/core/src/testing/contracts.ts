import { describe, expect, it } from 'vitest'
import type { LLMChatEvent, LLMChatRequest, LLMProvider } from '../providers/llm'
import { MAX_FEED_ITEMS } from '../domain'
import { FeedError, MAX_FEED_CANDIDATES, type FeedFetcher } from '../providers/feeds'
import type { PageInfoFetcher } from '../providers/pages'
import type { ResearchProvider } from '../providers/research'
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
    /** A web page that advertises these feeds (of posts, then comments), in this order. */
    page?: { address: string; posts: string[]; comments: string[] }
    close?: () => Promise<void>
  }>,
) {
  describe(`FeedFetcher contract: ${name}`, () => {
    it('discovers a feed as the one feed at its own address', async () => {
      const { fetcher, feed, close } = await setup()
      try {
        const found = await fetcher.discover(feed)
        expect(found).toHaveLength(1)
        expect(found[0]!.url).toBe(feed)
        expect(found[0]!.comments).toBe(false)
      } finally {
        await close?.()
      }
    })

    it('discovers every feed a page advertises, with feeds of comments last', async () => {
      const { fetcher, page, close } = await setup()
      try {
        if (!page) return
        const found = await fetcher.discover(page.address)
        expect(found.map((c) => c.url)).toEqual([...page.posts, ...page.comments])
        expect(found.map((c) => c.comments)).toEqual([
          ...page.posts.map(() => false),
          ...page.comments.map(() => true),
        ])
        expect(found.length).toBeLessThanOrEqual(MAX_FEED_CANDIDATES)
      } finally {
        await close?.()
      }
    })

    it('reads the recent posts of a feed, each with an id, a title and a web address', async () => {
      const { fetcher, feed, close } = await setup()
      try {
        const result = await fetcher.readItems(feed)
        expect(result.status).toBe('modified')
        if (result.status !== 'modified') return
        expect(result.items.length).toBeGreaterThan(0)
        expect(result.items.length).toBeLessThanOrEqual(MAX_FEED_ITEMS)
        for (const item of result.items) {
          expect(item.id).not.toBe('')
          expect(item.title).not.toBe('')
          expect(new URL(item.url).protocol).toMatch(/^https?:$/)
          expect(Array.isArray(item.authors)).toBe(true)
          expect(item.publishedAt === null || !Number.isNaN(Date.parse(item.publishedAt))).toBe(
            true,
          )
        }
        expect(new Set(result.items.map((i) => i.id)).size).toBe(result.items.length)
      } finally {
        await close?.()
      }
    })

    it('answers not-modified when asked again with the validators it gave, if it gave any', async () => {
      const { fetcher, feed, close } = await setup()
      try {
        const first = await fetcher.readItems(feed)
        if (first.status !== 'modified') throw new Error('first read should be modified')
        const { etag, lastModified } = first.validators
        if (!etag && !lastModified) return // a source with no validators is read in full each time
        const again = await fetcher.readItems(feed, { validators: first.validators })
        expect(again.status).toBe('not-modified')
      } finally {
        await close?.()
      }
    })

    it('rejects reading posts when the address is not a feed or cannot be reached', async () => {
      const { fetcher, notAFeed, unreachable, close } = await setup()
      try {
        await expect(fetcher.readItems(notAFeed)).rejects.toMatchObject({ reason: 'not-a-feed' })
        await expect(fetcher.readItems(unreachable)).rejects.toBeInstanceOf(FeedError)
      } finally {
        await close?.()
      }
    })

    it('rejects discovery with a message for people when there is no feed', async () => {
      const { fetcher, notAFeed, unreachable, close } = await setup()
      try {
        const err = await fetcher.discover(notAFeed).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(FeedError)
        expect((err as FeedError).reason).toBe('not-a-feed')
        await expect(fetcher.discover(unreachable)).rejects.toBeInstanceOf(FeedError)
      } finally {
        await close?.()
      }
    })

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
    /** A page that names its authors. */
    authored: { url: string; authors: string[] }
  },
) {
  describe(`PageInfoFetcher contract: ${name}`, () => {
    it('returns the title of a page that has one', async () => {
      const info = await create().fetchInfo(scenarios.titled.url)
      expect(info).toEqual({ title: scenarios.titled.title })
    })

    it('returns who wrote a page that says so, and no authors key for one that does not', async () => {
      const info = await create().fetchInfo(scenarios.authored.url)
      expect(info.authors).toEqual(scenarios.authored.authors)
      expect('authors' in (await create().fetchInfo(scenarios.untitled))).toBe(false)
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

/**
 * Behaviour every ResearchProvider must satisfy. `create` is given the pages that its (pretend) web search
 * will turn up, as the address and title a search result would carry, plus an address the model might
 * "remember" that no search returned; the adapter must never pass that one on. A real adapter is run
 * against a stubbed client or with credentials, as for `llmProviderContract`.
 */
export function researchProviderContract(
  name: string,
  create: (searched: { url: string; title: string }[], invented: string) => ResearchProvider,
) {
  describe(`ResearchProvider contract: ${name}`, () => {
    const searched = [
      { url: 'https://one.example.org/a', title: 'Page one' },
      { url: 'https://two.example.org/b', title: 'Page two' },
      { url: 'https://three.example.org/c', title: 'Page three' },
    ]
    const invented = 'https://invented.example.org/never-searched'
    const request = {
      system: 'Find reading for the writer.',
      brief: 'Rivers that meander.',
      maxResults: 5,
    }

    it('has a name', () => {
      expect(create(searched, invented).name).not.toBe('')
    })

    it('returns pages with an address, a title and a reason', async () => {
      const found = await create(searched, invented).find(request)
      expect(found.length).toBeGreaterThan(0)
      for (const f of found) {
        expect(new URL(f.url).protocol).toMatch(/^https?:$/)
        expect(f.title).not.toBe('')
        expect(f.why).not.toBe('')
      }
    })

    it('only returns addresses that came from the search, never one the model supplied', async () => {
      const found = await create(searched, invented).find(request)
      expect(found.map((f) => f.url)).not.toContain(invented)
      for (const f of found) expect(searched.map((s) => s.url)).toContain(f.url)
    })

    it('titles each page as the search did', async () => {
      const found = await create(searched, invented).find(request)
      for (const f of found) {
        expect(f.title).toBe(searched.find((s) => s.url === f.url)!.title)
      }
    })

    it('returns each address once, and no more than asked for', async () => {
      const found = await create(searched, invented).find({ ...request, maxResults: 2 })
      expect(found.length).toBeLessThanOrEqual(2)
      expect(new Set(found.map((f) => f.url)).size).toBe(found.length)
    })

    it('rejects when the signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      await expect(
        create(searched, invented).find({ ...request, signal: controller.signal }),
      ).rejects.toThrow()
    })
  })
}
