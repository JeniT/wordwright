import {
  AnthropicProvider,
  AnthropicResearchProvider,
  FakeLLMProvider,
  FakeResearchProvider,
  type FakeChatResponder,
  type LLMFactory,
  type LLMRequest,
  type ResearchFactory,
} from '@lfwa/core'
import { VENUE_DESCRIPTION_PROMPT } from '@lfwa/prompts'

/** Builds a real client from a user's own credentials. */
export const realLlmFactory: LLMFactory = ({ provider, apiKey, model }) => {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey, model })
  }
}

/** Builds a real web-searching researcher from a user's own credentials. */
export const realResearchFactory: ResearchFactory = ({ provider, apiKey, model }) => {
  switch (provider) {
    case 'anthropic':
      return new AnthropicResearchProvider({ apiKey, model })
  }
}

/**
 * The pretend coach of development and e2e runs. It opens with a question, and makes each kind of
 * thing when the person asks for it in so many words ("suggest a title", "note that ...",
 * "suggest a new idea", a pasted address "for my reading list"), so every part of the brainstorm page can be tried without a real AI.
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
  const address = said.match(/https?:\/\/[^\s]+/)
  if (address && /reading list/i.test(said)) {
    return {
      text: 'I have not read it, but here it is for your reading list.',
      toolCalls: [
        {
          name: 'suggest_reading',
          input: {
            url: address[0],
            title: 'The page you gave me',
            why: 'You said it bears on this idea.',
          },
        },
      ],
    }
  }
  if (/find (me )?(some )?(sources|reading)|research/i.test(said)) {
    return {
      text: 'I cannot search the web. The Research tool on the idea page does that and lets you review what it finds.',
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

/**
 * The pretend editor of development and e2e runs: one point about the first paragraph, and, when the draft is long
 * enough to scroll, one about the last, so showing a comment that is far down the page can be tried.
 */
export function fakeCritiqueReply(request: LLMRequest): string {
  const text = request.messages.at(-1)?.content ?? ''
  const ids = [...text.matchAll(/^\[(b\d+)\] /gm)].map((m) => m[1]!)
  const points = [
    {
      block: 'b1',
      point: 'Fake critique: the opening could say what is at stake.',
      reason: 'Readers decide in the first lines whether to go on.',
    },
  ]
  if (ids.length > 5) {
    points.push({
      block: ids.at(-1)!,
      point: 'Fake critique: the ending could land harder.',
      reason: 'It is what the reader is left with.',
    })
  }
  return JSON.stringify({ summary: 'A fake critique: one thing to look at.', ready: false, points })
}

/** The pretend describer of development and e2e runs: a short description that says which posts it was given. */
export function fakeVenueDescription(request: LLMRequest): string {
  const count = (request.messages.at(-1)?.content ?? '').match(/<post number=/g)?.length ?? 0
  return `A fake description drawn from ${count} ${count === 1 ? 'post' : 'posts'}: personal essays about gardens (post 1). The posts do not say who reads them.`
}

/** For local development and e2e tests: no network, accepts any key. */
export const fakeLlmFactory: LLMFactory = () =>
  new FakeLLMProvider(
    (request) =>
      request.system === VENUE_DESCRIPTION_PROMPT
        ? fakeVenueDescription(request)
        : fakeCritiqueReply(request),
    fakeBrainstormReply,
  )

/** For local development and e2e tests: three pages, one fine, one with no title, one that doesn't exist. */
export const fakeResearchFactory: ResearchFactory = () => new FakeResearchProvider()
