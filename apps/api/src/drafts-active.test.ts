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

/** The drafts a person can keep writing (#310): the ones they edit that are active, for Home and the landing pages. */
describe('GET /api/drafts/active', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let blog: string
  const pause = () => new Promise((r) => setTimeout(r, 5))
  const active = async (c: TestClient, query = '') =>
    (await c.get(`/api/drafts/active${query}`)).json() as Promise<{
      drafts: { id: string; title: string; [key: string]: unknown }[]
      hasMore: boolean
    }>
  const titles = async (c: TestClient, query = '') =>
    (await active(c, query)).drafts.map((d) => d.title)

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com', 'bob@example.com')
    blog = (await (await ada.get('/api/publications')).json())[0].id
  })

  const draftUrl = (id: string) => `/api/publications/${blog}/drafts/${id}`
  /** Sends the draft to a new reviewer, who registers; returns their client and the id of their latest review. */
  async function sendFor(draftId: string, email: string, name: string) {
    await ada.post(`${draftUrl(draftId)}/send-for-review`, { emails: [email] })
    await new Promise((r) => setTimeout(r, 0))
    const reviewer = ctx.client()
    await reviewer.post('/api/auth/register-reviewer', {
      token: lastReviewToken(ctx.mailer),
      name,
      password: PASSWORD,
    })
    const reviews = (await (await reviewer.get('/api/reviews')).json()) as { id: string }[]
    return { reviewer, id: reviews[reviews.length - 1]!.id }
  }

  it('names the draft, its idea and its publication, with where to open it', async () => {
    const draft = await createDraft(ada, blog, { title: 'Why we write', body: 'Hello.' })
    expect(await active(ada)).toEqual({
      hasMore: false,
      drafts: [
        {
          id: draft.id,
          title: 'Why we write',
          ideaId: draft.ideaId,
          ideaName: 'Why we write',
          publicationId: blog,
          publicationName: expect.any(String),
          updatedAt: draft.updatedAt,
          review: null,
        },
      ],
    })
  })

  it('is empty for someone with no drafts', async () => {
    expect(await active(ada)).toEqual({ drafts: [], hasMore: false })
  })

  it('lists newest first, three at a time, and says when there are more', async () => {
    const order = ['One', 'Two', 'Three', 'Four']
    for (const title of order) {
      await createDraft(ada, blog, { title })
      await pause()
    }
    expect(await titles(ada)).toEqual(['Four', 'Three', 'Two'])
    expect((await active(ada)).hasMore).toBe(true)
    expect(await titles(ada, '?limit=4')).toEqual(['Four', 'Three', 'Two', 'One'])
    expect((await active(ada, '?limit=4')).hasMore).toBe(false)
  })

  it('moves a draft to the top when it is saved', async () => {
    const first = await createDraft(ada, blog, { title: 'First' })
    await pause()
    await createDraft(ada, blog, { title: 'Second' })
    await pause()
    await ada.put(`/api/publications/${blog}/drafts/${first.id}`, {
      title: 'First',
      body: 'More.',
      version: first.version,
    })
    expect((await titles(ada))[0]).toBe('First')
  })

  it('only includes drafts the person edits, not others’ in a shared publication', async () => {
    await sharePublication(ctx, ada, blog, bob, 'bob@example.com')
    await createDraft(ada, blog, { title: 'Ada’s' })
    await createDraft(bob, blog, { title: 'Bob’s' })
    expect(await titles(ada)).toEqual(['Ada’s'])
    expect(await titles(bob)).toEqual(['Bob’s'])
  })

  it('leaves out publications the person has left', async () => {
    await sharePublication(ctx, ada, blog, bob, 'bob@example.com')
    await createDraft(bob, blog, { title: 'Bob’s' })
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    await bob.delete(`/api/publications/${blog}/members/${bobId}`)
    expect(await titles(bob)).toEqual([])
  })

  it('draws from every publication the person belongs to', async () => {
    const second = (await (await ada.post('/api/publications', { name: 'Second' })).json())
      .id as string
    await createDraft(ada, blog, { title: 'In first' })
    await pause()
    await createDraft(ada, second, { title: 'In second' })
    expect((await active(ada)).drafts).toMatchObject([
      { title: 'In second', publicationId: second, publicationName: 'Second' },
      { title: 'In first', publicationId: blog },
    ])
  })

  it('needs a signed-in person, and is not for reviewer-only accounts', async () => {
    expect((await ctx.client().get('/api/drafts/active')).status).toBe(401)
    await createDraft(ada, blog, { title: 'Ada’s' })
    const rae = ctx.client()
    const draft = (await active(ada)).drafts[0]!
    expect(
      (
        await ada.post(`/api/publications/${blog}/drafts/${draft.id}/send-for-review`, {
          emails: ['rae@example.com'],
        })
      ).status,
    ).toBe(202)
    await new Promise((r) => setTimeout(r, 0))
    expect(
      (
        await rae.post('/api/auth/register-reviewer', {
          token: lastReviewToken(ctx.mailer),
          name: 'Rae',
          password: PASSWORD,
        })
      ).status,
    ).toBe(201)
    expect((await rae.get('/api/drafts/active')).status).toBe(404)
  })

  describe('which drafts are active', () => {
    const DAY = 24 * 60 * 60 * 1000
    const saved = (id: string, daysAgo: number) =>
      ctx.db
        .prepare('UPDATE drafts SET updated_at = ? WHERE id = ?')
        .run(new Date(ctx.clock.now.getTime() - daysAgo * DAY).toISOString(), id)
    it('leaves out a draft last saved more than 30 days ago, and keeps one saved 29 days ago', async () => {
      const old = await createDraft(ada, blog, { title: 'Old' })
      const recent = await createDraft(ada, blog, { title: 'Recent' })
      saved(old.id, 31)
      saved(recent.id, 29)
      expect(await titles(ada)).toEqual(['Recent'])
      saved(old.id, 30) // exactly 30 days still counts
      expect((await titles(ada)).sort()).toEqual(['Old', 'Recent'])
    })

    it('keeps an old draft while a review of it is in progress', async () => {
      const old = await createDraft(ada, blog, { title: 'Old' })
      await sendFor(old.id, 'rae@example.com', 'Rae')
      saved(old.id, 90)
      expect(await titles(ada)).toEqual(['Old'])
    })

    it('keeps an old draft that is only waiting for an invitation to be answered', async () => {
      const old = await createDraft(ada, blog, { title: 'Old' })
      await ada.post(`${draftUrl(old.id)}/send-for-review`, { emails: ['rae@example.com'] })
      saved(old.id, 90)
      expect(await titles(ada)).toEqual(['Old'])
    })

    it('keeps an old draft with unresolved comments, and drops it once they are resolved', async () => {
      const old = await createDraft(ada, blog, { title: 'Old' })
      const rae = await sendFor(old.id, 'rae@example.com', 'Rae')
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'whole', text: 'One' })
      await rae.reviewer.post(`/api/reviews/${rae.id}/end`, {})
      saved(old.id, 90)
      expect(await titles(ada)).toEqual(['Old'])
      const [comment] = await (await ada.get(`${draftUrl(old.id)}/comments`)).json()
      await ada.put(`${draftUrl(old.id)}/comments/${comment.id}`, { resolved: true })
      expect(await titles(ada)).toEqual([])
    })

    it('drops an old draft whose reviews were only closed, with nothing unresolved', async () => {
      const old = await createDraft(ada, blog, { title: 'Old' })
      await sendFor(old.id, 'rae@example.com', 'Rae')
      await ada.post(`${draftUrl(old.id)}/reviewers/close`, {})
      saved(old.id, 90)
      expect(await titles(ada)).toEqual([])
    })
  })

  describe('how its reviews stand', () => {
    it('is null for a draft never sent for review', async () => {
      await createDraft(ada, blog, { title: 'Plain' })
      expect((await active(ada)).drafts[0]!.review).toBeNull()
    })

    it('totals every review request of the draft, not just the latest', async () => {
      const draft = await createDraft(ada, blog, { title: 'Meanders', body: 'Rivers bend.' })
      const rae = await sendFor(draft.id, 'rae@example.com', 'Rae')
      await sendFor(draft.id, 'sam@example.com', 'Sam')
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'whole', text: 'One' })
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'b1', text: 'Two' })
      await rae.reviewer.post(`/api/reviews/${rae.id}/end`, {})
      expect((await active(ada)).drafts[0]!.review).toEqual({ asked: 2, ended: 1, unresolved: 2 })
    })

    it('puts drafts with unresolved comments first, then the rest newest first', async () => {
      const commented = await createDraft(ada, blog, { title: 'Commented' })
      const rae = await sendFor(commented.id, 'rae@example.com', 'Rae')
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'whole', text: 'One' })
      await pause()
      await createDraft(ada, blog, { title: 'Newer' })
      await pause()
      await createDraft(ada, blog, { title: 'Newest' })
      expect(await titles(ada)).toEqual(['Commented', 'Newest', 'Newer'])
    })
  })

  describe('within a publication or an idea', () => {
    it('can be limited to one publication', async () => {
      const second = (await (await ada.post('/api/publications', { name: 'Second' })).json())
        .id as string
      await createDraft(ada, blog, { title: 'In first' })
      await createDraft(ada, second, { title: 'In second' })
      expect(await titles(ada, `?publicationId=${second}`)).toEqual(['In second'])
    })

    it('can be limited to one idea', async () => {
      const mine = await createDraft(ada, blog, { title: 'Mine' })
      await createDraft(ada, blog, { title: 'Other' })
      expect(await titles(ada, `?ideaId=${mine.ideaId}`)).toEqual(['Mine'])
    })

    it('shows nothing of a publication the person does not belong to', async () => {
      await createDraft(ada, blog, { title: 'Ada’s' })
      expect(await titles(bob, `?publicationId=${blog}`)).toEqual([])
    })

    it('refuses a limit that is not a number or is too large', async () => {
      expect((await ada.get('/api/drafts/active?limit=0')).status).toBe(400)
      expect((await ada.get('/api/drafts/active?limit=abc')).status).toBe(400)
      expect((await ada.get('/api/drafts/active?limit=1000')).status).toBe(400)
    })
  })
})
