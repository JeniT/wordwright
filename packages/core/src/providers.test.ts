import { describe, expect, it } from 'vitest'
import { FakeFeedFetcher } from './providers/feeds'
import { FakeLLMProvider } from './providers/fake-llm'
import { LLMRateLimitError } from './providers/llm'
import { FakePageInfoFetcher } from './providers/pages'
import { FakeSearchProvider } from './providers/search'
import {
  feedFetcherContract,
  llmProviderContract,
  pageInfoFetcherContract,
  searchProviderContract,
} from './testing'

llmProviderContract('fake', () => new FakeLLMProvider())
searchProviderContract(
  'fake',
  () =>
    new FakeSearchProvider([
      { title: 'anything', url: 'https://x.test', snippet: '', source: 'fake' },
    ]),
)

feedFetcherContract('fake', async () => ({
  fetcher: new FakeFeedFetcher({ 'https://a.example/feed': { title: 'A feed', icon: true } }),
  feed: 'https://a.example/feed',
  notAFeed: 'https://a.example/page',
  unreachable: 'https://unreachable.example/feed',
}))

pageInfoFetcherContract('fake', () => new FakePageInfoFetcher(), {
  titled: { url: 'https://example.org/a', title: 'Fake title for example.org' },
  untitled: 'https://example.org/untitled',
  missing: 'https://nonexistent.example.org/',
})

describe('FakeLLMProvider chat', () => {
  const ask = { messages: [{ role: 'user' as const, content: 'Is this idea any good?' }] }
  const run = async (llm: FakeLLMProvider, request = ask) => {
    const events = []
    for await (const event of llm.chat(request)) events.push(event)
    return events
  }

  it('replies to the last message by default and records what it was asked', async () => {
    const llm = new FakeLLMProvider()
    const events = await run(llm)
    expect(events.map((e) => (e.type === 'text' ? e.text : '')).join('')).toBe(
      'Fake reply to: Is this idea any good?',
    )
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'end' })
    expect(llm.chatCalls).toEqual([ask])
  })

  it('plays back scripted replies with tool calls, in order, with unique ids', async () => {
    const llm = new FakeLLMProvider(undefined, (_request, call) =>
      call === 1
        ? {
            text: 'Try this.',
            toolCalls: [
              { name: 'update_idea', input: { name: 'A' } },
              { name: 'create_idea', input: { name: 'B', notes: '' } },
            ],
          }
        : { text: 'Great.' },
    )
    const first = await run(llm)
    expect(first.map((e) => e.type)).toEqual(['text', 'text', 'tool_call', 'tool_call', 'done'])
    const calls = first.filter((e) => e.type === 'tool_call')
    expect(calls.map((c) => c.name)).toEqual(['update_idea', 'create_idea'])
    expect(new Set(calls.map((c) => c.id)).size).toBe(2)
    expect(first.at(-1)).toMatchObject({ stopReason: 'tool_use' })

    const second = await run(llm)
    expect(second.map((e) => e.type)).toEqual(['text', 'done'])
  })

  it('drops tool calls from a reply that was cut off, as a real provider does', async () => {
    const llm = new FakeLLMProvider(undefined, () => ({
      text: 'Partly',
      stopReason: 'max_tokens',
      toolCalls: [{ name: 'update_idea', input: {} }],
    }))
    const events = await run(llm)
    expect(events.some((e) => e.type === 'tool_call')).toBe(false)
    expect(events.at(-1)).toMatchObject({ stopReason: 'max_tokens' })
  })

  it('can simulate a refusal, custom usage, and a failure', async () => {
    const refusing = new FakeLLMProvider(undefined, () => ({
      stopReason: 'refusal',
      usage: { inputTokens: 7, outputTokens: 0, cachedInputTokens: 5 },
    }))
    expect((await run(refusing)).at(-1)).toEqual({
      type: 'done',
      stopReason: 'refusal',
      usage: { inputTokens: 7, outputTokens: 0, cachedInputTokens: 5 },
    })

    const limited = new FakeLLMProvider(undefined, () => {
      throw new LLMRateLimitError('slow down', 12)
    })
    await expect(run(limited)).rejects.toMatchObject({ retryAfterSeconds: 12 })
  })

  it('stops part-way when aborted', async () => {
    const controller = new AbortController()
    const llm = new FakeLLMProvider(undefined, () => ({ text: 'one two three four' }))
    const seen: string[] = []
    await expect(
      (async () => {
        for await (const event of llm.chat({ ...ask, signal: controller.signal })) {
          if (event.type === 'text') seen.push(event.text)
          controller.abort()
        }
      })(),
    ).rejects.toThrow()
    expect(seen).toEqual(['one '])
  })
})

describe('FakeLLMProvider', () => {
  it('records calls and supports custom responses', async () => {
    const llm = new FakeLLMProvider(() => 'custom')
    expect(await llm.complete({ messages: [{ role: 'user', content: 'hi' }] })).toBe('custom')
    expect(llm.calls).toHaveLength(1)
  })
})
