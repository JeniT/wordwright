import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDraft,
  lastReviewToken,
  register,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

describe('what is waiting on someone in a profile (#159)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient // owner and editor
  let bob: TestClient
  let cy: TestClient
  let profile: string
  let draftId: string
  const draftUrl = () => `/api/profiles/${profile}/drafts/${draftId}`
  const attention = async (c: TestClient) =>
    (await c.get(`/api/profiles/${profile}/attention`)).json()
  const idOf = async (c: TestClient) => (await (await c.get('/api/auth/me')).json()).id as string
  const settle = () => new Promise((r) => setTimeout(r, 0))

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    cy = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    await register(cy, 'cy@example.com', 'Cy')
    verifyAccounts(ctx, 'ada@example.com')
    profile = (await (await ada.get('/api/profiles')).json())[0].id
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    await shareProfile(ctx, ada, profile, cy, 'cy@example.com')
    draftId = (await createDraft(ada, profile, { title: 'Meanders', body: 'Rivers bend.' })).id
  })

  it('is empty when nothing is waiting', async () => {
    expect(await attention(ada)).toEqual({ offered: [], waiting: [], reviews: [] })
    expect(await attention(bob)).toEqual({ offered: [], waiting: [], reviews: [] })
  })

  it('shows an offer to the person offered and to the offerer, and to nobody else', async () => {
    await ada.post(`${draftUrl()}/handover/offer`, { userId: await idOf(bob) })
    expect(await attention(bob)).toMatchObject({
      offered: [{ draftId, title: 'Meanders', fromName: 'Ada' }],
      waiting: [],
    })
    expect(await attention(ada)).toMatchObject({
      offered: [],
      waiting: [{ draftId, title: 'Meanders', toName: 'Bob' }],
    })
    expect(await attention(cy)).toEqual({ offered: [], waiting: [], reviews: [] })
    await bob.post(`${draftUrl()}/handover/offer/decline`, {})
    expect((await attention(bob)).offered).toEqual([])
    expect((await attention(ada)).waiting).toEqual([])
  })

  it('is private to the profile’s members', async () => {
    const eve = ctx.client()
    await register(eve, 'eve@example.com', 'Eve')
    expect((await eve.get(`/api/profiles/${profile}/attention`)).status).toBe(404)
  })

  describe('the reviews of drafts you edit', () => {
    async function send(email: string, name: string) {
      await ada.post(`${draftUrl()}/send-for-review`, { emails: [email] })
      await settle()
      const reviewer = ctx.client()
      await reviewer.post('/api/auth/register-reviewer', {
        token: lastReviewToken(ctx.mailer),
        name,
        password: 'correct horse battery',
      })
      const [review] = await (await reviewer.get('/api/reviews')).json()
      return { reviewer, id: review.id as string }
    }
    const first = async () => (await attention(ada)).reviews[0]

    it('counts reviews reading, finished and closed per snapshot, and unresolved comments', async () => {
      const rae = await send('rae@example.com', 'Rae')
      await send('sam@example.com', 'Sam')
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'whole', text: 'One' })
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'b1', text: 'Two' })
      await rae.reviewer.post(`/api/reviews/${rae.id}/end`, {})
      const row = await first()
      expect(row).toMatchObject({ draftId, title: 'Meanders' })
      expect(row.snapshots).toMatchObject([
        { open: 0, ended: 1, closed: 0, unresolved: 2 },
        { open: 1, ended: 0, closed: 0, unresolved: 0 },
      ])
    })

    it('flags a draft only when its reviews are all over, some finished, and comments unresolved', async () => {
      const rae = await send('rae@example.com', 'Rae')
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'whole', text: 'One' })
      expect((await first()).needsAttention).toBe(false) // still reading
      await rae.reviewer.post(`/api/reviews/${rae.id}/end`, {})
      expect((await first()).needsAttention).toBe(true)

      const comments = await (await ada.get(`${draftUrl()}/comments`)).json()
      await ada.put(`${draftUrl()}/comments/${comments[0].id}`, { resolved: true })
      expect((await first()).needsAttention).toBe(false) // nothing left to answer
    })

    it('does not flag reviews that were only closed', async () => {
      const rae = await send('rae@example.com', 'Rae')
      await rae.reviewer.post(`/api/reviews/${rae.id}/comments`, { block: 'whole', text: 'One' })
      await ada.post(`${draftUrl()}/reviewers/close`, {})
      expect((await first()).needsAttention).toBe(false)
    })

    it('is for the draft’s editor: others see none, and the draft page gets the same figures', async () => {
      const rae = await send('rae@example.com', 'Rae')
      await rae.reviewer.post(`/api/reviews/${rae.id}/end`, {})
      expect((await attention(bob)).reviews).toEqual([])
      const listed = await (await ada.get(`${draftUrl()}/reviewers`)).json()
      expect(listed.snapshots).toMatchObject([{ open: 0, ended: 1, closed: 0 }])
    })

    it('sends no email when it is read', async () => {
      await send('rae@example.com', 'Rae')
      const before = ctx.mailer.outbox.length
      await attention(ada)
      await attention(bob)
      await settle()
      expect(ctx.mailer.outbox).toHaveLength(before)
    })
  })
})
