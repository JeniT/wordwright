import { beforeEach, describe, expect, it } from 'vitest'
import { register, setup, type TestClient } from './test-helpers'

describe('profiles and sharing', () => {
  let ada: TestClient
  let bob: TestClient
  let ctx: ReturnType<typeof setup>
  let adaProfile: string

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    adaProfile = (await (await ada.get('/api/profiles')).json())[0].id
  })

  it('lets a user have several profiles', async () => {
    const res = await ada.post('/api/profiles', { name: 'Newsletter' })
    expect(res.status).toBe(201)
    expect(await (await ada.get('/api/profiles')).json()).toHaveLength(2)
  })

  it("hides other people's profiles", async () => {
    expect(await (await bob.get('/api/profiles')).json()).toHaveLength(1)
    expect((await bob.get(`/api/profiles/${adaProfile}`)).status).toBe(404)
    expect((await bob.get(`/api/profiles/${adaProfile}/drafts`)).status).toBe(404)
    expect((await bob.post(`/api/profiles/${adaProfile}/drafts`, { title: 'x' })).status).toBe(404)
  })

  it('shares a profile with an existing user, who can then write in it', async () => {
    const added = await ada.post(`/api/profiles/${adaProfile}/members`, {
      email: 'BOB@example.com',
    })
    expect(added.status).toBe(201)

    const draft = await (
      await bob.post(`/api/profiles/${adaProfile}/drafts`, { title: 'Joint', body: 'hi' })
    ).json()
    const seenByAda = await (await ada.get(`/api/profiles/${adaProfile}/drafts/${draft.id}`)).json()
    expect(seenByAda.title).toBe('Joint')
    expect(await (await bob.get('/api/profiles')).json()).toHaveLength(2)
  })

  it('reports unknown emails and duplicate members', async () => {
    expect(
      (await ada.post(`/api/profiles/${adaProfile}/members`, { email: 'nobody@example.com' }))
        .status,
    ).toBe(404)
    await ada.post(`/api/profiles/${adaProfile}/members`, { email: 'bob@example.com' })
    expect(
      (await ada.post(`/api/profiles/${adaProfile}/members`, { email: 'bob@example.com' })).status,
    ).toBe(409)
  })

  it('reserves management for the owner', async () => {
    await ada.post(`/api/profiles/${adaProfile}/members`, { email: 'bob@example.com' })
    expect((await bob.patch(`/api/profiles/${adaProfile}`, { name: 'Mine now' })).status).toBe(403)
    expect((await bob.delete(`/api/profiles/${adaProfile}`)).status).toBe(403)
    expect(
      (await bob.post(`/api/profiles/${adaProfile}/members`, { email: 'ada@example.com' })).status,
    ).toBe(403)
    expect((await ada.patch(`/api/profiles/${adaProfile}`, { name: 'Renamed' })).status).toBe(200)
  })

  it('lets editors leave but not the owner; owners can remove editors', async () => {
    await ada.post(`/api/profiles/${adaProfile}/members`, { email: 'bob@example.com' })
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    const adaId = (await (await ada.get('/api/auth/me')).json()).id

    expect((await ada.delete(`/api/profiles/${adaProfile}/members/${adaId}`)).status).toBe(400)
    expect((await bob.delete(`/api/profiles/${adaProfile}/members/${adaId}`)).status).toBe(403)
    expect((await bob.delete(`/api/profiles/${adaProfile}/members/${bobId}`)).status).toBe(204)
    expect((await bob.get(`/api/profiles/${adaProfile}`)).status).toBe(404)

    await ada.post(`/api/profiles/${adaProfile}/members`, { email: 'bob@example.com' })
    expect((await ada.delete(`/api/profiles/${adaProfile}/members/${bobId}`)).status).toBe(204)
  })

  it('deletes a profile and its drafts', async () => {
    await ada.post(`/api/profiles/${adaProfile}/drafts`, { title: 'x' })
    expect((await ada.delete(`/api/profiles/${adaProfile}`)).status).toBe(204)
    expect(ctx.store.drafts.list(adaProfile)).toEqual([])
  })
})

describe('drafts and critique within a profile', () => {
  it('creates, updates, lists and deletes drafts, and critiques via the LLM', async () => {
    const ctx = setup()
    const c = ctx.client()
    await register(c)
    const pid = (await (await c.get('/api/profiles')).json())[0].id
    const base = `/api/profiles/${pid}`

    const draft = await (await c.post(`${base}/drafts`, { title: 'Hello', body: 'World' })).json()
    expect(draft).toMatchObject({ title: 'Hello', body: 'World', profileId: pid })

    const updated = await (
      await c.put(`${base}/drafts/${draft.id}`, { title: 'Hi', body: 'There' })
    ).json()
    expect(updated).toMatchObject({ title: 'Hi', body: 'There' })
    expect(await (await c.get(`${base}/drafts`)).json()).toHaveLength(1)

    const critique = await c.post(`${base}/assist/critique`, { draftId: draft.id })
    expect(await critique.json()).toEqual({ text: 'Needs a stronger opening.' })
    expect(ctx.llm.calls[0]?.messages[0]?.content).toContain('There')

    expect((await c.delete(`${base}/drafts/${draft.id}`)).status).toBe(204)
    expect((await c.get(`${base}/drafts/${draft.id}`)).status).toBe(404)
    expect((await c.post(`${base}/assist/critique`, { draftId: 'nope' })).status).toBe(404)
  })

  it('rejects invalid drafts', async () => {
    const c = setup().client()
    await register(c)
    const pid = (await (await c.get('/api/profiles')).json())[0].id
    expect((await c.post(`/api/profiles/${pid}/drafts`, { title: 42 })).status).toBe(400)
  })
})
