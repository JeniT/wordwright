import { describe, expect, it } from 'vitest'
import type { LLMChatRequest } from '@lfwa/core'
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

  describe('the pretend editor', () => {
    const llm = fakeLlmFactory({ provider: 'anthropic', apiKey: 'anything', model: 'm' })
    const turn = async (request: LLMChatRequest) => {
      const events = []
      for await (const e of llm.chat(request)) events.push(e)
      return {
        text: events.map((e) => (e.type === 'text' ? e.text : '')).join(''),
        calls: events.filter((e) => e.type === 'tool_call'),
      }
    }
    const thread = (...said: string[]): LLMChatRequest => ({
      messages: said.flatMap((text, i) => [
        { role: 'user' as const, content: [{ type: 'text' as const, text }] },
        ...(i < said.length - 1 ? [{ role: 'assistant' as const, content: 'ok' }] : []),
      ]),
    })

    it('opens with a question', async () => {
      const { text, calls } = await turn(thread('The idea... Start the session now.'))
      expect(text).toContain('What is the **one claim**')
      expect(calls).toEqual([])
    })

    it.each([
      ['suggest a title please', 'update_idea', 'name'],
      ['Please note that rivers meander', 'add_note', 'text'],
      ['can you suggest a new idea from that?', 'create_idea', 'name'],
    ])('answers "%s" with a %s call', async (said, tool, field) => {
      const { calls } = await turn(thread('first', said))
      expect(calls).toMatchObject([{ name: tool, input: { [field]: expect.any(String) } }])
    })

    it('otherwise asks for evidence, echoing a little of what was said', async () => {
      const { text, calls } = await turn(thread('first', 'Erosion on the outside bend.'))
      expect(text).toContain('Erosion on the outside bend.')
      expect(calls).toEqual([])
    })
  })
})
