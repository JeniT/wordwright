import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
  createDraft,
  register,
  saveKey,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

type Draft = { id: string; editorId: string; editorName: string; version: number; body: string }

describe('a draft has one editor (#154)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let profile: string
  let draft: Draft
  let adaId: string
  let bobId: string
  const base = () => `/api/profiles/${profile}`
  const url = () => `${base()}/drafts/${draft.id}`
  const idOf = async (c: TestClient) => (await (await c.get('/api/auth/me')).json()).id as string
  const open = async (c: TestClient): Promise<Draft> => (await c.get(url())).json()

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    profile = (await (await ada.get('/api/profiles')).json())[0].id
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    draft = await createDraft(ada, profile, { title: 'T', body: 'First.' })
    adaId = await idOf(ada)
    bobId = await idOf(bob)
  })

  it('starts with its creator as editor, named', () => {
    expect(draft).toMatchObject({ editorId: adaId, editorName: 'Ada', version: 1 })
  })

  it('lets only the editor save, and every member read', async () => {
    const refused = await bob.put(url(), { title: 'T', body: 'Bob’s.', version: 1 })
    expect(refused.status).toBe(403)
    expect((await refused.json()).error).toContain('Ada')
    expect((await open(bob)).body).toBe('First.')

    const saved = await ada.put(url(), { title: 'T', body: 'Second.', version: 1 })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ body: 'Second.', version: 2 })
    expect((await open(bob)).body).toBe('Second.') // members see it on reload
  })

  it('refuses a save made from an old version, and keeps what was saved', async () => {
    expect((await ada.put(url(), { title: 'T', body: 'Tab one.', version: 1 })).status).toBe(200)
    // The same person's second tab still has version 1.
    const stale = await ada.put(url(), { title: 'T', body: 'Tab two.', version: 1 })
    expect(stale.status).toBe(409)
    expect((await stale.json()).error).toMatch(/Reload the page/)
    expect((await open(ada)).body).toBe('Tab one.')
    expect((await ada.put(url(), { title: 'T', body: 'Tab two.', version: 2 })).status).toBe(200)
  })

  it('needs the version to save', async () => {
    expect((await ada.put(url(), { title: 'T', body: 'x' })).status).toBe(400)
  })

  it('shows other members none of the critique, not even how many looks it has used', async () => {
    await saveKey(ada)
    const made = await ada.post(`${base()}/assist/critique`, { draftId: draft.id })
    expect(made.status).toBe(200)
    const theirs = await (await bob.get(`${url()}/critique`)).json()
    expect(theirs.round).toBeNull()
    expect(theirs.used).toBe(0)
    expect((await (await ada.get(`${url()}/critique`)).json()).used).toBe(1)
  })

  it('stops other members asking for a critique before anything is sent or counted', async () => {
    await saveKey(bob)
    const calls = ctx.llmCalls.length
    const res = await bob.post(`${base()}/assist/critique`, { draftId: draft.id })
    expect(res.status).toBe(403)
    expect(ctx.llmCalls).toHaveLength(calls)
    expect(ctx.store.critiques.count(draft.id)).toBe(0)
  })

  describe('when the editor goes', () => {
    it('hands their drafts to the owner when they are removed from the profile', async () => {
      ctx.store.drafts.reassignEditor(profile, adaId, bobId) // Bob edits this one
      expect((await open(ada)).editorId).toBe(bobId)
      const removed = await ada.delete(`${base()}/members/${bobId}`)
      expect(removed.status).toBe(204)
      expect(await open(ada)).toMatchObject({ editorId: adaId, editorName: 'Ada' })
    })

    it('hands their drafts to the owner when they leave', async () => {
      ctx.store.drafts.reassignEditor(profile, adaId, bobId)
      expect((await bob.delete(`${base()}/members/${bobId}`)).status).toBe(204)
      expect((await open(ada)).editorId).toBe(adaId)
    })

    it('hands their drafts to the owner when they delete their account', async () => {
      ctx.store.drafts.reassignEditor(profile, adaId, bobId)
      const gone = await bob.delete('/api/account', {
        confirmEmail: 'bob@example.com',
        password: PASSWORD,
      })
      expect(gone.status).toBe(204)
      expect((await open(ada)).editorId).toBe(adaId)
    })

    it('hands them to the new owner when the owner who edited them deletes their account', async () => {
      const gone = await ada.delete('/api/account', {
        confirmEmail: 'ada@example.com',
        password: PASSWORD,
      })
      expect(gone.status).toBe(204)
      expect(await open(bob)).toMatchObject({ editorId: bobId, editorName: 'Bob' })
    })
  })
})
