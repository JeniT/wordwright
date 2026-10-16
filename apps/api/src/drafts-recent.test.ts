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

/** The drafts a person could pick up again from Home (#192): the ones they edit, newest first. */
describe('GET /api/drafts/recent', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let blog: string
  const pause = () => new Promise((r) => setTimeout(r, 5))
  const recent = async (c: TestClient) => (await c.get('/api/drafts/recent')).json()

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com', 'bob@example.com')
    blog = (await (await ada.get('/api/publications')).json())[0].id
  })

  it('names the draft, its idea and its publication, with where to open it', async () => {
    const draft = await createDraft(ada, blog, { title: 'Why we write', body: 'Hello.' })
    expect(await recent(ada)).toEqual([
      {
        id: draft.id,
        title: 'Why we write',
        ideaId: draft.ideaId,
        ideaName: 'Why we write',
        publicationId: blog,
        publicationName: expect.any(String),
        updatedAt: draft.updatedAt,
      },
    ])
  })

  it('is empty for someone with no drafts', async () => {
    expect(await recent(ada)).toEqual([])
  })

  it('lists newest first, at most three', async () => {
    const titles = ['One', 'Two', 'Three', 'Four']
    for (const title of titles) {
      await createDraft(ada, blog, { title })
      await pause()
    }
    expect((await recent(ada)).map((d: { title: string }) => d.title)).toEqual([
      'Four',
      'Three',
      'Two',
    ])
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
    expect((await recent(ada))[0]).toMatchObject({ title: 'First' })
  })

  it('only includes drafts the person edits, not others’ in a shared publication', async () => {
    await sharePublication(ctx, ada, blog, bob, 'bob@example.com')
    await createDraft(ada, blog, { title: 'Ada’s' })
    await createDraft(bob, blog, { title: 'Bob’s' })
    expect((await recent(ada)).map((d: { title: string }) => d.title)).toEqual(['Ada’s'])
    expect((await recent(bob)).map((d: { title: string }) => d.title)).toEqual(['Bob’s'])
  })

  it('leaves out publications the person has left', async () => {
    await sharePublication(ctx, ada, blog, bob, 'bob@example.com')
    await createDraft(bob, blog, { title: 'Bob’s' })
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    await bob.delete(`/api/publications/${blog}/members/${bobId}`)
    expect(await recent(bob)).toEqual([])
  })

  it('draws from every publication the person belongs to', async () => {
    const second = (await (await ada.post('/api/publications', { name: 'Second' })).json())
      .id as string
    await createDraft(ada, blog, { title: 'In first' })
    await pause()
    await createDraft(ada, second, { title: 'In second' })
    expect(await recent(ada)).toMatchObject([
      { title: 'In second', publicationId: second, publicationName: 'Second' },
      { title: 'In first', publicationId: blog },
    ])
  })

  it('needs a signed-in person, and is not for reviewer-only accounts', async () => {
    expect((await ctx.client().get('/api/drafts/recent')).status).toBe(401)
    await createDraft(ada, blog, { title: 'Ada’s' })
    const rae = ctx.client()
    const draft = (await recent(ada))[0]
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
    expect((await rae.get('/api/drafts/recent')).status).toBe(404)
  })
})
