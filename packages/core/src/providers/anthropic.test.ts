import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { AnthropicProvider } from './anthropic'
import { llmProviderContract } from '../testing'
import { LLMAuthError, LLMProviderError, LLMRateLimitError } from './llm'

function providerWhere(create: () => Promise<unknown>, stream?: () => AsyncIterable<unknown>) {
  const client = { messages: { create, stream } } as unknown as Anthropic
  return new AnthropicProvider({ apiKey: 'k', client })
}
const request = { messages: [{ role: 'user' as const, content: 'hi' }] }
const apiError = (status: number) => Anthropic.APIError.generate(status, {}, 'nope', new Headers())

/** The SDK's `models.list()` is an async-iterable page, newest model first. */
function providerListing(models: unknown[] | (() => never)) {
  const list = () => ({
    async *[Symbol.asyncIterator]() {
      if (typeof models === 'function') models()
      else yield* models
    },
  })
  return new AnthropicProvider({
    apiKey: 'k',
    client: { models: { list } } as unknown as Anthropic,
  })
}

const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  display_name: id.replace('claude-', 'Claude '),
  lifecycle: 'active',
  line: null,
  created_at: '2026-01-01T00:00:00Z',
  ...extra,
})

describe('AnthropicProvider listModels', () => {
  it("returns each chat model with the provider's own display name, in the order given", async () => {
    const provider = providerListing([
      { ...model('claude-opus-5-5'), display_name: 'Claude Opus 5.5' },
      { ...model('claude-haiku-5-5'), display_name: 'Claude Haiku 5.5' },
    ])
    expect(await provider.listModels()).toEqual([
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', latest: true },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', latest: true },
    ])
  })

  it('falls back to the id when there is no display name, and ignores anything that is not a Claude model', async () => {
    const provider = providerListing([
      model('claude-x', { display_name: '' }),
      model('embedding-1'),
    ])
    expect(await provider.listModels()).toEqual([
      { id: 'claude-x', label: 'claude-x', latest: true },
    ])
  })

  it('leaves out deprecated and retired models, which are not for new choices (#218)', async () => {
    const provider = providerListing([
      model('claude-opus-5'),
      model('claude-opus-4-5', { lifecycle: 'deprecated' }),
      model('claude-opus-4', { lifecycle: 'retired' }),
    ])
    expect((await provider.listModels()).map((m) => m.id)).toEqual(['claude-opus-5'])
  })

  it('marks the newest model in each line as latest, and keeps older active ones unmarked (#218)', async () => {
    const provider = providerListing([
      model('claude-haiku-5-5', { line: 'haiku', created_at: '2026-06-01T00:00:00Z' }),
      model('claude-opus-5-5', { line: 'opus', created_at: '2026-06-01T00:00:00Z' }),
      model('claude-opus-4-8', { line: 'opus', created_at: '2026-03-01T00:00:00Z' }),
      model('claude-opus-5', { line: 'opus', created_at: '2026-05-01T00:00:00Z' }),
    ])
    expect(await provider.listModels()).toEqual([
      { id: 'claude-haiku-5-5', label: 'Claude haiku-5-5', latest: true },
      { id: 'claude-opus-5-5', label: 'Claude opus-5-5', latest: true },
      { id: 'claude-opus-4-8', label: 'Claude opus-4-8', latest: false },
      { id: 'claude-opus-5', label: 'Claude opus-5', latest: false },
    ])
  })

  it('still marks something latest in a line whose models have no release date, so there is always a choice', async () => {
    const provider = providerListing([
      model('claude-a', { line: 'opus', created_at: undefined }),
      model('claude-b', { line: 'opus', created_at: undefined }),
    ])
    expect((await provider.listModels()).map((m) => m.latest)).toEqual([true, true])
  })

  it('treats a model with no line as latest, since we cannot tell what it replaces (#218)', async () => {
    const provider = providerListing([
      model('claude-a', { line: null, created_at: '2025-01-01T00:00:00Z' }),
      model('claude-b', { line: null, created_at: '2026-01-01T00:00:00Z' }),
    ])
    expect((await provider.listModels()).map((m) => m.latest)).toEqual([true, true])
  })

  it('translates a rejected key into LLMAuthError', async () => {
    const provider = providerListing(() => {
      throw apiError(401)
    })
    await expect(provider.listModels()).rejects.toBeInstanceOf(LLMAuthError)
  })

  it('translates other failures into LLMProviderError', async () => {
    const provider = providerListing(() => {
      throw apiError(500)
    })
    await expect(provider.listModels()).rejects.toBeInstanceOf(LLMProviderError)
  })
})

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

  it('translates other failures into LLMProviderError, without echoing the request', async () => {
    const provider = providerWhere(async () => {
      throw apiError(500)
    })
    const err = await provider.complete(request).catch((e) => e)
    expect(err).toBeInstanceOf(LLMProviderError)
    expect(err.message).toBe('Anthropic returned an error (500)')
    expect((err.cause as { status?: number }).status).toBe(500)
  })

  it('translates a 429 into LLMRateLimitError, with the wait the provider asked for', async () => {
    const limited = (headers: Record<string, string>) =>
      providerWhere(async () => {
        throw Anthropic.APIError.generate(429, {}, 'slow', new Headers(headers))
      })
    expect(
      await limited({ 'retry-after': '30' })
        .complete(request)
        .catch((e) => e),
    ).toMatchObject({
      name: 'LLMRateLimitError',
      retryAfterSeconds: 30,
    })
    const noHint = await limited({})
      .complete(request)
      .catch((e) => e)
    expect(noHint).toBeInstanceOf(LLMRateLimitError)
    expect(noHint.retryAfterSeconds).toBeUndefined()
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

describe('AnthropicProvider.chat', () => {
  const final = (overrides: Record<string, unknown> = {}) => ({
    stop_reason: 'end_turn',
    content: [],
    usage: { input_tokens: 11, output_tokens: 5, cache_read_input_tokens: null },
    ...overrides,
  })

  /** A client whose `messages.stream()` records its arguments and replays `events` then `message`. */
  function chatWith(events: unknown[], message: unknown = final(), failWith?: unknown) {
    const seen: {
      params?: { messages: { role: string; content: unknown }[] } & Record<string, unknown>
      options?: { signal?: AbortSignal }
    } = {}
    const client = {
      messages: {
        stream: (params: NonNullable<typeof seen.params>, options: typeof seen.options) => {
          seen.params = params
          seen.options = options
          return {
            async *[Symbol.asyncIterator]() {
              if (failWith) throw failWith
              for (const event of events) yield event
            },
            finalMessage: async () => message,
          }
        },
      },
    } as unknown as Anthropic
    return {
      provider: new AnthropicProvider({ apiKey: 'k', model: 'claude-haiku-5-5', client }),
      seen,
    }
  }
  const text = (t: string) => ({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: t },
  })
  const run = async (
    provider: AnthropicProvider,
    req: Parameters<AnthropicProvider['chat']>[0],
  ) => {
    const events = []
    for await (const event of provider.chat(req)) events.push(event)
    return events
  }
  const ask = { messages: [{ role: 'user' as const, content: 'hi' }] }

  it('sends the model, system prompt and a generous default limit, and no sampling options', async () => {
    const { provider, seen } = chatWith([text('a')])
    await run(provider, { ...ask, system: 'be brief' })
    expect(seen.params).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'be brief',
      max_tokens: 8192,
      messages: [{ role: 'user', content: 'hi' }],
    })
    for (const key of ['temperature', 'top_p', 'top_k', 'thinking', 'tools', 'output_config']) {
      expect(seen.params).not.toHaveProperty(key)
    }
  })

  it('passes a limit, effort and the abort signal through', async () => {
    const controller = new AbortController()
    const { provider, seen } = chatWith([])
    await run(provider, { ...ask, maxTokens: 100, effort: 'low', signal: controller.signal })
    expect(seen.params).toMatchObject({ max_tokens: 100, output_config: { effort: 'low' } })
    expect(seen.options?.signal).toBe(controller.signal)
  })

  it('maps tools, and tool calls and results in the history, with results first', async () => {
    const { provider, seen } = chatWith([])
    await run(provider, {
      messages: [
        { role: 'user', content: 'Suggest a title.' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Maybe:' },
            { type: 'tool_call', id: 'c1', name: 'update_idea', input: { name: 'N' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Thanks' },
            { type: 'text', text: '' }, // empty text blocks are dropped: the API rejects them
            { type: 'tool_result', toolCallId: 'c1', content: 'accepted', isError: false },
          ],
        },
      ],
      tools: [
        {
          name: 'update_idea',
          description: 'Propose',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    })
    expect(seen.params?.tools).toEqual([
      {
        name: 'update_idea',
        description: 'Propose',
        input_schema: { type: 'object', properties: {} },
      },
    ])
    expect(seen.params?.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Maybe:' },
        { type: 'tool_use', id: 'c1', name: 'update_idea', input: { name: 'N' } },
      ],
    })
    expect(seen.params?.messages[2]?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'c1', content: 'accepted', is_error: false },
      { type: 'text', text: 'Thanks' },
    ])
  })

  it('yields text as it arrives, then tool calls, then done with usage', async () => {
    const { provider } = chatWith(
      [text('Hel'), { type: 'message_stop' }, text('lo')],
      final({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: 'toolu_1', name: 'update_idea', input: { name: 'X' } },
        ],
        usage: { input_tokens: 20, output_tokens: 9, cache_read_input_tokens: 15 },
      }),
    )
    expect(await run(provider, ask)).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'tool_call', id: 'toolu_1', name: 'update_idea', input: { name: 'X' } },
      {
        type: 'done',
        stopReason: 'tool_use',
        usage: { inputTokens: 20, outputTokens: 9, cachedInputTokens: 15 },
      },
    ])
  })

  it('reports no tool call from a reply cut off at the token limit', async () => {
    const { provider } = chatWith(
      [text('Partly')],
      final({
        stop_reason: 'max_tokens',
        content: [{ type: 'tool_use', id: 't', name: 'update_idea', input: { name: 'Half-wri' } }],
      }),
    )
    const events = await run(provider, ask)
    expect(events.some((e) => e.type === 'tool_call')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'max_tokens' })
  })

  it.each([
    ['end_turn', 'end'],
    ['stop_sequence', 'end'],
    ['pause_turn', 'end'],
    ['max_tokens', 'max_tokens'],
    ['model_context_window_exceeded', 'max_tokens'],
    ['refusal', 'refusal'],
    ['tool_use', 'tool_use'],
  ])('maps the stop reason %s to %s', async (from, to) => {
    const { provider } = chatWith([], final({ stop_reason: from }))
    expect((await run(provider, ask)).at(-1)).toMatchObject({ stopReason: to })
  })

  describe('failures', () => {
    const failing = (error: unknown) => chatWith([], final(), error).provider

    it.each([401, 403])('translates a %i into LLMAuthError', async (status) => {
      await expect(run(failing(apiError(status)), ask)).rejects.toBeInstanceOf(LLMAuthError)
    })

    it('translates a 429 into LLMRateLimitError', async () => {
      const err = Anthropic.APIError.generate(429, {}, 'slow', new Headers({ 'retry-after': '8' }))
      await expect(run(failing(err), ask)).rejects.toMatchObject({
        name: 'LLMRateLimitError',
        retryAfterSeconds: 8,
      })
    })

    it.each([500, 529])('translates a %i into LLMProviderError', async (status) => {
      await expect(run(failing(apiError(status)), ask)).rejects.toBeInstanceOf(LLMProviderError)
    })

    it('translates a connection failure into LLMProviderError', async () => {
      const err = new Anthropic.APIConnectionError({ message: 'socket hang up' })
      await expect(run(failing(err), ask)).rejects.toMatchObject({
        name: 'LLMProviderError',
        message: 'Anthropic could not be reached',
      })
    })

    it('does not call the provider when already aborted, and passes aborts through untranslated', async () => {
      const controller = new AbortController()
      controller.abort()
      const { provider, seen } = chatWith([])
      await expect(run(provider, { ...ask, signal: controller.signal })).rejects.toThrow()
      expect(seen.params).toBeUndefined()

      const aborted = new Anthropic.APIUserAbortError()
      await expect(run(failing(aborted), ask)).rejects.toBe(aborted)
    })
  })
})

// The shared contract against the real service. Skipped unless a key is set, since it spends a few tokens:
//   ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @wordwright/core test
if (process.env.ANTHROPIC_API_KEY) {
  llmProviderContract(
    'anthropic (live)',
    () =>
      new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-haiku-5-5' }),
  )
}
