import { beforeEach, describe, expect, it } from 'vitest'
import { FakeFeedFetcher, MAX_IDEA_LINKS } from '@lfwa/core'
import { register, setup, shareProfile, verifyAccounts, type TestClient } from './test-helpers'

type Post = { id: string; sourceId: string; title: string; url: string; status: string }
type Link = { id: string; url: string; title: string; authors: string[]; origin: string }

const day = (n: number) =>
  new Date(Date.parse('2026-01-01T00:00:00Z') - n * 86_400_000).toISOString()
const post = (id: string, daysAgo: number, extra = {}) => ({
  id,
  title: `Post ${id}`,
  url: `https://x.example/${id}`,
  summary: 'The start of it',
  authors: ['Ada'],
  publishedAt: day(daysAgo),
  ...extra,
})

describe('deciding about posts from the feeds', () => {
  let fetcher: FakeFeedFetcher
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let profile: string
  let api: string
  let ids: Record<string, string>

  async function start(feeds: ConstructorParameters<typeof FakeFeedFetcher>[0]) {
    fetcher = new FakeFeedFetcher(feeds)
    ctx = setup({ feeds: fetcher })
    ada = ctx.client()
    await register(ada)
    profile = (await (await ada.get('/api/profiles')).json())[0].id
    api = `/api/profiles/${profile}`
    ids = {}
    for (const url of Object.keys(feeds ?? {})) {
      ids[url] = (await (await ada.post(`${api}/sources`, { url })).json()).id
    }
    // The list is what a person decides from, and reading it is what keeps each feed's posts on the server.
    await ada.get(`${api}/sources/recent`)
  }
  const two = () =>
    start({
      'https://a.example/feed': { title: 'A', items: [post('a1', 1), post('a2', 2)] },
      'https://b.example/feed': { title: 'B', items: [post('b1', 3)] },
    })
  const ref = (feed: string, postId: string) => ({ sourceId: ids[feed]!, postId })
  const A = 'https://a.example/feed'
  const B = 'https://b.example/feed'
  const recent = async (c = ada): Promise<Post[]> =>
    (await (await c.get(`${api}/sources/recent`)).json()).posts
  const statuses = async () => Object.fromEntries((await recent()).map((p) => [p.id, p.status]))
  const decide = (what: 'add' | 'ignore' | 'reconsider', posts: object[], c = ada) =>
    c.post(`${api}/sources/recent/${what}`, { posts })
  const profileList = async (): Promise<Link[]> => (await ada.get(`${api}/reading`)).json()

  beforeEach(two)

  it('starts with every post new', async () => {
    expect(await statuses()).toEqual({ a1: 'new', a2: 'new', b1: 'new' })
  })

  it('adds a post to the profile’s reading list as from a feed, with the title and authors the feed gave', async () => {
    const res = await decide('add', [ref(A, 'a1')])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      results: [{ sourceId: ids[A], postId: 'a1', status: 'added' }],
    })
    expect(await profileList()).toEqual([
      expect.objectContaining({
        url: 'https://x.example/a1',
        title: 'Post a1',
        authors: ['Ada'],
        origin: 'feed',
        readAt: null,
      }),
    ])
    expect(await statuses()).toEqual({ a1: 'added', a2: 'new', b1: 'new' })
  })

  describe('the order of the list', () => {
    const order = async () => (await recent()).map((p) => p.id)
    const later = () => new Promise((resolve) => setTimeout(resolve, 5)) // decisions are told apart by their time

    it('has waiting posts newest first, then the decided ones', async () => {
      expect(await order()).toEqual(['a1', 'a2', 'b1'])
    })

    it('moves a post to the end when it is added, and when it is ignored', async () => {
      await decide('add', [ref(A, 'a1')])
      expect(await order()).toEqual(['a2', 'b1', 'a1'])
      await later()
      await decide('ignore', [ref(A, 'a2')])
      // b1 is the only one still waiting; the others follow in the order they were decided.
      expect(await order()).toEqual(['b1', 'a1', 'a2'])
    })

    it('puts the latest decision last, and keeps the waiting posts in date order', async () => {
      await decide('ignore', [ref(B, 'b1')])
      await later()
      await decide('add', [ref(A, 'a2')])
      await later()
      await decide('ignore', [ref(A, 'a1')])
      expect(await order()).toEqual(['b1', 'a2', 'a1'])
      expect((await recent()).map((p) => p.status)).toEqual(['ignored', 'added', 'ignored'])
    })

    it('counts a post put on a list by hand as decided then, and puts it at the end too', async () => {
      await ada.post(`${api}/reading`, { url: 'https://x.example/a1', title: 'By hand' })
      expect(await order()).toEqual(['a2', 'b1', 'a1'])
    })

    it('puts a post back where its date puts it when it is reconsidered', async () => {
      await decide('add', [ref(A, 'a1')])
      await later()
      await decide('ignore', [ref(A, 'a2')])
      expect(await order()).toEqual(['b1', 'a1', 'a2'])
      await decide('reconsider', [ref(A, 'a1')])
      await decide('reconsider', [ref(A, 'a2')])
      expect(await order()).toEqual(['a1', 'a2', 'b1'])
    })
  })

  it('reads nothing from the internet to do so', async () => {
    const before = fetcher.itemsRead.length
    await decide('add', [ref(A, 'a1')])
    await decide('ignore', [ref(A, 'a2')])
    await decide('reconsider', [ref(A, 'a2')])
    expect(fetcher.itemsRead).toHaveLength(before)
  })

  it('adds several together, or none: one that is already listed refuses the lot', async () => {
    await ada.post(`${api}/reading`, { url: 'https://x.example/a2', title: 'By hand' })
    const res = await decide('add', [ref(A, 'a1'), ref(A, 'a2')])
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('already on a reading list')
    expect((await profileList()).map((l) => l.url)).toEqual(['https://x.example/a2'])
    const ok = await decide('add', [ref(A, 'a1'), ref(B, 'b1')])
    expect((await ok.json()).results.map((r: { status: string }) => r.status)).toEqual([
      'added',
      'added',
    ])
    expect(await profileList()).toHaveLength(3)
  })

  it('counts a post put on a reading list by hand, or on an idea’s, as added', async () => {
    await ada.post(`${api}/reading`, { url: 'https://x.example/a1', title: 'By hand' })
    const idea = (await (await ada.post(`${api}/ideas`, { name: 'Rivers' })).json()).id
    await ada.post(`${api}/ideas/${idea}/links`, { url: 'https://x.example/b1' })
    expect(await statuses()).toEqual({ a1: 'added', a2: 'new', b1: 'added' })
    expect((await decide('add', [ref(A, 'a1')])).status).toBe(409)
  })

  it('ignores a post: it stays listed, marked, and nothing is added', async () => {
    const res = await decide('ignore', [ref(A, 'a2')])
    expect((await res.json()).results[0].status).toBe('ignored')
    expect(await statuses()).toEqual({ a1: 'new', a2: 'ignored', b1: 'new' })
    expect(await profileList()).toEqual([])
    expect((await decide('ignore', [ref(A, 'a2')])).status).toBe(200) // again is fine
  })

  it('shares what was decided with everyone in the profile', async () => {
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    await decide('ignore', [ref(A, 'a2')], bob)
    expect((await recent(bob)).find((p) => p.id === 'a2')?.status).toBe('ignored')
    expect((await recent()).find((p) => p.id === 'a2')?.status).toBe('ignored')
  })

  it('will not ignore what is already on a reading list', async () => {
    await decide('add', [ref(A, 'a1')])
    const res = await decide('ignore', [ref(A, 'a1')])
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("can't be ignored")
  })

  it('takes an ignore back, so the post is new again', async () => {
    await decide('ignore', [ref(A, 'a2')])
    const res = await decide('reconsider', [ref(A, 'a2')])
    expect((await res.json()).results[0].status).toBe('new')
    expect((await statuses()).a2).toBe('new')
  })

  it('takes an add back: the item comes off the profile’s list, and its notes stay without a source', async () => {
    await decide('add', [ref(A, 'a1')])
    const [item] = await profileList()
    await ada.post(`${api}/notes`, { text: 'A thought', readingItemId: item!.id })
    const res = await decide('reconsider', [ref(A, 'a1')])
    expect((await res.json()).results[0].status).toBe('new')
    expect(await profileList()).toEqual([])
    const notes = await (await ada.get(`${api}/notes`)).json()
    expect(notes).toEqual([expect.objectContaining({ text: 'A thought', readingItemId: null })])
  })

  it('cannot take back an add that has been moved to an idea: it has to come off there', async () => {
    await decide('add', [ref(A, 'a1')])
    const [item] = await profileList()
    const idea = (await (await ada.post(`${api}/ideas`, { name: 'Rivers' })).json()).id
    await ada.post(`${api}/move/reading`, { ids: [item!.id], to: { ideaId: idea } })
    const res = await decide('reconsider', [ref(A, 'a1')])
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("idea's reading list")
    expect((await statuses()).a1).toBe('added')
  })

  it('offers a post again if its item is removed by hand, even if it was once ignored', async () => {
    await decide('ignore', [ref(A, 'a1')])
    await decide('add', [ref(A, 'a1')])
    const [item] = await profileList()
    await ada.delete(`${api}/reading/${item!.id}`)
    expect((await statuses()).a1).toBe('new') // not "ignored": it was added, after all
  })

  it('treats one post carried by two feeds as one', async () => {
    await start({
      'https://a.example/feed': {
        title: 'A',
        items: [post('a1', 1, { url: 'https://same.example/story' })],
      },
      'https://b.example/feed': {
        title: 'B',
        items: [post('b1', 2, { url: 'https://same.example/story#top' })],
      },
    })
    expect(await recent()).toHaveLength(1)
    await decide('add', [ref(A, 'a1')])
    expect((await decide('add', [ref(B, 'b1')])).status).toBe(409) // already on the list
    expect((await recent())[0]!.status).toBe('added')
  })

  it('has no limit on the profile’s own reading list', async () => {
    for (let i = 0; i < MAX_IDEA_LINKS + 10; i++) {
      ctx.store.reading.add(profile, null, { url: `https://fill${i}.example/`, title: 't' })
    }
    const res = await decide('add', [ref(A, 'a1')])
    expect(res.status).toBe(200)
    expect(await profileList()).toHaveLength(MAX_IDEA_LINKS + 11)
  })

  it('says what is wrong with a post that is not there, and what is not the profile’s', async () => {
    const gone = await decide('add', [{ sourceId: ids[A], postId: 'not-in-the-feed' }])
    expect(gone.status).toBe(409)
    expect((await gone.json()).error).toContain('Check for new posts')
    expect((await decide('add', [{ sourceId: 'nope', postId: 'a1' }])).status).toBe(404)
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await decide('add', [ref(A, 'a1')], bob)).status).toBe(404)
    expect(await profileList()).toEqual([])
  })

  it('refuses an empty choice or too many at once', async () => {
    expect((await decide('add', [])).status).toBe(400)
    const many = Array.from({ length: 21 }, () => ref(A, 'a1'))
    expect((await decide('ignore', many)).status).toBe(400)
  })
})
