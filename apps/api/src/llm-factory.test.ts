import { describe, expect, it } from 'vitest'
import { fakeLlmFactory, realLlmFactory } from './llm-factory'

describe('LLM factories', () => {
  it('builds an Anthropic client from a user’s credentials', () => {
    expect(
      realLlmFactory({ provider: 'anthropic', apiKey: 'sk-ant-x', model: 'claude-sonnet-5-5' })
        .name,
    ).toBe('anthropic')
  })

  it('has a fake for development that never needs a real key', async () => {
    const llm = fakeLlmFactory({ provider: 'anthropic', apiKey: 'anything', model: 'm' })
    expect(await llm.complete({ messages: [{ role: 'user', content: 'hi' }] })).toContain(
      'Fake response',
    )
  })
})
