import { describe, expect, it } from 'vitest'
import { FakeLLMProvider } from './providers/fake-llm'
import { FakeSearchProvider } from './providers/search'
import { llmProviderContract, searchProviderContract } from './testing'

llmProviderContract('fake', () => new FakeLLMProvider())
searchProviderContract(
  'fake',
  () =>
    new FakeSearchProvider([
      { title: 'anything', url: 'https://x.test', snippet: '', source: 'fake' },
    ]),
)

describe('FakeLLMProvider', () => {
  it('records calls and supports custom responses', async () => {
    const llm = new FakeLLMProvider(() => 'custom')
    expect(await llm.complete({ messages: [{ role: 'user', content: 'hi' }] })).toBe('custom')
    expect(llm.calls).toHaveLength(1)
  })
})
