import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { AnthropicResearchProvider, keepSearched } from './anthropic-research'
import { LLMAuthError, LLMProviderError } from './llm'
import { researchProviderContract } from '../testing'

const searchResult = (r: { url: string; title: string }) => ({
  type: 'web_search_result',
  url: r.url,
  title: r.title,
  page_age: null,
  encrypted_content: 'x',
})

/** A client whose model searches (finding `searched`), then answers as if from memory too. */
function clientFor(searched: { url: string; title: string }[], invented: string) {
  const answer = JSON.stringify([
    ...searched.map((s) => ({ url: s.url, why: `Worth reading: ${s.title}.` })),
    { url: invented, why: 'I remember this one.' },
    { url: searched[0]!.url, why: 'Said twice.' },
  ])
  return {
    messages: {
      create: async (_params: unknown, options?: { signal?: AbortSignal }) => {
        options?.signal?.throwIfAborted()
        return {
          stop_reason: 'end_turn',
          content: [
            { type: 'text', text: 'Let me search.' },
            { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } },
            {
              type: 'web_search_tool_result',
              tool_use_id: 's1',
              content: searched.map(searchResult),
            },
            { type: 'text', text: `Here you go:\n${answer}` },
          ],
        }
      },
    },
  } as unknown as Anthropic
}

researchProviderContract(
  'anthropic (stubbed client)',
  (searched, invented) =>
    new AnthropicResearchProvider({ apiKey: 'k', client: clientFor(searched, invented) }),
)

const request = { system: 'Find reading for the writer.', brief: 'Rivers.', maxResults: 5 }
const apiError = (status: number) => Anthropic.APIError.generate(status, {}, 'nope', new Headers())

describe('AnthropicResearchProvider', () => {
  it('asks for the web search tool, with the app instructions first, and the model it was given', async () => {
    let seen: Record<string, unknown> = {}
    const client = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          seen = params
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: '[]' }] }
        },
      },
    } as unknown as Anthropic
    const provider = new AnthropicResearchProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      client,
    })
    expect(await provider.find(request)).toEqual([])
    expect(seen.model).toBe('claude-haiku-5-5')
    expect(String(seen.system).startsWith('Find reading for the writer.')).toBe(true)
    expect(seen.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }])
    expect(seen.messages).toEqual([{ role: 'user', content: 'Rivers.' }])
  })

  it('carries on when the provider pauses a long search, and keeps what the earlier turns found', async () => {
    const turns: unknown[][] = []
    const client = {
      messages: {
        create: async (params: { messages: unknown[] }) => {
          turns.push(params.messages)
          if (turns.length === 1) {
            return {
              stop_reason: 'pause_turn',
              content: [
                {
                  type: 'web_search_tool_result',
                  tool_use_id: 's',
                  content: [searchResult({ url: 'https://a.example.org/x', title: 'X' })],
                },
              ],
            }
          }
          return {
            stop_reason: 'end_turn',
            content: [
              { type: 'text', text: '[{"url":"https://a.example.org/x","why":"Useful."}]' },
            ],
          }
        },
      },
    } as unknown as Anthropic
    const found = await new AnthropicResearchProvider({ apiKey: 'k', client }).find(request)
    expect(found).toEqual([{ url: 'https://a.example.org/x', title: 'X', why: 'Useful.' }])
    expect(turns).toHaveLength(2)
    expect(turns[1]).toHaveLength(2) // the brief, then the paused turn handed back
  })

  it('finds nothing when the search itself failed, rather than trusting the model', async () => {
    const client = {
      messages: {
        create: async () => ({
          stop_reason: 'end_turn',
          content: [
            {
              type: 'web_search_tool_result',
              tool_use_id: 's',
              content: { type: 'web_search_tool_result_error', error_code: 'unavailable' },
            },
            { type: 'text', text: '[{"url":"https://made.example.org/up","why":"Trust me."}]' },
          ],
        }),
      },
    } as unknown as Anthropic
    expect(await new AnthropicResearchProvider({ apiKey: 'k', client }).find(request)).toEqual([])
  })

  it('translates provider failures as the chat adapter does, without echoing the request', async () => {
    const failing = (status: number) =>
      new AnthropicResearchProvider({
        apiKey: 'k',
        client: {
          messages: {
            create: async () => {
              throw apiError(status)
            },
          },
        } as unknown as Anthropic,
      })
    await expect(failing(401).find(request)).rejects.toBeInstanceOf(LLMAuthError)
    const err = await failing(500)
      .find(request)
      .catch((e) => e)
    expect(err).toBeInstanceOf(LLMProviderError)
    expect(err.message).toBe('Anthropic returned an error (500)')
  })
})

describe('keepSearched', () => {
  const results = new Map([
    ['https://a.example.org/x', 'Title A'],
    ['https://b.example.org/y', 'Title B'],
  ])

  it('ignores anything that is not a JSON array of objects with a reason', () => {
    for (const answer of ['', 'no list here', '[not json]', '{"url":"https://a.example.org/x"}']) {
      expect(keepSearched(answer, results, 5), answer).toEqual([])
    }
    expect(
      keepSearched(
        '[1, null, {"url": 5, "why": "x"}, {"url":"https://a.example.org/x","why":"  "}, {"url":"https://a.example.org/x"}]',
        results,
        5,
      ),
    ).toEqual([])
  })

  it('matches addresses without a fragment or trailing slash, and titles them from the result', () => {
    const found = keepSearched(
      '[{"url":"https://a.example.org/x/#intro","why":" Because. "}]',
      results,
      5,
    )
    expect(found).toEqual([
      { url: 'https://a.example.org/x/#intro', title: 'Title A', why: 'Because.' },
    ])
  })

  it('stops at the most asked for', () => {
    const answer =
      '[{"url":"https://a.example.org/x","why":"1"},{"url":"https://b.example.org/y","why":"2"}]'
    expect(keepSearched(answer, results, 1).map((f) => f.title)).toEqual(['Title A'])
  })
})
