import { describe, expect, it, vi } from 'vitest'
import {
  FakeLLMProvider,
  LLMAuthError,
  LLMProviderError,
  LLMRateLimitError,
  MAX_IDEA_NOTES,
  MAX_NOTES_PER_REPLY,
  MAX_PROPOSALS_PER_REPLY,
  type BrainstormEvent,
  type LLMContentBlock,
} from '@lfwa/core'
import { BRAINSTORM_RULES_PROMPT, DEFAULT_BRAINSTORM_PROMPT } from '@lfwa/prompts'
import { RateLimiter } from './auth/rate-limit'
import { BrainstormService, formatSnapshot, REPLY_TIMEOUT_MS } from './services/brainstorm'
import { BrainstormPromptService } from './services/brainstorm-prompt'
import {
  PASSWORD,
  register,
  saveKey,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
  type TestOptions,
} from './test-helpers'

/** Reads a server-sent event stream into the events it carried. */
function parseSse(text: string): BrainstormEvent[] {
  return text
    .split('\n\n')
    .map((chunk) => chunk.split('\n').find((line) => line.startsWith('data:')))
    .filter((line): line is string => !!line)
    .map((line) => JSON.parse(line.slice('data:'.length).trim()) as BrainstormEvent)
}
const types = (events: BrainstormEvent[]) => events.map((e) => e.type)
const textOf = (content: string | LLMContentBlock[]) =>
  typeof content === 'string'
    ? content
    : content.map((b) => (b.type === 'text' ? b.text : '')).join('\n')

interface ThreadProposal {
  id: string
  tool: string
  input: Record<string, string>
  status: string
  stale: boolean
  createdIdeaId: string | null
  decidedByName: string | null
}
interface Thread {
  messages: {
    id: string
    role: string
    kind: string
    text: string
    authorName: string | null
    model: string | null
    status: string
    stopReason: string | null
    proposals: ThreadProposal[]
    notes: { id: string; text: string; outcome: string; removed: boolean }[]
  }[]
  replyingNow: { name: string } | null
}

const say = (text: string) => ({ text })
const START = { start: true }
const RETRY = { retry: true }
const addNote = (text: unknown) => ({ name: 'add_note', input: { text } })
const update = (input: object) => ({ name: 'update_idea', input })
const create = (input: object) => ({ name: 'create_idea', input })

/** Ada owns "Ada's writing", with one idea that has notes, a saved link and a draft (whose text must stay private). */
async function world(options: TestOptions = {}) {
  const ctx = setup(options)
  const ada = ctx.client()
  await register(ada, 'ada@example.com', 'Ada')
  await saveKey(ada)
  verifyAccounts(ctx, 'ada@example.com')
  const profile = (await (await ada.get('/api/profiles')).json())[0].id as string
  const ideas = `/api/profiles/${profile}/ideas`
  const idea = await (
    await ada.post(ideas, { name: 'Why rivers meander', notes: 'Erosion loops.' })
  ).json()
  ctx.store.ideas.addLink(idea.id, {
    url: 'https://example.org/paper',
    title: 'A paper on meanders',
  })
  await ada.post(`${ideas}/${idea.id}/drafts`, {
    title: 'Part 1: the bend',
    body: 'SECRET DRAFT BODY',
  })
  const base = `${ideas}/${idea.id}/conversation`

  /** Sends a message and reads the whole reply stream; an ordinary error response has no events. */
  const send = async (client: TestClient, body: object) => {
    const res = await client.post(`${base}/messages`, body)
    if (res.status !== 200) {
      return { status: res.status, error: (await res.json()).error as string, events: [] }
    }
    return { status: 200, error: undefined, events: parseSse(await res.text()) }
  }
  const thread = async (client: TestClient = ada) =>
    (await (await client.get(base)).json()) as Thread
  const addBob = async () => {
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await saveKey(bob, 'sk-ant-bobs-own-key-1234567890')
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    return bob
  }
  const proposalsOf = async () => (await thread()).messages.flatMap((m) => m.proposals)
  const decide = (client: TestClient, id: string, action: 'accept' | 'dismiss', body = {}) =>
    client.post(`${base}/proposals/${id}/${action}`, body)
  return { ctx, ada, profile, ideas, idea, base, send, thread, addBob, proposalsOf, decide }
}

describe('starting a brainstorm', () => {
  it('opens with the AI asking questions, streaming them, then storing the exchange', async () => {
    const { ctx, ada, send, thread } = await world()
    ctx.setChat(() => ({ text: 'What is the single claim of this piece?' }))
    const { status, events } = await send(ada, START)
    expect(status).toBe(200)

    const streamed = events.map((e) => (e.type === 'text' ? e.text : '')).join('')
    expect(streamed).toBe('What is the single claim of this piece?')
    expect(types(events)[0]).toBe('message')
    expect(types(events).at(-1)).toBe('done')
    expect(
      types(events)
        .slice(1, -1)
        .every((t) => t === 'text'),
    ).toBe(true)
    expect(events[0]).toMatchObject({
      message: { kind: 'kickoff', role: 'user', text: '', authorName: 'Ada' },
    })
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      message: {
        role: 'assistant',
        text: streamed,
        status: 'complete',
        stopReason: 'end',
        model: 'claude-sonnet-5-5',
      },
    })

    const saved = await thread()
    expect(saved.messages.map((m) => [m.role, m.kind])).toEqual([
      ['user', 'kickoff'],
      ['assistant', 'message'],
    ])
    expect(saved.replyingNow).toBeNull()
  })

  it("gives the AI the person's prompt, the app's rules, the tools and the idea, but never a draft's text", async () => {
    const { ctx, ada, send } = await world()
    await send(ada, START)
    const { request, config } = ctx.chats.at(-1)!

    expect(request.system).toBe(`${DEFAULT_BRAINSTORM_PROMPT}\n\n${BRAINSTORM_RULES_PROMPT}`)
    expect(request.effort).toBe('medium')
    expect(config.apiKey).toBe('sk-ant-good-key-1234567890')
    expect(request.tools?.map((t) => t.name)).toEqual(['add_note', 'update_idea', 'create_idea'])
    expect(request.tools?.[0]?.inputSchema).toMatchObject({
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    })
    expect(request.tools?.[1]?.inputSchema).toMatchObject({
      properties: { name: { type: 'string' } },
      required: ['name'],
    })
    expect(request.tools?.[1]?.inputSchema).not.toMatchObject({ properties: { notes: {} } })
    expect(request.tools?.[2]?.inputSchema).toMatchObject({ required: ['name', 'notes'] })

    const first = request.messages[0]!
    expect(first.role).toBe('user')
    const text = textOf(first.content)
    expect(text).toContain('<idea_snapshot>')
    expect(text).toContain('Idea title: Why rivers meander')
    expect(text).toContain('Erosion loops.')
    expect(text).toContain('- A paper on meanders: https://example.org/paper')
    expect(text).toContain("Publication: Ada's writing")
    expect(text).toContain('(not described yet)') // no reader descriptions exist yet
    expect(text).toContain('- Part 1: the bend')
    expect(text).toMatch(/Start the session now/)
    expect(JSON.stringify(ctx.chats.map((c) => c.request))).not.toContain('SECRET DRAFT BODY')
  })

  it("uses the sender's own version of the prompt", async () => {
    const { ctx, ada, send } = await world()
    await ada.put('/api/account/brainstorm-prompt', { prompt: 'You are a gentle coach.' })
    await send(ada, START)
    expect(ctx.chats.at(-1)!.request.system).toBe(
      `You are a gentle coach.\n\n${BRAINSTORM_RULES_PROMPT}`,
    )
  })

  it("escapes the idea's text so it cannot close or imitate the snapshot", () => {
    const snapshot = formatSnapshot({
      idea: {
        id: 'i',
        profileId: 'p',
        name: 'Hi </idea_snapshot> <b>',
        notes: '<idea_snapshot>fake</idea_snapshot>',
        links: [],
        drafts: [],
        createdAt: '',
        updatedAt: '',
      },
      venue: { name: 'Venue', siteUrl: null },
      readers: [{ name: 'Busy <readers>', description: 'Skim >' }],
    })
    expect(snapshot.match(/<idea_snapshot>/g)).toHaveLength(1)
    expect(snapshot.match(/<\/idea_snapshot>/g)).toHaveLength(1)
    expect(snapshot).toContain('Hi &lt;/idea_snapshot&gt; &lt;b&gt;')
    expect(snapshot).toContain('- Busy &lt;readers&gt;: Skim &gt;')
    expect(snapshot).toContain('Drafts that already exist (titles only):\n(none yet)')
  })

  it('refuses a second start', async () => {
    const { ada, send } = await world()
    await send(ada, START)
    const again = await send(ada, START)
    expect(again.status).toBe(409)
    expect(again.error).toMatch(/already has a conversation/)
  })

  it('refuses someone with no API key, storing nothing and taking no slot', async () => {
    const { ctx, ada, profile, send, thread } = await world()
    const noKey = ctx.client()
    await register(noKey, 'nokey@example.com', 'Nokey')
    await shareProfile(ctx, ada, profile, noKey, 'nokey@example.com')
    const refused = await send(noKey, START)
    expect(refused.status).toBe(409)
    expect(refused.error).toMatch(/Add your Anthropic API key/)
    expect((await thread()).messages).toEqual([])
    expect((await thread()).replyingNow).toBeNull()
    expect((await send(ada, START)).status).toBe(200)
  })

  it('is for members of the profile only', async () => {
    const { ctx, base, send } = await world()
    const stranger = ctx.client()
    await register(stranger, 'eve@example.com', 'Eve')
    await saveKey(stranger)
    expect((await stranger.get(base)).status).toBe(404)
    expect((await send(stranger, START)).status).toBe(404)
    expect((await ctx.client().get(base)).status).toBe(401)
    expect(ctx.chats).toHaveLength(0)
  })
})

describe('carrying on the conversation', () => {
  it('replays the thread, and sends the idea again only when it has changed', async () => {
    const { ctx, ada, ideas, idea, send } = await world()
    ctx.setChat((_request, call) => ({ text: `Reply ${call}.` }))
    await send(ada, START)
    await send(ada, say('It is about erosion.'))

    const second = ctx.chats.at(-1)!.request.messages
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(textOf(second[1]!.content)).toBe('Reply 1.')
    // The idea hasn't changed, so the second person turn is just what they said.
    expect(textOf(second[2]!.content)).toBe('It is about erosion.')

    await ada.patch(`${ideas}/${idea.id}`, { notes: 'Erosion on the outside bend.' })
    await send(ada, say('Better now?'))
    const third = textOf(ctx.chats.at(-1)!.request.messages.at(-1)!.content)
    expect(third).toContain('Erosion on the outside bend.')
    expect(third).toContain('<idea_snapshot>')
    expect(third.endsWith('Better now?')).toBe(true)
  })

  it('shows what each person typed, not the idea snapshot sent with it', async () => {
    const { ctx, ada, ideas, idea, send, thread } = await world()
    await send(ada, START)
    await ada.patch(`${ideas}/${idea.id}`, { name: 'Why rivers loop' })
    await send(ada, say('Renamed it.'))
    ctx.setChat(() => ({ text: 'Fine.' }))
    const shown = (await thread()).messages.filter((m) => m.role === 'user').map((m) => m.text)
    expect(shown).toEqual(['', 'Renamed it.'])
  })

  it('rejects messages that are not exactly one of text, start or retry', async () => {
    const { ada, send } = await world()
    for (const body of [
      {},
      { text: '' },
      { text: '   ' },
      { text: 'hi', start: true },
      { start: true, retry: true },
      { start: false },
      { text: 'x'.repeat(10_001) },
    ]) {
      const res = await send(ada, body)
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400)
      expect(res.error).toMatch(/Write a message/)
    }
  })

  it("shows a sender's new name on the messages they sent before they changed it", async () => {
    const { ctx, ada, send, thread, addBob } = await world()
    const bob = await addBob()
    ctx.setChat(() => ({ text: 'Noted.' }))
    await send(ada, START)
    await send(bob, say('Bob here.'))
    const senders = async () =>
      (await thread(ada)).messages.filter((m) => m.role === 'user').map((m) => m.authorName)
    expect(await senders()).toEqual(['Ada', 'Bob'])

    expect((await bob.put('/api/account/name', { name: 'Robert' })).status).toBe(200)
    expect(await senders()).toEqual(['Ada', 'Robert'])
  })

  it('shares one thread between members, each message using its sender key and prompt', async () => {
    const { ctx, ada, send, thread, addBob } = await world()
    const bob = await addBob()
    await bob.put('/api/account/brainstorm-prompt', { prompt: "Bob's own prompt." })
    ctx.setChat(() => ({ text: 'Noted.' }))
    await send(ada, START)
    await send(bob, say('Bob here.'))

    const [adaTurn, bobTurn] = ctx.chats
    expect(adaTurn!.config.apiKey).toBe('sk-ant-good-key-1234567890')
    expect(bobTurn!.config.apiKey).toBe('sk-ant-bobs-own-key-1234567890')
    expect(bobTurn!.request.system).toBe(`Bob's own prompt.\n\n${BRAINSTORM_RULES_PROMPT}`)
    expect(bobTurn!.request.messages).toHaveLength(3) // Bob's turn replays Ada's whole thread

    const seenByAda = await thread(ada)
    const seenByBob = await thread(bob)
    expect(seenByBob).toEqual(seenByAda)
    expect(seenByAda.messages.filter((m) => m.role === 'user').map((m) => m.authorName)).toEqual([
      'Ada',
      'Bob',
    ])
  })
})

describe('suggestions from the AI', () => {
  it('become pending proposals, announced as they are saved, that change nothing yet', async () => {
    const { ctx, ada, ideas, idea, send, proposalsOf } = await world()
    ctx.setChat(() => ({
      text: 'Try this.',
      toolCalls: [
        update({ name: 'Why rivers loop' }),
        create({ name: 'Oxbow lakes', notes: 'A separate piece.' }),
      ],
    }))
    const { events } = await send(ada, START)
    const proposals = events.filter((e) => e.type === 'proposal')
    expect(proposals).toHaveLength(2)
    expect(types(events).slice(-3)).toEqual(['proposal', 'proposal', 'done'])
    expect(events.at(-1)).toMatchObject({ type: 'done', message: { stopReason: 'tool_use' } })

    expect(await proposalsOf()).toMatchObject([
      {
        tool: 'update_idea',
        status: 'pending',
        stale: false,
        input: { name: 'Why rivers loop' },
      },
      {
        tool: 'create_idea',
        status: 'pending',
        input: { name: 'Oxbow lakes', notes: 'A separate piece.' },
      },
    ])
    const unchanged = await (await ada.get(`${ideas}/${idea.id}`)).json()
    expect(unchanged).toMatchObject({ name: 'Why rivers meander', notes: '- Erosion loops.' })
    expect(await (await ada.get(ideas)).json()).toHaveLength(1)
  })

  it('drop a title that repeats the current one, and a notes-only update (notes are recorded with add_note)', async () => {
    const { ctx, ada, send, proposalsOf } = await world()
    ctx.setChat(() => ({
      toolCalls: [
        update({ name: 'Why rivers meander' }), // nothing new
        update({ notes: 'Different notes.' }), // no longer something it can suggest
      ],
    }))
    await send(ada, START)
    expect(await proposalsOf()).toEqual([])
  })

  it('are ignored when invalid, unknown or too many, but still answered on the next turn', async () => {
    const { ctx, ada, send, proposalsOf } = await world()
    const many = Array.from({ length: MAX_PROPOSALS_PER_REPLY + 2 }, (_, i) =>
      create({ name: `Idea ${i}`, notes: '' }),
    )
    ctx.setChat((_request, call) =>
      call === 1
        ? {
            text: 'Several.',
            toolCalls: [
              update({}), // nothing suggested
              update({ name: 'x'.repeat(500) }), // title too long
              { name: 'delete_everything', input: {} }, // not a tool we have
              create({ name: '' }), // missing notes, empty title
              ...many,
            ],
          }
        : { text: 'Ok.' },
    )
    await send(ada, START)
    const made = await proposalsOf()
    expect(made).toHaveLength(MAX_PROPOSALS_PER_REPLY)
    expect(made.every((p) => p.tool === 'create_idea')).toBe(true)

    await send(ada, say('Go on.'))
    const results = ctx.chats.at(-1)!.request.messages.at(-1)!.content as LLMContentBlock[]
    const answers = results.filter((b) => b.type === 'tool_result')
    expect(answers).toHaveLength(4 + many.length) // every call gets an answer
    expect(answers.slice(0, 4).every((a) => a.type === 'tool_result' && a.isError)).toBe(true)
    // The ones past the cap were never made, so they count as unusable too.
    expect(answers.filter((a) => a.type === 'tool_result' && !a.isError)).toHaveLength(
      MAX_PROPOSALS_PER_REPLY,
    )
  })

  it("are reported back to the AI as accepted, dismissed or undecided, ahead of the person's words", async () => {
    const { ctx, ada, send, proposalsOf, decide } = await world()
    ctx.setChat((_request, call) =>
      call === 1
        ? {
            toolCalls: [
              update({ name: 'A new title' }),
              create({ name: 'Oxbow', notes: 'n' }),
              create({ name: 'Delta', notes: 'n' }),
            ],
          }
        : { text: 'Thanks.' },
    )
    await send(ada, START)
    const [first, second] = await proposalsOf()
    expect((await decide(ada, first!.id, 'accept')).status).toBe(200)
    expect((await decide(ada, second!.id, 'dismiss')).status).toBe(200)
    await send(ada, say('What now?'))

    const content = ctx.chats.at(-1)!.request.messages.at(-1)!.content as LLMContentBlock[]
    const results = content.filter((b) => b.type === 'tool_result')
    expect(content.slice(0, 3).map((b) => b.type)).toEqual([
      'tool_result',
      'tool_result',
      'tool_result',
    ])
    expect(results.map((r) => r.type === 'tool_result' && r.content)).toEqual([
      'The writer accepted this suggestion, and the title was changed.',
      'The writer dismissed this suggestion. Nothing was changed.',
      'The writer has not decided on this suggestion yet. Nothing has been changed.',
    ])
    const sent = ctx.chats.at(-1)!.request.messages
    const callIds = (sent[1]!.content as LLMContentBlock[]).flatMap((b) =>
      b.type === 'tool_call' ? [b.id] : [],
    )
    expect(callIds).toHaveLength(3)
    expect(results.flatMap((r) => (r.type === 'tool_result' ? [r.toolCallId] : []))).toEqual(
      callIds,
    )
    expect(textOf(content).endsWith('What now?')).toBe(true)
  })
})

describe('notes the AI records', () => {
  const notesOf = (
    ctx: { store: { notes: { list: (id: string) => { text: string }[] } } },
    id: string,
  ) => ctx.store.notes.list(id)

  it('are added to the idea at once, as brainstorm notes in the name of the person who was chatting', async () => {
    const { ctx, ada, ideas, idea, send, thread } = await world()
    ctx.setChat(() => ({
      text: 'I have noted two points.',
      toolCalls: [addNote('Meanders speed up erosion.'), addNote('Oxbow lakes are cut-off loops.')],
    }))
    const { events } = await send(ada, START)

    expect(types(events).slice(-3)).toEqual(['note', 'note', 'done'])
    const added = ctx.store.notes.list(idea.id)
    expect(added.map((n) => n.text)).toEqual([
      'Erosion loops.',
      'Meanders speed up erosion.',
      'Oxbow lakes are cut-off loops.',
    ])
    expect(added[1]).toMatchObject({ origin: 'brainstorm' })
    expect(added[1]!.authorId).toBeTruthy()
    expect(added[1]!.authorId).toBe(added[0]!.authorId) // Ada, who was chatting

    expect((await thread()).messages.at(-1)!.notes).toMatchObject([
      { text: 'Meanders speed up erosion.', outcome: 'added', removed: false },
      { text: 'Oxbow lakes are cut-off loops.', outcome: 'added', removed: false },
    ])
    // The idea shows them too, as bullets, and counts as changed.
    const fresh = await (await ada.get(`${ideas}/${idea.id}`)).json()
    expect(fresh.notes).toBe(
      '- Erosion loops.\n- Meanders speed up erosion.\n- Oxbow lakes are cut-off loops.',
    )
  })

  it('names whoever sent the message that led to them', async () => {
    const { ctx, ada, idea, send, addBob } = await world()
    const bob = await addBob()
    ctx.setChat(() => ({ text: 'Noted.', toolCalls: [addNote("Bob's point.")] }))
    await send(bob, say('Here is my point.'))
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    expect(ctx.store.notes.list(idea.id).at(-1)).toMatchObject({
      text: "Bob's point.",
      authorId: bobId,
    })
    void ada
  })

  it('are not added twice: a point the idea (or this reply) already has is reported, not recorded', async () => {
    const { ctx, ada, idea, send, thread } = await world()
    ctx.setChat(() => ({
      toolCalls: [
        addNote('EROSION  loops!'), // the idea's own note, differently written
        addNote('A new point.'),
        addNote('a new point'), // repeated in the same reply
      ],
    }))
    await send(ada, START)
    expect(notesOf(ctx, idea.id).map((n) => n.text)).toEqual(['Erosion loops.', 'A new point.'])
    expect((await thread()).messages.at(-1)!.notes.map((n) => n.outcome)).toEqual([
      'duplicate',
      'added',
      'duplicate',
    ])
  })

  it('stop at the most notes an idea can hold', async () => {
    const { ctx, ada, idea, send, thread } = await world()
    for (let i = 1; i < MAX_IDEA_NOTES - 1; i++)
      ctx.store.notes.append(idea.profileId, idea.id, null, `n${i}`)
    ctx.setChat(() => ({ toolCalls: [addNote('Fits'), addNote('Does not fit')] }))
    await send(ada, START)
    expect(ctx.store.notes.count(idea.id)).toBe(MAX_IDEA_NOTES)
    expect((await thread()).messages.at(-1)!.notes.map((n) => n.outcome)).toEqual(['added', 'full'])
  })

  it('ignore invalid input and anything past the most per reply, but still answer every call', async () => {
    const { ctx, ada, idea, send } = await world()
    const many = Array.from({ length: MAX_NOTES_PER_REPLY + 2 }, (_, i) => addNote(`Point ${i}`))
    ctx.setChat((_request, call) =>
      call === 1
        ? { toolCalls: [addNote(''), addNote(42), { name: 'add_note', input: {} }, ...many] }
        : { text: 'Ok.' },
    )
    await send(ada, START)
    expect(notesOf(ctx, idea.id)).toHaveLength(1 + MAX_NOTES_PER_REPLY) // Ada's own, and the cap

    await send(ada, say('Go on.'))
    const results = (
      ctx.chats.at(-1)!.request.messages.at(-1)!.content as LLMContentBlock[]
    ).filter((b) => b.type === 'tool_result')
    expect(results).toHaveLength(3 + many.length)
    expect(results.filter((r) => r.type === 'tool_result' && !r.isError)).toHaveLength(
      MAX_NOTES_PER_REPLY,
    )
  })

  it("are reported back to the AI, and shown to it among the idea's notes on the next turn", async () => {
    const { ctx, ada, send } = await world()
    ctx.setChat((_request, call) =>
      call === 1
        ? { toolCalls: [addNote('A new point.'), addNote('erosion loops')] }
        : { text: 'Thanks.' },
    )
    await send(ada, START)
    await send(ada, say('What next?'))
    const content = ctx.chats.at(-1)!.request.messages.at(-1)!.content as LLMContentBlock[]
    expect(content.flatMap((b) => (b.type === 'tool_result' ? [b.content] : []))).toEqual([
      'Recorded as a note.',
      'Not recorded: the idea already has this point in its notes.',
    ])
    // The snapshot carries the new note, since the idea changed.
    expect(textOf(content)).toContain('- A new point.')
  })

  it('show as removed once the writer deletes the note', async () => {
    const { ctx, ada, idea, send, thread } = await world()
    ctx.setChat(() => ({ toolCalls: [addNote('A new point.')] }))
    await send(ada, START)
    const note = ctx.store.notes.list(idea.id).at(-1)!
    ctx.store.notes.remove(idea.id, note.id)
    expect((await thread()).messages.at(-1)!.notes).toMatchObject([
      { text: 'A new point.', outcome: 'added', removed: true },
    ])
  })
})

describe('accepting and dismissing suggestions', () => {
  const suggestUpdate = async (options: TestOptions = {}) => {
    const w = await world(options)
    w.ctx.setChat(() => ({
      text: 'Suggestion.',
      toolCalls: [update({ name: 'Why rivers loop' })],
    }))
    await w.send(w.ada, START)
    const [proposal] = await w.proposalsOf()
    return { ...w, proposal: proposal! }
  }

  it("applies an update to the idea, and says who decided and that it can't be decided twice", async () => {
    const { ada, ideas, idea, proposal, decide, thread } = await suggestUpdate()
    const res = await decide(ada, proposal.id, 'accept')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      status: 'accepted',
      decidedByName: 'Ada',
      stale: false,
    })
    expect(await (await ada.get(`${ideas}/${idea.id}`)).json()).toMatchObject({
      name: 'Why rivers loop',
      notes: '- Erosion loops.', // the notes are untouched
    })
    expect((await thread()).messages.at(-1)!.proposals[0]).toMatchObject({ status: 'accepted' })

    for (const action of ['accept', 'dismiss'] as const) {
      const again = await decide(ada, proposal.id, action)
      expect(again.status).toBe(409)
      expect((await again.json()).error).toBe('This suggestion was already accepted.')
    }
  })

  it('dismissing changes nothing and settles it', async () => {
    const { ada, ideas, idea, proposal, decide } = await suggestUpdate()
    const res = await decide(ada, proposal.id, 'dismiss')
    expect(await res.json()).toMatchObject({ status: 'dismissed', decidedByName: 'Ada' })
    expect(await (await ada.get(`${ideas}/${idea.id}`)).json()).toMatchObject({
      name: 'Why rivers meander',
      notes: '- Erosion loops.',
    })
    expect((await decide(ada, proposal.id, 'accept')).status).toBe(409)
  })

  it('will not overwrite a title that changed since it was suggested, unless told to', async () => {
    const { ada, ideas, idea, proposal, decide, proposalsOf } = await suggestUpdate()
    await ada.patch(`${ideas}/${idea.id}`, { name: 'I renamed it myself' })
    expect(await proposalsOf()).toMatchObject([{ status: 'pending', stale: true }])

    const refused = await decide(ada, proposal.id, 'accept')
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toMatch(/has changed since this was suggested/)
    expect(await (await ada.get(`${ideas}/${idea.id}`)).json()).toMatchObject({
      name: 'I renamed it myself',
    })

    const forced = await decide(ada, proposal.id, 'accept', { overwrite: true })
    expect(forced.status).toBe(200)
    expect(await (await ada.get(`${ideas}/${idea.id}`)).json()).toMatchObject({
      name: 'Why rivers loop',
    })
  })

  it("editing the notes doesn't make a title suggestion stale", async () => {
    const { ada, ideas, idea, proposal, proposalsOf, decide } = await suggestUpdate()
    await ada.post(`${ideas}/${idea.id}/notes`, { text: 'Something I added.' })
    expect(await proposalsOf()).toMatchObject([{ status: 'pending', stale: false }])
    expect((await decide(ada, proposal.id, 'accept')).status).toBe(200)
  })

  it('creates a new idea in the same profile, with its notes, for a create suggestion', async () => {
    const { ctx, ada, ideas, send, proposalsOf, decide } = await world()
    ctx.setChat(() => ({
      toolCalls: [create({ name: 'Oxbow lakes', notes: 'Where meanders end.' })],
    }))
    await send(ada, START)
    const [proposal] = await proposalsOf()
    const res = await decide(ada, proposal!.id, 'accept')
    const accepted = await res.json()
    expect(accepted).toMatchObject({ status: 'accepted', createdIdeaId: expect.any(String) })

    const list = await (await ada.get(ideas)).json()
    expect(list.map((i: { name: string }) => i.name).sort()).toEqual([
      'Oxbow lakes',
      'Why rivers meander',
    ])
    const made = await (await ada.get(`${ideas}/${accepted.createdIdeaId}`)).json()
    expect(made).toMatchObject({
      name: 'Oxbow lakes',
      notes: '- Where meanders end.',
      drafts: [],
      links: [],
    })
    // Its starting notes say they came out of a brainstorm.
    expect(ctx.store.notes.list(accepted.createdIdeaId)).toMatchObject([
      { text: 'Where meanders end.', origin: 'brainstorm' },
    ])
    // The new idea starts with a clean slate; it does not inherit the thread.
    expect(
      (await (await ada.get(`${ideas}/${accepted.createdIdeaId}/conversation`)).json()).messages,
    ).toEqual([])
  })

  it('lets any member decide, and the first to decide wins', async () => {
    const { ada, proposal, decide, addBob } = await suggestUpdate()
    const bob = await addBob()
    expect(await (await decide(bob, proposal.id, 'accept')).json()).toMatchObject({
      status: 'accepted',
      decidedByName: 'Bob',
    })
    expect((await decide(ada, proposal.id, 'accept')).status).toBe(409)
  })

  it('knows nothing of suggestions from other ideas, or that do not exist', async () => {
    const { ctx, ada, profile, ideas, proposal, decide } = await suggestUpdate()
    const other = await (await ada.post(ideas, { name: 'Another idea' })).json()
    const otherBase = `/api/profiles/${profile}/ideas/${other.id}/conversation`
    expect((await ada.post(`${otherBase}/proposals/${proposal.id}/accept`, {})).status).toBe(404)
    expect((await ada.post(`${otherBase}/proposals/${proposal.id}/dismiss`, {})).status).toBe(404)
    expect((await decide(ada, 'nope', 'accept')).status).toBe(404)
    const stranger = ctx.client()
    await register(stranger, 'eve@example.com', 'Eve')
    expect((await decide(stranger, proposal.id, 'accept')).status).toBe(404)
  })
})

describe('when a reply goes wrong', () => {
  it('reports a rate limit, keeps the message, and lets the person ask again without resending', async () => {
    const { ctx, ada, send, thread } = await world()
    ctx.setChat((_request, call) => {
      if (call === 1) throw new LLMRateLimitError('slow down', 30)
      return { text: 'Here I am.' }
    })
    const failed = await send(ada, START)
    expect(types(failed.events)).toEqual(['message', 'error'])
    expect(failed.events[1]).toMatchObject({
      code: 'rate_limit',
      retryAfterSeconds: 30,
      message: expect.stringContaining('about 30 seconds'),
    })
    expect((await thread()).messages.map((m) => m.role)).toEqual(['user']) // the message stands, with no reply

    const retried = await send(ada, RETRY)
    expect(types(retried.events)[0]).toBe('text') // no second copy of the message
    expect((await thread()).messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(ctx.chats[1]!.request.messages).toEqual(ctx.chats[0]!.request.messages)
  })

  it('cannot retry when the last message already has a reply', async () => {
    const { ada, send } = await world()
    await send(ada, START)
    const res = await send(ada, RETRY)
    expect(res.status).toBe(409)
    expect(res.error).toMatch(/nothing to try again/)
  })

  it('says what to do about a rejected key, a provider problem, and the unexpected', async () => {
    const logger = { error: vi.fn() }
    const { ctx, ada, send } = await world({ logger })
    const failures: [unknown, string, string][] = [
      [new LLMAuthError(), 'auth', 'account settings'],
      [
        new LLMProviderError('SECRET writing in this message'),
        'provider',
        'provider had a problem',
      ],
      [new Error('SECRET writing in this one too'), 'unknown', 'Something went wrong'],
    ]
    for (const [i, [error, code, words]] of failures.entries()) {
      ctx.setChat(() => {
        throw error
      })
      const { events } = await send(ada, i === 0 ? START : RETRY)
      expect(events.at(-1)).toMatchObject({
        type: 'error',
        code,
        message: expect.stringContaining(words),
      })
      expect(JSON.stringify(events)).not.toContain('SECRET')
    }
    // Only the kind of unexpected failure is logged, never its message (which might hold their writing).
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0]).toEqual(['brainstorm reply failed:', 'Error'])
  })

  it('treats a reply with nothing in it as a failure rather than saving a blank message', async () => {
    const { ctx, ada, send, thread } = await world()
    ctx.setChat(() => ({}))
    const { events } = await send(ada, START)
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'provider' })
    expect((await thread()).messages.map((m) => m.role)).toEqual(['user'])
  })

  it('keeps a refusal as a message of its own, and carries on afterwards', async () => {
    const { ctx, ada, send, thread } = await world()
    ctx.setChat((_request, call) =>
      call === 1 ? { stopReason: 'refusal' } : { text: 'Happy to help with that instead.' },
    )
    const { events } = await send(ada, START)
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      message: { text: '', stopReason: 'refusal' },
    })
    await send(ada, say('Let me rephrase.'))
    // The empty refusal has nothing to replay: the model sees the two person turns together.
    expect(ctx.chats.at(-1)!.request.messages.map((m) => m.role)).toEqual(['user', 'user'])
    expect((await thread()).messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ])
  })

  it('drops suggestions from a reply that was cut short, and says it was', async () => {
    const { ctx, ada, send, proposalsOf } = await world()
    ctx.setChat(() => ({
      text: 'I was saying',
      stopReason: 'max_tokens',
      toolCalls: [update({ notes: 'Half of a long notes' })],
    }))
    const { events } = await send(ada, START)
    expect(events.at(-1)).toMatchObject({ type: 'done', message: { stopReason: 'max_tokens' } })
    expect(await proposalsOf()).toEqual([])
  })

  it('gives up on a reply that takes too long, and frees the idea', async () => {
    const { ctx, idea, profile } = await world()
    const store = ctx.store
    const llm = new FakeLLMProvider(undefined, async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
      return { text: 'too late' }
    })
    const service = new BrainstormService({
      store,
      prompts: new BrainstormPromptService(store),
      resolveLlm: () => ({ llm, provider: 'fake', model: 'm' }),
      limiter: new RateLimiter(100, 1000),
      replyTimeoutMs: 10,
    })
    const user = { id: store.users.findByEmail('ada@example.com')!.id, name: 'Ada' }
    const current = store.ideas.get(profile, idea.id)!
    const events: BrainstormEvent[] = []
    for await (const e of service
      .begin(current, user, { start: true })
      .run(new AbortController().signal)) {
      events.push(e)
    }
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'timeout' })
    expect(service.conversation(current).replyingNow).toBeNull()
  })
})

describe('one reply at a time', () => {
  it('refuses a second message while one is being answered, and says who is waiting', async () => {
    const { ctx, ada, base, send, thread, addBob } = await world()
    const bob = await addBob()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    ctx.setChat(async () => {
      await gate
      return { text: 'Finally.' }
    })

    const first = await ada.post(`${base}/messages`, START) // the reply stream is now open and waiting
    expect(first.status).toBe(200)
    expect((await thread(bob)).replyingNow).toEqual({ name: 'Ada' })
    const blocked = await send(bob, say('Me too!'))
    expect(blocked.status).toBe(409)
    expect(blocked.error).toBe('Ada is waiting for a reply. Try again in a moment.')
    expect((await ada.delete(base)).status).toBe(409) // nor can the thread be wiped meanwhile

    release()
    await first.text()
    expect((await thread(bob)).replyingNow).toBeNull()
    expect((await send(bob, say('Now me.'))).status).toBe(200)
  })

  it('frees the idea after a failure too', async () => {
    const { ctx, ada, send } = await world()
    ctx.setChat(() => {
      throw new LLMProviderError()
    })
    await send(ada, START)
    ctx.setChat(() => ({ text: 'Back.' }))
    expect((await send(ada, RETRY)).status).toBe(200)
  })

  it('lets go of a slot nobody ever ran, once a reply could no longer be alive', async () => {
    const { ctx, profile, idea } = await world()
    const store = ctx.store
    let now = 1_000_000
    const service = new BrainstormService({
      store,
      prompts: new BrainstormPromptService(store),
      resolveLlm: () => ({ llm: new FakeLLMProvider(), provider: 'fake', model: 'm' }),
      limiter: new RateLimiter(100, 1000),
      now: () => now,
    })
    const current = store.ideas.get(profile, idea.id)!
    const user = { id: store.users.findByEmail('ada@example.com')!.id, name: 'Ada' }
    service.begin(current, user, { start: true }) // never iterated, as if the connection dropped first
    expect(() => service.begin(current, user, { text: 'again' })).toThrow(/Ada is waiting/)
    now += REPLY_TIMEOUT_MS + 31_000
    expect(() => service.begin(current, user, { text: 'again' })).not.toThrow()
  })

  it('slows down someone sending a great many messages', async () => {
    const { ctx, ada, send } = await world()
    ctx.setChat(() => ({ text: 'Ok.' }))
    await send(ada, START)
    for (let i = 1; i < 30; i++) expect((await send(ada, say(`Message ${i}`))).status).toBe(200)
    const limited = await send(ada, say('One too many'))
    expect(limited.status).toBe(429)
    expect(limited.error).toMatch(/very quickly/)
  })
})

describe('stopping a reply', () => {
  it('keeps what was said so far, as a stopped message with no half-made suggestions', async () => {
    const { ctx, profile, idea } = await world()
    const store = ctx.store
    const llm = new FakeLLMProvider(undefined, () => ({
      text: 'one two three four',
      toolCalls: [update({ name: 'never made' }), addNote('never noted')],
    }))
    const service = new BrainstormService({
      store,
      prompts: new BrainstormPromptService(store),
      resolveLlm: () => ({ llm, provider: 'fake', model: 'm' }),
      limiter: new RateLimiter(100, 1000),
    })
    const current = store.ideas.get(profile, idea.id)!
    const user = { id: store.users.findByEmail('ada@example.com')!.id, name: 'Ada' }
    const stop = new AbortController()
    const events: BrainstormEvent[] = []
    for await (const e of service.begin(current, user, { start: true }).run(stop.signal)) {
      events.push(e)
      if (e.type === 'text') stop.abort() // the person presses Stop after the first word
    }
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      message: { text: 'one ', status: 'stopped', stopReason: null, proposals: [], notes: [] },
    })
    expect(service.conversation(current).replyingNow).toBeNull()
    expect(store.notes.list(idea.id).map((n) => n.text)).toEqual(['Erosion loops.']) // nothing was noted
    // A stopped reply is replayed as it stands.
    expect(store.conversations.messages(idea.id).at(-1)).toMatchObject({
      role: 'assistant',
      status: 'stopped',
      content: [{ type: 'text', text: 'one ' }],
    })
  })
})

describe('starting afresh', () => {
  it('wipes the thread and its suggestions for everyone, so brainstorming can begin again', async () => {
    const { ctx, ada, base, send, thread, proposalsOf } = await world()
    ctx.setChat(() => ({ text: 'Hmm.', toolCalls: [create({ name: 'X', notes: 'y' })] }))
    await send(ada, START)
    expect(await proposalsOf()).toHaveLength(1)

    expect((await ada.delete(base)).status).toBe(204)
    expect((await thread()).messages).toEqual([])
    expect((await send(ada, START)).status).toBe(200)
    expect((await thread()).messages).toHaveLength(2)
  })

  it('is for members only', async () => {
    const { ctx, base } = await world()
    const stranger = ctx.client()
    await register(stranger, 'eve@example.com', 'Eve')
    expect((await stranger.delete(base)).status).toBe(404)
  })
})

describe('what is kept when things are deleted', () => {
  it('removes the thread and its suggestions with the idea', async () => {
    const { ctx, ada, ideas, idea, send } = await world()
    ctx.setChat(() => ({ text: 'Hi.', toolCalls: [create({ name: 'X', notes: 'y' })] }))
    await send(ada, START)
    expect(ctx.store.conversations.messages(idea.id)).toHaveLength(2)
    expect((await ada.delete(`${ideas}/${idea.id}`)).status).toBe(204)
    expect(ctx.store.conversations.messages(idea.id)).toEqual([])
  })

  it("removes everything with the account of a profile's only member", async () => {
    const { ctx, ada, idea, send } = await world()
    await send(ada, START)
    const res = await ada.delete('/api/account', {
      confirmEmail: 'ada@example.com',
      password: PASSWORD,
    })
    expect(res.status).toBe(204)
    expect(ctx.store.conversations.messages(idea.id)).toEqual([])
  })

  it("keeps a departed member's messages in a shared profile, without their name", async () => {
    const { ada, send, thread, addBob } = await world()
    const bob = await addBob()
    await send(ada, START)
    await send(bob, say('Bob was here.'))
    const gone = await bob.delete('/api/account', {
      confirmEmail: 'bob@example.com',
      password: PASSWORD,
    })
    expect(gone.status).toBe(204)
    const messages = (await thread(ada)).messages
    expect(messages.filter((m) => m.role === 'user').map((m) => [m.text, m.authorName])).toEqual([
      ['', 'Ada'],
      ['Bob was here.', null],
    ])
  })
})
