import { describe, expect, it } from 'vitest'
import { FakeFeedFetcher } from './providers/feeds'
import { FakeLLMProvider } from './providers/fake-llm'
import { FakeSearchProvider } from './providers/search'
import { feedFetcherContract, llmProviderContract, searchProviderContract } from './testing'

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

describe('FakeLLMProvider', () => {
  it('records calls and supports custom responses', async () => {
    const llm = new FakeLLMProvider(() => 'custom')
    expect(await llm.complete({ messages: [{ role: 'user', content: 'hi' }] })).toBe('custom')
    expect(llm.calls).toHaveLength(1)
  })
})
