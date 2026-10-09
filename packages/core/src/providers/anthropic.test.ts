import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { AnthropicProvider } from './anthropic'
import { LLMAuthError } from './llm'

function providerWhere(create: () => Promise<unknown>, stream?: () => AsyncIterable<unknown>) {
  const client = { messages: { create, stream } } as unknown as Anthropic
  return new AnthropicProvider({ apiKey: 'k', client })
}
const request = { messages: [{ role: 'user' as const, content: 'hi' }] }
const apiError = (status: number) => Anthropic.APIError.generate(status, {}, 'nope', new Headers())

describe('AnthropicProvider', () => {
  it('joins text blocks and passes model, system prompt and limits through', async () => {
    let seen: Record<string, unknown> = {}
    const provider = new AnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      client: {
        messages: {
          create: async (params: Record<string, unknown>) => {
            seen = params
            return {
              content: [
                { type: 'text', text: 'Hello ' },
                { type: 'text', text: 'there' },
              ],
            }
          },
        },
      } as unknown as Anthropic,
    })
    expect(await provider.complete({ ...request, system: 'be brief', maxTokens: 5 })).toBe(
      'Hello there',
    )
    expect(seen).toMatchObject({ model: 'claude-haiku-5-5', system: 'be brief', max_tokens: 5 })
  })

  it.each([401, 403])('translates a %i into LLMAuthError', async (status) => {
    const provider = providerWhere(async () => {
      throw apiError(status)
    })
    await expect(provider.complete(request)).rejects.toBeInstanceOf(LLMAuthError)
  })

  it('leaves other failures alone', async () => {
    const provider = providerWhere(async () => {
      throw apiError(500)
    })
    const err = await provider.complete(request).catch((e) => e)
    expect(err).not.toBeInstanceOf(LLMAuthError)
    expect(err.status).toBe(500)
  })

  it('translates auth failures while streaming and yields text deltas', async () => {
    const good = providerWhere(
      async () => ({}),
      async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }
        yield { type: 'message_stop' }
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'b' } }
      },
    )
    let text = ''
    for await (const chunk of good.stream(request)) text += chunk
    expect(text).toBe('ab')

    const bad = providerWhere(
      async () => ({}),
      // eslint-disable-next-line require-yield
      async function* () {
        throw apiError(401)
      },
    )
    await expect(
      (async () => {
        for await (const _ of bad.stream(request)) void _
      })(),
    ).rejects.toBeInstanceOf(LLMAuthError)
  })
})
