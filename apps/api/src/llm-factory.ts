import {
  AnthropicProvider,
  AnthropicResearchProvider,
  FakeLLMProvider,
  FakeResearchProvider,
  type FakeChatResponder,
  type LLMFactory,
  type LLMRequest,
  type ResearchFactory,
} from '@wordwright/core'

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
 * "suggest a new idea", a pasted address "for my articles"), so every part of the brainstorm page can be tried without a real AI.
 */
const fakeBrainstormReply: FakeChatResponder = (request) => {
  const last = request.messages.at(-1)
  const blocks = typeof last?.content === 'string' ? [] : (last?.content ?? [])
  const said =
    typeof last?.content === 'string'
      ? last.content
      : (blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).at(-1) ?? '')

  if (request.messages.length === 1) {
    return {
      text: 'What is the **one claim** this piece makes, and why would our readers care?',
      // Like a real AI, it labels the conversation on its first reply.
      toolCalls: [{ name: 'name_conversation', input: { title: 'The one claim of this piece' } }],
    }
  }
  const address = said.match(/https?:\/\/[^\s]+/)
  if (address && /articles/i.test(said)) {
    return {
      text: 'I have not read it, but here it is for your articles.',
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
      text: 'Good point. I have suggested it as a note.',
      toolCalls: [
        { name: 'suggest_note', input: { text: said.replace(/^.*?note that\s*/i, '').trim() } },
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
function fakeCritiqueReply(request: LLMRequest): string {
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

/**
 * The pretend options-giver of development and e2e runs: as many short, different options as the message asks for
 * ("Offer N options."), numbered by round so a later round brings new ones.
 */
function fakeOptionsReply(request: LLMRequest): string {
  const text = request.messages.at(-1)?.content ?? ''
  const count = Number(text.match(/Offer (\d+) options/)?.[1] ?? 5)
  const round = (text.match(/<earlier_round>/g)?.length ?? 0) + 1
  const options = Array.from({ length: count }, (_, i) => `Fake option ${i + 1} of round ${round}.`)
  return JSON.stringify({ options })
}

/** What a pretend one-shot request answers: options for Rephrase, otherwise a critique. */
const fakeCompletion = (request: LLMRequest): string =>
  /<wording kind="/.test(request.messages.at(-1)?.content ?? '')
    ? fakeOptionsReply(request)
    : fakeCritiqueReply(request)

/** For local development and e2e tests: no network, accepts any key. */
export const fakeLlmFactory: LLMFactory = () =>
  new FakeLLMProvider(fakeCompletion, fakeBrainstormReply)

/** For local development and e2e tests: three pages, one fine, one with no title, one that doesn't exist. */
export const fakeResearchFactory: ResearchFactory = () => new FakeResearchProvider()
