import { describe, expect, it } from 'vitest'
import { FakeFeedFetcher } from './providers/feeds'
import { FakeLLMProvider } from './providers/fake-llm'
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

describe('FakeLLMProvider', () => {
  it('records calls and supports custom responses', async () => {
    const llm = new FakeLLMProvider(() => 'custom')
    expect(await llm.complete({ messages: [{ role: 'user', content: 'hi' }] })).toBe('custom')
    expect(llm.calls).toHaveLength(1)
  })
})
