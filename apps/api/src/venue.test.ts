import { beforeEach, describe, expect, it } from 'vitest'
import { FakeFeedFetcher, FakePageTextFetcher, type FeedItem } from '@lfwa/core'
import { register, setup, shareProfile, verifyAccounts, type TestClient } from './test-helpers'

const post = (n: number): FeedItem => ({
  id: `https://venue.example/posts/${n}`,
  title: `Post ${n}`,
  url: `https://venue.example/posts/${n}`,
  summary: null,
  authors: [],
  publishedAt: `2026-01-${String(30 - n).padStart(2, '0')}T00:00:00Z`,
})

function start(feeds = new FakeFeedFetcher()) {
  const pageTextFetcher = new FakePageTextFetcher()
  const ctx = setup({ feeds, pageTextFetcher })
  return { ctx, feeds, pageTextFetcher }
}

async function profileFor(c: TestClient, siteUrl?: string) {
  const res = await c.post(
    '/api/profiles',
    siteUrl ? { name: 'Venue', siteUrl } : { name: 'Venue' },
  )
  return (await res.json()).id as string
}

describe('venue sample posts: choosing', () => {
  let c: TestClient
  let id: string
  let ctx: ReturnType<typeof setup>

  const feed = (items: FeedItem[]) =>
    new FakeFeedFetcher({
      'https://venue.example/': { url: 'https://venue.example/feed', title: 'Venue' },
      'https://venue.example/feed': { title: 'Venue', items },
    })

  async function begin(feeds: FakeFeedFetcher, siteUrl?: string) {
    ;({ ctx } = start(feeds))
    c = ctx.client()
    await register(c)
    id = await profileFor(c, siteUrl)
  }

  it('offers the newest ten posts of the profile’s own site, newest first, with nothing saved', async () => {
    await begin(feed(Array.from({ length: 14 }, (_, i) => post(i + 1))), 'https://venue.example/')
    const res = await c.post(`/api/profiles/${id}/venue/posts`, {})
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notice).toBeNull()
    expect(body.posts.map((p: FeedItem) => p.title)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Post ${i + 1}`),
    )
    expect(await (await c.get(`/api/profiles/${id}/sources`)).json()).toEqual([])
  })

  it('uses the address given when the website isn’t saved, and tidies it', async () => {
    await begin(feed([post(1)]))
    const res = await c.post(`/api/profiles/${id}/venue/posts`, { siteUrl: 'venue.example/' })
    expect((await res.json()).posts).toHaveLength(1)
  })

  it('asks for a website when there is none to use', async () => {
    await begin(feed([post(1)]))
    const res = await c.post(`/api/profiles/${id}/venue/posts`, {})
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/website/)
  })

  it('says to paste links when the site has no feed, is unreachable, or has no posts', async () => {
    await begin(feed([]), 'https://venue.example/')
    expect((await (await c.post(`/api/profiles/${id}/venue/posts`, {})).json()).notice).toMatch(
      /no posts yet.*Paste links/,
    )
    const noFeed = await c.post(`/api/profiles/${id}/venue/posts`, {
      siteUrl: 'https://nofeed.example/',
    })
    expect(await noFeed.json()).toEqual({
      posts: [],
      notice: 'We couldn’t find a feed on that site. Paste links to a few of its posts instead.',
    })
    const down = await c.post(`/api/profiles/${id}/venue/posts`, {
      siteUrl: 'https://unreachable.example/',
    })
    expect((await down.json()).notice).toMatch(/couldn’t reach.*Paste links/)
  })

  it('is for members only', async () => {
    await begin(feed([post(1)]), 'https://venue.example/')
    const stranger = ctx.client()
    await register(stranger, 'other@example.com', 'Other')
    expect((await stranger.post(`/api/profiles/${id}/venue/posts`, {})).status).toBe(404)
    expect((await ctx.client().post(`/api/profiles/${id}/venue/posts`, {})).status).toBe(401)
  })

  it('lets an editor use it too', async () => {
    await begin(feed([post(1)]), 'https://venue.example/')
    const editor = ctx.client()
    await register(editor, 'editor@example.com', 'Editor')
    verifyAccounts(ctx, 'ada@example.com')
    await shareProfile(ctx, c, id, editor, 'editor@example.com')
    expect((await editor.post(`/api/profiles/${id}/venue/posts`, {})).status).toBe(200)
  })
})

describe('venue sample posts: reading', () => {
  let c: TestClient
  let id: string
  let ctx: ReturnType<typeof setup>
  let pages: FakePageTextFetcher

  beforeEach(async () => {
    ;({ ctx, pageTextFetcher: pages } = start())
    c = ctx.client()
    await register(c)
    id = await profileFor(c)
  })
  const read = (urls: unknown) => c.post(`/api/profiles/${id}/venue/samples`, { urls })

  it('reads each page, answering one result per address in the order given', async () => {
    const res = await read([
      'https://a.example/one',
      'https://b.example/untitled',
      'https://c.example/long',
    ])
    const { samples } = await res.json()
    expect(samples.map((s: { url: string }) => s.url)).toEqual([
      'https://a.example/one',
      'https://b.example/untitled',
      'https://c.example/long',
    ])
    expect(samples[0]).toMatchObject({
      ok: true,
      title: 'Fake title for a.example',
      truncated: false,
    })
    expect(samples[1]).toMatchObject({ ok: true, title: null })
    expect(samples[2]).toMatchObject({ ok: true, truncated: true })
    expect(samples[2].text.length).toBeLessThanOrEqual(8000)
  })

  it('says what to do about each page that could not be read, and still reads the rest', async () => {
    const { samples } = await (
      await read([
        'https://a.example/one',
        'https://nonexistent.example/x',
        'https://private.example/x',
        'https://unreadable.example/x',
      ])
    ).json()
    expect(samples[0].ok).toBe(true)
    expect(samples[1]).toEqual({
      ok: false,
      url: 'https://nonexistent.example/x',
      message: 'That site doesn’t seem to exist. Check the address, or paste a different link.',
    })
    expect(samples[2].message).toMatch(/isn’t a public web page/)
    expect(samples[3].message).toMatch(/couldn’t read that page/)
  })

  it('reads a repeated address once, and tidies addresses typed without https://', async () => {
    const { samples } = await (
      await read(['a.example/one', 'https://a.example/one', 'a.example/one'])
    ).json()
    expect(samples).toHaveLength(1)
    expect(pages.calls).toEqual(['https://a.example/one'])
  })

  it('takes one to five addresses, and refuses what is not a web address', async () => {
    const six = Array.from({ length: 6 }, (_, i) => `https://a.example/${i}`)
    const tooMany = await read(six)
    expect(tooMany.status).toBe(400)
    expect((await tooMany.json()).error).toBe('Choose up to 5 posts')
    expect((await read([])).status).toBe(400)
    expect((await read(['javascript:alert(1)'])).status).toBe(400)
    expect((await read('https://a.example/one')).status).toBe(400)
    expect(pages.calls).toEqual([])
    expect((await read(six.slice(0, 5))).status).toBe(200)
  })

  it('is throttled per person, because it fetches other people’s pages', async () => {
    for (let i = 0; i < 20; i++) expect((await read(['https://a.example/one'])).status).toBe(200)
    const blocked = await read(['https://a.example/one'])
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error).toMatch(/Try again/)
    // Choosing posts draws on the same allowance: both make the server fetch pages.
    expect(
      (await c.post(`/api/profiles/${id}/venue/posts`, { siteUrl: 'https://a.example/' })).status,
    ).toBe(429)
    // Someone else is not held up by it.
    const other = ctx.client()
    await register(other, 'other@example.com', 'Other')
    const theirs = await profileFor(other)
    expect(
      (
        await other.post(`/api/profiles/${theirs}/venue/samples`, {
          urls: ['https://a.example/one'],
        })
      ).status,
    ).toBe(200)
  })

  it('is for members only', async () => {
    const stranger = ctx.client()
    await register(stranger, 'other@example.com', 'Other')
    expect(
      (
        await stranger.post(`/api/profiles/${id}/venue/samples`, {
          urls: ['https://a.example/one'],
        })
      ).status,
    ).toBe(404)
    expect(pages.calls).toEqual([])
  })
})
