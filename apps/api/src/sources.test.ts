import { beforeEach, describe, expect, it } from 'vitest'
import { FakeFeedFetcher, MAX_SOURCES_PER_PUBLICATION, TINY_PNG } from '@wordwright/core'
import { register, setup, sharePublication, verifyAccounts, type TestClient } from './test-helpers'

describe('idea sources', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let base: string

  const list = async (c = ada, path = base) => (await c.get(path)).json()
  const add = (url: string, c = ada) => c.post(base, { url })
  const urls = async () => (await list()).map((s: { url: string }) => s.url)

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    base = `/api/publications/${(await (await ada.get('/api/publications')).json())[0].id}/sources`
  })

  it('starts empty, and keeps sources in the order they were added', async () => {
    expect(await list()).toEqual([])
    const first = await add('https://a.example/feed.xml')
    expect(first.status).toBe(201)
    expect(await first.json()).toMatchObject({
      id: expect.any(String),
      url: 'https://a.example/feed.xml',
    })
    await add('https://b.example/rss')
    await add('https://c.example/atom')
    expect(await urls()).toEqual([
      'https://a.example/feed.xml',
      'https://b.example/rss',
      'https://c.example/atom',
    ])
  })

  it('tidies the pasted address: assumes https, trims, drops the fragment', async () => {
    const res = await add('  blog.example/feed#top ')
    expect((await res.json()).url).toBe('https://blog.example/feed')
  })

  it('refuses addresses that are not web pages, with a message a person can act on', async () => {
    for (const url of ['javascript:alert(1)', 'ftp://a.example/feed', 'not a url', '   ', '']) {
      const res = await add(url)
      expect(res.status, url).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
    expect(await list()).toEqual([])
  })

  it('refuses a feed that is already listed, even if written differently', async () => {
    await add('https://a.example/feed')
    const again = await add('a.example/feed#x')
    expect(again.status).toBe(409)
    expect((await again.json()).error).toContain('already')
    expect(await list()).toHaveLength(1)
  })

  it('limits how many sources a publication can have', async () => {
    const publicationId = base.split('/')[3]!
    for (let i = 0; i < MAX_SOURCES_PER_PUBLICATION; i++) {
      ctx.store.sources.add(publicationId, `https://s${i}.example/feed`)
    }
    const res = await add('https://one-too-many.example/feed')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain(`${MAX_SOURCES_PER_PUBLICATION}`)
  })

  it('removes a source and keeps the rest in order, so later additions go last', async () => {
    // One at a time: a source's place is its order of arrival, so concurrent adds would race.
    const ids: string[] = []
    for (const n of ['a', 'b', 'c'])
      ids.push((await (await add(`https://${n}.example/f`)).json()).id)
    const [a, b, c] = ids
    expect(a).toBeTruthy()
    expect((await ada.delete(`${base}/${b}`)).status).toBe(204)
    await add('https://d.example/f')
    expect(await urls()).toEqual([
      'https://a.example/f',
      'https://c.example/f',
      'https://d.example/f',
    ])
    expect((await ada.delete(`${base}/${b}`)).status).toBe(404) // already gone
    expect(c).toBeTruthy()
  })

  it('has no way to reorder: feeds stay in the order they were added', async () => {
    const ids: string[] = []
    for (const n of ['a', 'b']) ids.push((await (await add(`https://${n}.example/f`)).json()).id)
    expect(
      (await ada.put(`${base}/order`, { ids: [ids[1], ids[0]] })).status,
    ).toBeGreaterThanOrEqual(404)
    expect(await urls()).toEqual(['https://a.example/f', 'https://b.example/f'])
  })

  it('lets any member of the publication read and change the list', async () => {
    const { id } = await (await add('https://a.example/f')).json()
    await sharePublication(ctx, ada, base.split('/')[3]!, bob, 'bob@example.com')

    expect(await list(bob)).toHaveLength(1)
    await (await add('https://b.example/f', bob)).json()
    expect(await urls()).toEqual(['https://a.example/f', 'https://b.example/f'])
    expect((await bob.delete(`${base}/${id}`)).status).toBe(204)
    expect(await urls()).toEqual(['https://b.example/f'])
  })

  it("hides one publication's sources from people who aren't in it, and can't be reached through another", async () => {
    const { id } = await (await add('https://a.example/f')).json()
    expect((await bob.get(base)).status).toBe(404)
    expect((await add('https://x.example/f', bob)).status).toBe(404)
    expect((await bob.delete(`${base}/${id}`)).status).toBe(404)

    // Bob's own publication cannot be used to delete Ada's source by guessing its id.
    const bobBase = `/api/publications/${(await (await bob.get('/api/publications')).json())[0].id}/sources`
    expect((await bob.delete(`${bobBase}/${id}`)).status).toBe(404)
    expect(await list()).toHaveLength(1)
    expect(await list(bob, bobBase)).toEqual([])
  })

  describe('a website that offers several feeds', () => {
    const fetcher = new FakeFeedFetcher({
      'https://site.example/': {
        advertises: [
          { url: 'https://site.example/comments/feed', title: 'Comments', comments: true },
          { url: 'https://site.example/feed', title: 'Posts' },
          { url: 'https://site.example/podcast', title: 'Podcast' },
        ],
      },
      'https://site.example/feed': { title: 'Posts' },
      'https://site.example/podcast': { title: 'Podcast' },
      'https://one.example/': { advertises: [{ url: 'https://one.example/feed' }] },
      'https://one.example/feed': { title: 'Only feed' },
    })
    let user: TestClient
    let path: string
    beforeEach(async () => {
      const c = setup({ feeds: fetcher })
      user = c.client()
      await register(user)
      path = `/api/publications/${(await (await user.get('/api/publications')).json())[0].id}/sources`
    })
    const listed = async () =>
      (await (await user.get(path)).json()).map((s: { url: string }) => s.url)

    it('answers with the choices, posts first and comments last, and adds nothing', async () => {
      const res = await user.post(path, { url: 'site.example' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        choices: [
          {
            url: 'https://site.example/feed',
            title: 'Posts',
            comments: false,
            alreadyAdded: false,
          },
          {
            url: 'https://site.example/podcast',
            title: 'Podcast',
            comments: false,
            alreadyAdded: false,
          },
          {
            url: 'https://site.example/comments/feed',
            title: 'Comments',
            comments: true,
            alreadyAdded: false,
          },
        ],
      })
      expect(await listed()).toEqual([])
    })

    it('adds a chosen feed the ordinary way, and then marks it as already added', async () => {
      const added = await user.post(path, { url: 'https://site.example/podcast' })
      expect(added.status).toBe(201)
      expect(await added.json()).toMatchObject({ url: 'https://site.example/podcast' })
      const again = await (await user.post(path, { url: 'site.example' })).json()
      expect(again.choices.map((c: { alreadyAdded: boolean }) => c.alreadyAdded)).toEqual([
        false,
        true,
        false,
      ])
    })

    it('adds the feed straight away when a site advertises just one', async () => {
      const res = await user.post(path, { url: 'https://one.example/' })
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({
        url: 'https://one.example/feed',
        title: 'Only feed',
      })
    })

    it('explains when a site has no feed, and counts discovery towards the hourly limit', async () => {
      const res = await user.post(path, { url: 'https://x.example/notafeed' })
      expect(res.status).toBe(422)
      expect((await res.json()).error).toContain('RSS or Atom')
    })
  })

  it('reads each feed when it is added and keeps its title, description and website', async () => {
    const fetcher = new FakeFeedFetcher({
      'https://slow.example/feed': {
        title: 'The Slow Reader',
        description: 'Essays on reading',
        siteUrl: 'https://slow.example/',
      },
    })
    const c = setup({ feeds: fetcher })
    const user = c.client()
    await register(user)
    const publication = (await (await user.get('/api/publications')).json())[0].id
    const res = await user.post(`/api/publications/${publication}/sources`, {
      url: 'slow.example/feed',
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      id: expect.any(String),
      url: 'https://slow.example/feed',
      title: 'The Slow Reader',
      description: 'Essays on reading',
      siteUrl: 'https://slow.example/',
      iconUrl: null,
      iconSquare: false,
      lastWorkedAt: null,
      lastError: null,
    })
    expect(fetcher.inspected).toEqual(['https://slow.example/feed'])
  })

  it('keeps the feed’s icon and serves it to members only', async () => {
    const fetcher = new FakeFeedFetcher({
      'https://pic.example/feed': { title: 'Pic', icon: true },
    })
    const c = setup({ feeds: fetcher })
    const user = c.client()
    const outsider = c.client()
    await register(user)
    await register(outsider, 'eve@example.com', 'Eve')
    const publication = (await (await user.get('/api/publications')).json())[0].id
    const source = await (
      await user.post(`/api/publications/${publication}/sources`, {
        url: 'https://pic.example/feed',
      })
    ).json()
    expect(source.iconUrl).toMatch(
      new RegExp(`^/api/publications/${publication}/sources/${source.id}/icon\\?v=\\d+$`),
    )

    const image = await user.get(source.iconUrl)
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(image.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await image.bytes()).toEqual(TINY_PNG)
    expect((await outsider.get(source.iconUrl)).status).toBe(404)
    expect((await user.get(`/api/publications/${publication}/sources/nope/icon`)).status).toBe(404)

    // It goes when the source does.
    await user.delete(`/api/publications/${publication}/sources/${source.id}`)
    expect((await user.get(source.iconUrl)).status).toBe(404)
  })

  it('says whether the feed’s icon is square to its corners (#226)', async () => {
    const fetcher = new FakeFeedFetcher({
      'https://big.example/feed': { title: 'Big', icon: 'square' },
      'https://small.example/feed': { title: 'Small', icon: true },
    })
    const c = setup({ feeds: fetcher })
    const user = c.client()
    await register(user)
    const publication = (await (await user.get('/api/publications')).json())[0].id
    const add = async (url: string) =>
      (await user.post(`/api/publications/${publication}/sources`, { url })).json()
    expect((await add('https://big.example/feed')).iconSquare).toBe(true)
    expect((await add('https://small.example/feed')).iconSquare).toBe(false)
    const listed = await (await user.get(`/api/publications/${publication}/sources`)).json()
    expect(listed.map((s: { iconSquare: boolean }) => s.iconSquare)).toEqual([true, false])
  })

  it('has no icon when the feed offers none', async () => {
    const fetcher = new FakeFeedFetcher({ 'https://noicon.example/f': { title: 'No icon' } })
    const c = setup({ feeds: fetcher })
    const user = c.client()
    await register(user)
    const publication = (await (await user.get('/api/publications')).json())[0].id
    const res = await user.post(`/api/publications/${publication}/sources`, {
      url: 'https://noicon.example/f',
    })
    expect((await res.json()).iconUrl).toBeNull()
  })

  it('explains, and adds nothing, when the address is not a feed or cannot be reached', async () => {
    const notAFeed = await add('https://x.example/notafeed')
    expect(notAFeed.status).toBe(422)
    expect((await notAFeed.json()).error).toContain('RSS or Atom')
    const down = await add('https://unreachable.example/f')
    expect(down.status).toBe(422)
    expect((await down.json()).error).toContain('reach')
    expect(await list()).toEqual([])
  })

  it('stores the feed found on a website, and spots when it is already listed', async () => {
    const fetcher = new FakeFeedFetcher({
      'https://site.example/': { url: 'https://site.example/feed.xml', title: 'Site' },
      'https://site.example/feed.xml': { title: 'Site' },
    })
    const c = setup({ feeds: fetcher })
    const user = c.client()
    await register(user)
    const publication = (await (await user.get('/api/publications')).json())[0].id
    const path = `/api/publications/${publication}/sources`
    expect((await (await user.post(path, { url: 'https://site.example/' })).json()).url).toBe(
      'https://site.example/feed.xml',
    )
    const again = await user.post(path, { url: 'https://site.example/' })
    expect(again.status).toBe(409)
    expect((await user.get(path).then((r) => r.json())).length).toBe(1)
  })

  it('does not read the internet for an address that is already listed or invalid', async () => {
    const fetcher = new FakeFeedFetcher({}, () => ({ title: 'T' }))
    const c = setup({ feeds: fetcher })
    const user = c.client()
    await register(user)
    const path = `/api/publications/${(await (await user.get('/api/publications')).json())[0].id}/sources`
    await user.post(path, { url: 'https://a.example/f' })
    await user.post(path, { url: 'https://a.example/f' })
    await user.post(path, { url: 'ftp://a.example/f' })
    expect(fetcher.inspected).toEqual(['https://a.example/f'])
  })

  it('limits how fast one person can add sources, since each add reads the internet', async () => {
    const statuses: number[] = []
    const publicationId = base.split('/')[3]!
    for (let i = 0; i < 32; i++) {
      statuses.push((await add(`https://r${i}.example/f`)).status)
      if (statuses.length === 25)
        ctx.store.sources.remove(publicationId, ctx.store.sources.list(publicationId)[0]!.id)
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true)
    expect(statuses.slice(30)).toEqual([429, 429])
  })

  it('requires signing in', async () => {
    expect((await ctx.client().get(base)).status).toBe(401)
  })

  it('goes with the publication when it is renamed, and when it is deleted', async () => {
    await add('https://a.example/f')
    const publicationId = base.split('/')[3]!
    const renamed = await (
      await ada.patch(`/api/publications/${publicationId}`, { name: 'Renamed' })
    ).json()
    expect(renamed.id).not.toBe(publicationId)
    expect(await list(ada, `/api/publications/${renamed.id}/sources`)).toHaveLength(1)

    await ada.delete(`/api/publications/${renamed.id}`)
    expect(ctx.store.sources.count(renamed.id)).toBe(0)
  })

  it('is removed with the account of a publication’s only member', async () => {
    await add('https://a.example/f')
    const publicationId = base.split('/')[3]!
    expect(
      (
        await ada.delete('/api/account', {
          password: 'correct horse battery',
        })
      ).status,
    ).toBe(204)
    expect(ctx.store.sources.count(publicationId)).toBe(0)
  })
})

describe('recent posts of a source', () => {
  const post = (n: number) => ({
    id: `p${n}`,
    title: `Post ${n}`,
    url: `https://news.example/p${n}`,
    summary: `About ${n}`,
    authors: ['Ada'],
    publishedAt: '2026-01-01T00:00:00.000Z',
  })
  let fetcher: FakeFeedFetcher
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let base: string
  let sourceId: string

  async function start(feeds: ConstructorParameters<typeof FakeFeedFetcher>[0]) {
    fetcher = new FakeFeedFetcher(feeds)
    ctx = setup({ feeds: fetcher })
    ada = ctx.client()
    await register(ada)
    base = `/api/publications/${(await (await ada.get('/api/publications')).json())[0].id}/sources`
    sourceId = (await (await ada.post(base, { url: 'https://news.example/feed' })).json()).id
  }
  const items = (query = '') => ada.get(`${base}/${sourceId}/items${query}`)
  const listed = async () => (await (await ada.get(base)).json())[0]

  it('reads the posts the first time, and answers from the kept copy for the next few hours', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1), post(2)] } })
    const first = await items()
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      items: [post(1), post(2)],
      checkedAt: '2026-01-01T00:00:00.000Z',
      lastWorkedAt: '2026-01-01T00:00:00.000Z',
      lastError: null,
    })
    ctx.clock.now = new Date('2026-01-01T02:59:00Z')
    await items()
    await items()
    expect(fetcher.itemsRead).toHaveLength(1) // not asked again
    ctx.clock.now = new Date('2026-01-01T03:01:00Z')
    await items()
    expect(fetcher.itemsRead).toHaveLength(2)
  })

  it('asks with what the feed last told us, and keeps the posts when nothing has changed', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)], etag: '"v1"' } })
    await items()
    ctx.clock.now = new Date('2026-01-01T04:00:00Z')
    const again = await (await items()).json()
    expect(fetcher.itemsRead).toHaveLength(2)
    expect(again.items).toEqual([post(1)])
    expect(again.checkedAt).toBe('2026-01-01T04:00:00.000Z')
    expect(again.lastWorkedAt).toBe('2026-01-01T04:00:00.000Z')
  })

  it('remembers a failure, keeps the old posts, and does not retry at once', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)] } })
    await items()
    // The feed disappears.
    ;(fetcher as unknown as { feeds: Record<string, unknown> }).feeds = {}
    ctx.clock.now = new Date('2026-01-01T04:00:00Z')
    const failed = await (await items()).json()
    expect(failed.items).toEqual([post(1)])
    expect(failed.lastError).toContain('RSS or Atom')
    expect(failed.lastWorkedAt).toBe('2026-01-01T00:00:00.000Z')
    const reads = fetcher.itemsRead.length

    ctx.clock.now = new Date('2026-01-01T04:20:00Z')
    await items()
    expect(fetcher.itemsRead).toHaveLength(reads) // 20 minutes on: left alone
    ctx.clock.now = new Date('2026-01-01T04:31:00Z')
    await items()
    expect(fetcher.itemsRead).toHaveLength(reads + 1)
  })

  it('shows on the source itself when it last worked and why it stopped', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)] } })
    expect(await listed()).toMatchObject({ lastWorkedAt: null, lastError: null })
    await items()
    expect(await listed()).toMatchObject({
      lastWorkedAt: '2026-01-01T00:00:00.000Z',
      lastError: null,
    })
    ;(fetcher as unknown as { feeds: Record<string, unknown> }).feeds = {}
    ctx.clock.now = new Date('2026-01-01T05:00:00Z')
    await items()
    expect(await listed()).toMatchObject({
      lastWorkedAt: '2026-01-01T00:00:00.000Z',
      lastError: expect.stringContaining('RSS or Atom'),
    })
  })

  it('refreshes on request, but not more than every five minutes', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)] } })
    await items()
    ctx.clock.now = new Date('2026-01-01T00:03:00Z')
    await items('?refresh=true')
    expect(fetcher.itemsRead).toHaveLength(1)
    ctx.clock.now = new Date('2026-01-01T00:06:00Z')
    await items('?refresh=true')
    expect(fetcher.itemsRead).toHaveLength(2)
  })

  it('shares one read between people who ask at the same moment', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)] } })
    await Promise.all([items(), items(), items()])
    expect(fetcher.itemsRead).toHaveLength(1)
  })

  it('limits how many reads one person can start in an hour, but still shows what is kept', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)] } })
    await items() // now a copy is kept
    const publicationId = base.split('/')[3]!
    const ids: string[] = []
    for (let i = 0; i < 125; i++) {
      ids.push(ctx.store.sources.add(publicationId, `https://s${i}.example/feed`).id)
    }
    let refused = 0
    for (const id of ids) {
      const res = await ada.get(`${base}/${id}/items`)
      if (res.status === 429) refused++
    }
    expect(refused).toBeGreaterThan(0)
    expect((await items()).status).toBe(200) // the kept copy needs no outbound read
  })

  it('is for members only, and a source of another publication cannot be reached through this one', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)] } })
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.get(`${base}/${sourceId}/items`)).status).toBe(404)
    const bobBase = `/api/publications/${(await (await bob.get('/api/publications')).json())[0].id}/sources`
    expect((await bob.get(`${bobBase}/${sourceId}/items`)).status).toBe(404)
    expect((await ada.get(`${base}/nope/items`)).status).toBe(404)
  })

  it('goes with the source when it is removed', async () => {
    await start({ 'https://news.example/feed': { title: 'News', items: [post(1)] } })
    await items()
    await ada.delete(`${base}/${sourceId}`)
    expect(ctx.store.sources.getFetch(sourceId)).toBeUndefined()
    expect((await items()).status).toBe(404)
  })
})

describe('recent posts across all the feeds', () => {
  const day = (n: number) =>
    new Date(Date.parse('2026-01-01T00:00:00Z') - n * 86_400_000).toISOString()
  const post = (id: string, daysAgo: number | null, extra = {}) => ({
    id,
    title: `Post ${id}`,
    url: `https://x.example/${id}`,
    summary: null,
    authors: [],
    publishedAt: daysAgo === null ? null : day(daysAgo),
    ...extra,
  })
  let fetcher: FakeFeedFetcher
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let base: string
  let ids: Record<string, string>

  async function start(feeds: ConstructorParameters<typeof FakeFeedFetcher>[0]) {
    fetcher = new FakeFeedFetcher(feeds)
    ctx = setup({ feeds: fetcher })
    ada = ctx.client()
    await register(ada)
    base = `/api/publications/${(await (await ada.get('/api/publications')).json())[0].id}/sources`
    ids = {}
    for (const url of Object.keys(feeds ?? {})) {
      ids[url] = (await (await ada.post(base, { url })).json()).id
    }
  }
  const recent = async (query = '') => (await ada.get(`${base}/recent${query}`)).json()

  it('lists posts from every feed in one list, newest first, saying which feed each came from', async () => {
    await start({
      'https://a.example/feed': { title: 'A', items: [post('a1', 3), post('a2', 20)] },
      'https://b.example/feed': { title: 'B', items: [post('b1', 1), post('b2', 10)] },
    })
    const res = await recent()
    expect(res.days).toBe(30)
    expect(res.posts.map((p: { id: string }) => p.id)).toEqual(['b1', 'a1', 'b2', 'a2'])
    expect(res.posts.map((p: { sourceId: string }) => p.sourceId)).toEqual([
      ids['https://b.example/feed'],
      ids['https://a.example/feed'],
      ids['https://b.example/feed'],
      ids['https://a.example/feed'],
    ])
    expect(res).toMatchObject({ omitted: 0, undated: 0, failed: [] })
  })

  it('leaves out what is older than the window, so a rarely-posting blog doesn’t clutter it', async () => {
    await start({
      'https://slow.example/feed': { title: 'Slow', items: [post('old', 180)] },
      'https://busy.example/feed': { title: 'Busy', items: [post('new', 2), post('mid', 40)] },
    })
    expect((await recent()).posts.map((p: { id: string }) => p.id)).toEqual(['new'])
    expect((await recent('?days=7')).posts.map((p: { id: string }) => p.id)).toEqual(['new'])
    expect((await recent('?days=90')).posts.map((p: { id: string }) => p.id)).toEqual([
      'new',
      'mid',
    ])
    expect((await recent('?days=365')).posts).toHaveLength(3)
  })

  it('counts posts with no readable date instead of guessing when they appeared', async () => {
    await start({
      'https://a.example/feed': { title: 'A', items: [post('d', 1), post('u', null)] },
    })
    const res = await recent()
    expect(res.posts.map((p: { id: string }) => p.id)).toEqual(['d'])
    expect(res.undated).toBe(1)
  })

  it('shows a post that two feeds both carry once', async () => {
    const shared = post('s', 1, { url: 'https://same.example/story' })
    await start({
      'https://a.example/feed': { title: 'A', items: [shared] },
      'https://b.example/feed': { title: 'B', items: [{ ...shared, id: 'other-id' }] },
    })
    const res = await recent()
    expect(res.posts).toHaveLength(1)
    expect(res.posts[0].sourceId).toBe(ids['https://a.example/feed']) // the higher-priority feed
  })

  it('names a feed that can’t be read and still lists the others', async () => {
    await start({
      'https://a.example/feed': { title: 'A', items: [post('a1', 1)] },
      'https://b.example/feed': { title: 'B', items: [post('b1', 2)] },
    })
    delete (fetcher as unknown as { feeds: Record<string, unknown> }).feeds[
      'https://b.example/feed'
    ]
    const res = await recent()
    expect(res.posts.map((p: { id: string }) => p.id)).toEqual(['a1'])
    expect(res.failed).toEqual([
      { sourceId: ids['https://b.example/feed'], error: expect.stringContaining('RSS or Atom') },
    ])
  })

  it('answers from the kept copies, asking each feed only once for a while', async () => {
    await start({
      'https://a.example/feed': { title: 'A', items: [post('a1', 1)] },
      'https://b.example/feed': { title: 'B', items: [post('b1', 2)] },
    })
    await recent()
    await recent('?days=7')
    expect(fetcher.itemsRead).toHaveLength(2)
  })

  it('caps the list and says how many were left out', async () => {
    await start({
      'https://a.example/feed': {
        title: 'A',
        items: Array.from({ length: 50 }, (_, i) => post(`a${i}`, 1 + i / 100)),
      },
      'https://b.example/feed': {
        title: 'B',
        items: Array.from({ length: 50 }, (_, i) => post(`b${i}`, 1 + i / 100 + 0.001)),
      },
      'https://c.example/feed': {
        title: 'C',
        items: Array.from({ length: 5 }, (_, i) => post(`c${i}`, 2 + i / 100)),
      },
    })
    const res = await recent()
    expect(res.posts).toHaveLength(100)
    expect(res.omitted).toBe(5)
  })

  it('refuses a window that makes no sense, and is for members only', async () => {
    await start({ 'https://a.example/feed': { title: 'A', items: [post('a1', 1)] } })
    for (const days of ['0', '-3', '400', 'x', '1.5']) {
      expect((await ada.get(`${base}/recent?days=${days}`)).status, days).toBe(400)
    }
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.get(`${base}/recent`)).status).toBe(404)
  })

  it('is empty, not an error, for a publication with no feeds', async () => {
    await start({})
    expect(await recent()).toEqual({ days: 30, posts: [], omitted: 0, undated: 0, failed: [] })
  })
})
