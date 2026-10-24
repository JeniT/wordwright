import { describe, expect, it } from 'vitest'
import {
  FakePageInfoFetcher,
  MAX_READING_SUGGESTIONS_PER_REPLY,
  type BrainstormEvent,
} from '@wordwright/core'
import { addressesWrittenBy } from './services/brainstorm'
import { ArticleChecker } from './services/article-suggestions'
import { register, saveKey, setup, type TestClient } from './test-helpers'

/**
 * The coach suggesting a page for the articles (#38). It can only pass on an address a person wrote in the
 * conversation; the address is then checked, shown with what was found, and added only when a person accepts it.
 * (Research, which searches the web, is tested in research.test.ts.)
 */

const parseSse = (text: string): BrainstormEvent[] =>
  text
    .split('\n\n')
    .map((chunk) => chunk.split('\n').find((line) => line.startsWith('data:')))
    .filter((line): line is string => !!line)
    .map((line) => JSON.parse(line.slice('data:'.length).trim()) as BrainstormEvent)

const OK = 'https://example.org/river-physics'
const UNTITLED = 'https://example.org/untitled-report'
const MISSING = 'https://nonexistent.example.org/gone'
const PRIVATE = 'https://private.example.org/intranet'
const suggest = (url: unknown, extra: object = {}) => ({
  name: 'suggest_reading',
  input: { url, title: 'The AI’s title', why: 'It explains how bends grow.', ...extra },
})
/** Every address the tests below have the writer type, so that the coach may pass them on. */
const GIVEN = [
  OK,
  UNTITLED,
  MISSING,
  PRIVATE,
  'https://example.org/other',
  'https://example.org/authored-piece',
  ...Array.from(
    { length: MAX_READING_SUGGESTIONS_PER_REPLY + 2 },
    (_, i) => `https://example.org/page-${i}`,
  ),
  'http://www.example.org/paper/',
  'https://www.example.org/river-physics#intro',
].join(' ')

interface Proposal {
  id: string
  tool: string
  input: { url?: string; title?: string; why?: string }
  status: string
  reading: {
    check: string
    fetchedTitle: string | null
    fetchedAuthors: string[]
  } | null
}
interface Thread {
  messages: {
    role: string
    kind: string
    text: string
    proposals: Proposal[]
  }[]
}

async function world() {
  const ctx = setup()
  const ada = ctx.client()
  await register(ada, 'ada@example.com', 'Ada')
  await saveKey(ada)
  const publication = (await (await ada.get('/api/publications')).json())[0].id as string
  const ideas = `/api/publications/${publication}/ideas`
  const idea = await (
    await ada.post(ideas, { name: 'Why rivers meander', notes: 'Erosion loops.' })
  ).json()
  ctx.store.ideas.addLink(idea.id, { url: 'https://example.org/paper', title: 'A paper' })
  await ada.post(`${ideas}/${idea.id}/drafts`, { title: 'Part 1', body: 'SECRET DRAFT BODY' })
  const conversationId = ctx.store.conversations.create(idea.id)
  const base = `${ideas}/${idea.id}/conversations/${conversationId}`

  const say = async (client: TestClient, text = `Some pages: ${GIVEN}`) => {
    const res = await client.post(`${base}/messages`, { text })
    return { status: res.status, events: res.status === 200 ? parseSse(await res.text()) : [] }
  }
  const thread = async () => (await (await ada.get(base)).json()) as Thread
  const proposals = async () => (await thread()).messages.flatMap((m) => m.proposals)
  const articleList = async () =>
    (await (await ada.get(`${ideas}/${idea.id}`)).json()).articles as {
      url: string
      title: string
      origin: string
      why: string | null
    }[]
  const decide = (id: string, action: 'accept' | 'dismiss') =>
    ada.post(`${base}/proposals/${id}/${action}`, {})
  return { ctx, ada, idea, ideas, base, say, thread, proposals, articleList, decide }
}

describe('the coach suggesting a page', () => {
  it('becomes a pending suggestion with the AI’s title beside the page’s real one, and changes nothing yet', async () => {
    const { ctx, ada, say, proposals, articleList } = await world()
    ctx.setChat(() => ({ text: 'Try this.', toolCalls: [suggest(OK)] }))
    const { events } = await say(ada)
    expect(events.map((e) => e.type)).toEqual(['message', 'text', 'text', 'proposal', 'done'])

    expect(await proposals()).toMatchObject([
      {
        tool: 'suggest_reading',
        input: { url: OK, title: 'The AI’s title', why: 'It explains how bends grow.' },
        reading: {
          check: 'found',
          fetchedTitle: 'Fake title for example.org',
        },
      },
    ])
    expect(await articleList()).toHaveLength(1) // only the paper that was already there
    expect(ctx.pageFetcher.calls).toEqual([OK])
  })

  it('is flagged, before anyone can accept it, when the page has no title, does not exist or is not public', async () => {
    const { ctx, ada, say, proposals } = await world()
    ctx.setChat(() => ({
      toolCalls: [suggest(UNTITLED), suggest(MISSING)],
    }))
    await say(ada)
    ctx.setChat(() => ({ toolCalls: [suggest(PRIVATE)] }))
    await say(ada, 'More')
    expect(
      (await proposals()).map((p) => [p.input.url, p.reading?.check, p.reading?.fetchedTitle]),
    ).toEqual([
      [UNTITLED, 'no-title', null],
      [MISSING, 'not-found', null],
      [PRIVATE, 'not-public', null],
    ])
  })

  it('tells the AI, when it next speaks, that an address could not be found', async () => {
    const { ctx, ada, say } = await world()
    ctx.setChat((_request, call) =>
      call === 1
        ? { text: 'Two pages.', toolCalls: [suggest(MISSING), suggest(OK)] }
        : { text: 'Noted.' },
    )
    await say(ada)
    await say(ada, 'Thanks')
    const results = ctx.chats[1]!.request.messages.flatMap((m) =>
      typeof m.content === 'string' ? [] : m.content.filter((b) => b.type === 'tool_result'),
    )
    expect(results.map((r) => (r.type === 'tool_result' ? r.content : ''))).toEqual([
      expect.stringContaining('could not find a website at that address'),
      expect.not.stringContaining('could not find'),
    ])
  })

  it('drops an invalid address, a page already on the list (however it is written), a repeat, and anything past the limit', async () => {
    const { ctx, ada, say, proposals } = await world()
    const pages = Array.from({ length: MAX_READING_SUGGESTIONS_PER_REPLY + 2 }, (_, i) =>
      suggest(`https://example.org/page-${i}`),
    )
    ctx.setChat(() => ({
      toolCalls: [
        suggest('not an address'),
        suggest('http://www.example.org/paper/'), // the same page as the one already listed
        suggest(''),
        { name: 'suggest_reading', input: { title: 'No address', why: 'x' } },
        suggest(OK),
        suggest('https://www.example.org/river-physics#intro'), // the same page as the one before
        ...pages,
      ],
    }))
    await say(ada)
    const kept = (await proposals()).map((p) => p.input.url)
    expect(kept).toEqual([OK, 'https://example.org/page-0', 'https://example.org/page-1'])
    expect(kept.length).toBeLessThanOrEqual(MAX_READING_SUGGESTIONS_PER_REPLY)
    // Only what was going to be shown was looked at.
    expect(ctx.pageFetcher.calls).toEqual(kept)
  })

  it('goes in the articles as "suggested in brainstorming" under the page’s real title when accepted', async () => {
    const { ctx, ada, say, proposals, articleList, decide } = await world()
    ctx.setChat(() => ({ toolCalls: [suggest(OK)] }))
    await say(ada)
    const [p] = await proposals()
    const res = await decide(p!.id, 'accept')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'accepted' })
    expect(await articleList()).toMatchObject([
      { url: 'https://example.org/paper', origin: 'entered', why: null },
      {
        url: OK,
        title: 'Fake title for example.org',
        origin: 'brainstorm',
        why: 'It explains how bends grow.',
      },
    ])
  })

  it('carries who the page says wrote it onto the article when accepted', async () => {
    const { ctx, ada, say, proposals, decide, ideas, idea } = await world()
    ctx.setChat(() => ({ toolCalls: [suggest('https://example.org/authored-piece')] }))
    await say(ada)
    const [p] = await proposals()
    expect(p!.reading!.fetchedAuthors).toEqual(['Ada Author', 'Bo Writer'])
    await decide(p!.id, 'accept')
    const added = (await (await ada.get(`${ideas}/${idea.id}`)).json()).articles.at(-1)
    expect(added).toMatchObject({ authors: ['Ada Author', 'Bo Writer'], origin: 'brainstorm' })
  })

  it('keeps the AI’s title when the page has none, and the item is unread', async () => {
    const { ctx, ada, say, proposals, articleList, decide, ideas, idea } = await world()
    ctx.setChat(() => ({ toolCalls: [suggest(UNTITLED, { title: 'A report' })] }))
    await say(ada)
    await decide((await proposals())[0]!.id, 'accept')
    expect(await articleList()).toMatchObject([{}, { url: UNTITLED, title: 'A report' }])
    const added = (await (await ada.get(`${ideas}/${idea.id}`)).json()).articles[1]
    expect(added.readAt).toBeNull()
  })

  it('cannot be accepted when the address does not exist or is not public, only dismissed', async () => {
    const { ctx, ada, say, proposals, articleList, decide } = await world()
    ctx.setChat(() => ({ toolCalls: [suggest(MISSING), suggest(PRIVATE)] }))
    await say(ada)
    for (const p of await proposals()) {
      const res = await decide(p.id, 'accept')
      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(/can't be added/)
    }
    expect(await articleList()).toHaveLength(1)
    expect((await proposals()).every((p) => p.status === 'pending')).toBe(true)
    expect((await decide((await proposals())[0]!.id, 'dismiss')).status).toBe(200)
  })

  it('is refused if the writer has since added the page themselves, or the list has filled up', async () => {
    const { ctx, ada, say, proposals, decide, ideas, idea } = await world()
    ctx.setChat(() => ({ toolCalls: [suggest(OK), suggest('https://example.org/other')] }))
    await say(ada)
    const [first, second] = await proposals()
    await ada.post(`${ideas}/${idea.id}/articles`, { url: OK })
    const duplicate = await decide(first!.id, 'accept')
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error).toMatch(/already in this idea/)

    for (let i = 0; i < 50; i++) {
      ctx.store.ideas.addLink(idea.id, { url: `https://filler.example.org/${i}`, title: '' })
      if ((await (await ada.get(`${ideas}/${idea.id}`)).json()).articles.length >= 50) break
    }
    const full = await decide(second!.id, 'accept')
    expect(full.status).toBe(409)
    expect((await full.json()).error).toMatch(/up to 50 articles/)
  })

  it('does nothing to the list when dismissed, and says so to the AI', async () => {
    const { ctx, ada, say, proposals, articleList, decide } = await world()
    ctx.setChat((_request, call) =>
      call === 1 ? { text: 'Try this.', toolCalls: [suggest(OK)] } : { text: 'ok' },
    )
    await say(ada)
    await decide((await proposals())[0]!.id, 'dismiss')
    expect(await articleList()).toHaveLength(1)
    await say(ada, 'No thanks')
    const answer = ctx.chats[1]!.request.messages.flatMap((m) =>
      typeof m.content === 'string' ? [] : m.content,
    ).find((b) => b.type === 'tool_result')
    expect(answer).toMatchObject({ content: expect.stringContaining('dismissed') })
  })
})

describe('which addresses the coach may pass on', () => {
  it('discards an address the writer never wrote, however sure the coach is', async () => {
    const { ctx, ada, say, proposals } = await world()
    ctx.setChat(() => ({
      toolCalls: [suggest('https://remembered.example.org/famous-paper'), suggest(OK)],
    }))
    await say(ada, `I read about this at ${OK} last week.`)
    expect((await proposals()).map((p) => p.input.url)).toEqual([OK])
    expect(ctx.pageFetcher.calls).toEqual([OK]) // the other was never looked at
  })

  it('recognises the writer’s address however it was written, even in an earlier message', async () => {
    const { ctx, ada, say, proposals } = await world()
    ctx.setChat((_request, call) =>
      call === 1 ? { text: 'Go on.' } : { toolCalls: [suggest(OK)] },
    )
    await say(ada, 'See www.example.org/river-physics/, which I liked.')
    await say(ada, 'Could you suggest that for my articles?')
    expect((await proposals()).map((p) => p.input.url)).toEqual([OK])
  })

  it('does not count addresses the coach itself wrote', async () => {
    const { ctx, ada, say, proposals } = await world()
    ctx.setChat((_request, call) =>
      call === 1 ? { text: `Try ${OK} maybe.` } : { toolCalls: [suggest(OK)] },
    )
    await say(ada, 'Where could I read about it?')
    await say(ada, 'Add that one to my list.')
    expect(await proposals()).toEqual([])
  })

  it('reads addresses from what people wrote, and from nobody else', () => {
    const message = (role: 'user' | 'assistant', displayText: string) =>
      ({ role, displayText }) as Parameters<typeof addressesWrittenBy>[0][number]
    const keys = addressesWrittenBy([
      message(
        'user',
        'Try (https://a.example.org/x?y=1), and http://www.b.example.org/z/. Also www.c.example.org.',
      ),
      message('assistant', 'https://coach.example.org/made-up'),
      message('user', 'no address here'),
    ])
    expect([...keys].sort()).toEqual(['a.example.org/x?y=1', 'b.example.org/z', 'c.example.org'])
  })
})

describe('the address checks', () => {
  const idea = {
    id: 'i',
    publicationId: 'p',
    name: 'An idea',
    notes: '',
    articles: [
      {
        id: 'l',
        url: 'https://listed.example.org/a',
        title: '',
        authors: [],
        tags: [],
        readAt: null,
        origin: 'entered' as const,
      },
    ],
    drafts: [],
    pendingSuggestions: 0,
    createdAt: 'x',
    updatedAt: 'x',
  }
  const candidate = (url: string, ref = url) => ({ ref, url, title: 't', why: 'w' })

  it('keep at most the number asked for, in order, and look only at those', async () => {
    const pages = new FakePageInfoFetcher()
    const checker = new ArticleChecker(pages)
    const checked = await checker.check(
      idea,
      [
        'https://a.example.org/1',
        'https://listed.example.org/a',
        'https://a.example.org/2',
        'https://a.example.org/3',
      ].map((u) => candidate(u)),
      2,
    )
    expect(checked.map((c) => c.ref)).toEqual([
      'https://a.example.org/1',
      'https://a.example.org/2',
    ])
    expect(pages.calls).toEqual(checked.map((c) => c.ref))
  })

  it('shorten a title or reason that is too long rather than lose the suggestion', async () => {
    const checker = new ArticleChecker(new FakePageInfoFetcher())
    const [checked] = await checker.check(
      idea,
      [{ ref: 'r', url: 'https://a.example.org/1', title: 'T'.repeat(500), why: 'W'.repeat(900) }],
      3,
    )
    expect(checked!.title).toHaveLength(200)
    expect(checked!.why).toHaveLength(300)
  })

  it('pass the abort signal on, so leaving the page stops the lookups', async () => {
    const controller = new AbortController()
    controller.abort()
    const [checked] = await new ArticleChecker(new FakePageInfoFetcher()).check(
      idea,
      [candidate('https://a.example.org/1')],
      3,
      controller.signal,
    )
    expect(checked).toMatchObject({ check: 'no-title', fetchedTitle: null })
  })
})
