import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDraft,
  register,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

describe('what is waiting on someone in a publication (#159, #310)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient // owner and editor
  let bob: TestClient
  let cy: TestClient
  let publication: string
  let draftId: string
  const draftUrl = () => `/api/publications/${publication}/drafts/${draftId}`
  const attention = async (c: TestClient) =>
    (await c.get(`/api/publications/${publication}/attention`)).json()
  const idOf = async (c: TestClient) => (await (await c.get('/api/auth/me')).json()).id as string

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    cy = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    await register(cy, 'cy@example.com', 'Cy')
    verifyAccounts(ctx, 'ada@example.com')
    publication = (await (await ada.get('/api/publications')).json())[0].id
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    await sharePublication(ctx, ada, publication, cy, 'cy@example.com')
    draftId = (await createDraft(ada, publication, { title: 'Meanders', body: 'Rivers bend.' })).id
  })

  it('is empty when nothing is waiting', async () => {
    expect(await attention(ada)).toEqual({ offered: [], waiting: [] })
    expect(await attention(bob)).toEqual({ offered: [], waiting: [] })
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
    expect(await attention(cy)).toEqual({ offered: [], waiting: [] })
    await bob.post(`${draftUrl()}/handover/offer/decline`, {})
    expect((await attention(bob)).offered).toEqual([])
    expect((await attention(ada)).waiting).toEqual([])
  })

  it('says nothing about reviews: Keep writing has those', async () => {
    expect(Object.keys(await attention(ada))).toEqual(['offered', 'waiting'])
  })

  it('is private to the publication’s members', async () => {
    const eve = ctx.client()
    await register(eve, 'eve@example.com', 'Eve')
    expect((await eve.get(`/api/publications/${publication}/attention`)).status).toBe(404)
  })
})
