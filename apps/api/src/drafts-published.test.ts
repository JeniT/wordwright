import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
  createDraft,
  lastReviewToken,
  register,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

/** A draft its editor has marked as published, with an optional link to the post (#311). */
describe('marking a draft published', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let blog: string
  let draft: { id: string; ideaId: string; version: number; updatedAt: string }
  const url = () => `/api/publications/${blog}/drafts/${draft.id}`
  const publish = (client: TestClient, body: unknown) => client.put(`${url()}/published`, body)
  const read = async (client: TestClient = ada) => (await client.get(url())).json()
  const activeTitles = async (client: TestClient = ada) =>
    (await (await client.get('/api/drafts/active')).json()).drafts.map(
      (d: { title: string }) => d.title,
    )

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com', 'bob@example.com')
    blog = (await (await ada.get('/api/publications')).json())[0].id
    await sharePublication(ctx, ada, blog, bob, 'bob@example.com')
    draft = await createDraft(ada, blog, { title: 'Meanders', body: 'Rivers bend.' })
  })

  it('is not published to begin with', async () => {
    expect(await read()).toMatchObject({ publishedAt: null, publishedUrl: null })
  })

  it('records when it was marked and the link, and anyone who can read the draft sees both', async () => {
    const res = await publish(ada, { published: true, url: 'https://example.com/meanders' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      publishedAt: expect.any(String),
      publishedUrl: 'https://example.com/meanders',
    })
    expect(await read(bob)).toMatchObject({
      publishedAt: expect.any(String),
      publishedUrl: 'https://example.com/meanders',
    })
  })

  it('does not count as changing the words: the version and the last-changed time stay put', async () => {
    await publish(ada, { published: true })
    expect(await read()).toMatchObject({ version: draft.version, updatedAt: draft.updatedAt })
  })

  it('needs no link, and a blank one is none', async () => {
    expect(await (await publish(ada, { published: true })).json()).toMatchObject({
      publishedUrl: null,
    })
    expect(await (await publish(ada, { published: true, url: '   ' })).json()).toMatchObject({
      publishedUrl: null,
    })
  })

  it('keeps when it was marked if only the link changes', async () => {
    const first = await (await publish(ada, { published: true })).json()
    const second = await (
      await publish(ada, { published: true, url: 'https://a.example/x' })
    ).json()
    expect(second.publishedAt).toBe(first.publishedAt)
    expect(second.publishedUrl).toBe('https://a.example/x')
  })

  it('takes the link away with the mark when it is unpublished', async () => {
    await publish(ada, { published: true, url: 'https://example.com/meanders' })
    const res = await publish(ada, { published: false })
    expect(await res.json()).toMatchObject({ publishedAt: null, publishedUrl: null })
  })

  it('refuses a link that is not a web address, so it can never be run as a script', async () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<p>hi</p>',
      'ftp://example.com/x',
      'not a link',
      `https://example.com/${'a'.repeat(2100)}`,
    ]) {
      expect((await publish(ada, { published: true, url: bad })).status, bad).toBe(400)
    }
    expect(await read()).toMatchObject({ publishedAt: null })
  })

  it('refuses a link with no mark', async () => {
    expect((await publish(ada, { published: false, url: 'https://example.com/x' })).status).toBe(
      400,
    )
  })

  it('is the editor’s alone', async () => {
    const res = await publish(bob, { published: true })
    expect(res.status).toBe(403)
    expect(await read()).toMatchObject({ publishedAt: null })
  })

  it('is for members only, and a draft that is not there is not found', async () => {
    const eve = ctx.client()
    await register(eve, 'eve@example.com', 'Eve')
    expect((await publish(eve, { published: true })).status).toBe(404)
    const missing = `/api/publications/${blog}/drafts/nope/published`
    expect((await ada.put(missing, { published: true })).status).toBe(404)
  })

  it('shows on the idea’s list of drafts, which keeps its order', async () => {
    const second = await (
      await ada.post(`/api/publications/${blog}/ideas/${draft.ideaId}/drafts`, { title: 'Part 2' })
    ).json()
    await publish(ada, { published: true, url: 'https://example.com/meanders' })
    const idea = await (await ada.get(`/api/publications/${blog}/ideas/${draft.ideaId}`)).json()
    expect(idea.drafts).toMatchObject([
      {
        id: draft.id,
        publishedAt: expect.any(String),
        publishedUrl: 'https://example.com/meanders',
      },
      { id: second.id, publishedAt: null, publishedUrl: null },
    ])
  })

  describe('and Keep writing', () => {
    it('leaves a published draft out, and brings it back when it is unpublished', async () => {
      expect(await activeTitles()).toEqual(['Meanders'])
      await publish(ada, { published: true })
      expect(await activeTitles()).toEqual([])
      await publish(ada, { published: false })
      expect(await activeTitles()).toEqual(['Meanders'])
    })

    it('leaves it out even with a review in progress and comments to answer', async () => {
      await ada.post(`${url()}/send-for-review`, { emails: ['rae@example.com'] })
      await new Promise((r) => setTimeout(r, 0))
      const rae = ctx.client()
      await rae.post('/api/auth/register-reviewer', {
        token: lastReviewToken(ctx.mailer),
        name: 'Rae',
        password: PASSWORD,
      })
      const [review] = await (await rae.get('/api/reviews')).json()
      await rae.post(`/api/reviews/${review.id}/comments`, { block: 'whole', text: 'One' })
      expect(await activeTitles()).toEqual(['Meanders'])
      await publish(ada, { published: true })
      expect(await activeTitles()).toEqual([])
    })
  })
})
