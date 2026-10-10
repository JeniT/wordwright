import {
  AnthropicProvider,
  FakeLLMProvider,
  type FakeChatResponder,
  type LLMFactory,
} from '@lfwa/core'

/** Builds a real client from a user's own credentials. */
export const realLlmFactory: LLMFactory = ({ provider, apiKey, model }) => {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey, model })
  }
}

/**
 * The pretend editor of development and e2e runs. It opens with a question, and makes each kind of
 * thing when the person asks for it in so many words ("suggest a title", "note that ...",
 * "suggest a new idea"), so every part of the brainstorm page can be tried without a real AI.
 */
export const fakeBrainstormReply: FakeChatResponder = (request) => {
  const last = request.messages.at(-1)
  const blocks = typeof last?.content === 'string' ? [] : (last?.content ?? [])
  const said =
    typeof last?.content === 'string'
      ? last.content
      : (blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).at(-1) ?? '')

  if (request.messages.length === 1) {
    return {
      text: 'What is the **one claim** this piece makes, and why would our readers care?',
    }
  }
  if (/suggest a title/i.test(said)) {
    return {
      text: 'A sharper title would help. Here is one to consider.',
      toolCalls: [{ name: 'update_idea', input: { name: 'A sharper title for this idea' } }],
    }
  }
  if (/note that/i.test(said)) {
    return {
      text: 'Good point. I have noted it.',
      toolCalls: [
        { name: 'add_note', input: { text: said.replace(/^.*?note that\s*/i, '').trim() } },
      ],
    }
  }
  if (/suggest a new idea/i.test(said)) {
    return {
      text: 'That tangent could be a piece of its own.',
      toolCalls: [
        {
          name: 'create_idea',
          input: { name: 'A spin-off idea', notes: 'Came out of a conversation.' },
        },
      ],
    }
  }
  return {
    text: `Thanks. What is your strongest evidence for "${said.slice(0, 60)}"?`,
  }
}

/** For local development and e2e tests: no network, accepts any key. */
export const fakeLlmFactory: LLMFactory = () => new FakeLLMProvider(undefined, fakeBrainstormReply)
