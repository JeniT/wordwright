import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, MAX_OWNED_PROFILES } from '@lfwa/core'
import {
  PNG_BYTES,
  register,
  saveKey,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

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
    verifyAccounts(ctx, 'ada@example.com') // inviting requires the inviter's address to be confirmed
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

  it('shares a profile once the invitee accepts, and they can then write in it', async () => {
    await shareProfile(ctx, ada, adaProfile, bob, 'BOB@example.com')

    const draft = await (
      await bob.post(`/api/profiles/${adaProfile}/drafts`, { title: 'Joint', body: 'hi' })
    ).json()
    const seenByAda = await (await ada.get(`/api/profiles/${adaProfile}/drafts/${draft.id}`)).json()
    expect(seenByAda.title).toBe('Joint')
    expect(await (await bob.get('/api/profiles')).json()).toHaveLength(2)
  })

  it('reserves management, including inviting, for the owner', async () => {
    await shareProfile(ctx, ada, adaProfile, bob, 'bob@example.com')
    expect((await bob.patch(`/api/profiles/${adaProfile}`, { name: 'Mine now' })).status).toBe(403)
    expect((await bob.delete(`/api/profiles/${adaProfile}`)).status).toBe(403)
    expect(
      (await bob.post(`/api/profiles/${adaProfile}/invitations`, { email: 'x@example.com' }))
        .status,
    ).toBe(403)
    expect((await bob.get(`/api/profiles/${adaProfile}/invitations`)).status).toBe(403)
    expect((await ada.patch(`/api/profiles/${adaProfile}`, { name: 'Renamed' })).status).toBe(200)
  })

  it('lets editors leave but not the owner; owners can remove editors', async () => {
    await shareProfile(ctx, ada, adaProfile, bob, 'bob@example.com')
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    const adaId = (await (await ada.get('/api/auth/me')).json()).id

    expect((await ada.delete(`/api/profiles/${adaProfile}/members/${adaId}`)).status).toBe(400)
    expect((await bob.delete(`/api/profiles/${adaProfile}/members/${adaId}`)).status).toBe(403)
    expect((await bob.delete(`/api/profiles/${adaProfile}/members/${bobId}`)).status).toBe(204)
    expect((await bob.get(`/api/profiles/${adaProfile}`)).status).toBe(404)

    await shareProfile(ctx, ada, adaProfile, bob, 'bob@example.com') // can be invited again
    expect((await ada.delete(`/api/profiles/${adaProfile}/members/${bobId}`)).status).toBe(204)
  })

  it('has no way to add someone without their acceptance', async () => {
    const res = await ada.post(`/api/profiles/${adaProfile}/members`, { email: 'bob@example.com' })
    expect(res.status).toBe(404)
    expect(await (await bob.get('/api/profiles')).json()).toHaveLength(1)
  })

  it('deletes a profile and its drafts', async () => {
    await ada.post(`/api/profiles/${adaProfile}/drafts`, { title: 'x' })
    expect((await ada.delete(`/api/profiles/${adaProfile}`)).status).toBe(204)
    expect(ctx.store.drafts.list(adaProfile)).toEqual([])
  })
})

describe('profile ids', () => {
  it('give every user a unique handle, and build readable ids from it', async () => {
    const ctx = setup()
    const [sam, other] = [ctx.client(), ctx.client()]
    const user = await register(sam, 'sam@example.com', 'Sam')
    const second = await register(other, 'sam2@example.com', 'Sam')
    expect(user.handle).toBe('sam')
    expect(second.handle).toBe('sam2')
    expect((await sam.get('/api/auth/me').then((r) => r.json())).handle).toBe('sam')

    // Two people can each have a profile called "Substack" without clashing.
    const mine = await (await sam.post('/api/profiles', { name: 'Substack' })).json()
    const theirs = await (await other.post('/api/profiles', { name: 'Substack' })).json()
    expect(mine.id).toBe('sam-substack')
    expect(theirs.id).toBe('sam2-substack')

    // The same person reusing a name gets a numbered id rather than an error.
    const again = await (await sam.post('/api/profiles', { name: 'Substack' })).json()
    expect(again.id).toBe('sam-substack-2')
    expect(again.name).toBe('Substack')
  })

  it('cannot be forged by choosing a handle that looks like part of a slug', async () => {
    const ctx = setup()
    const [jen, jenit] = [ctx.client(), ctx.client()]
    await register(jen, 'jen@example.com', 'Jen')
    await register(jenit, 'jenit@example.com', 'Jenit')
    const a = await (await jen.post('/api/profiles', { name: 'it substack' })).json()
    const b = await (await jenit.post('/api/profiles', { name: 'Substack' })).json()
    expect(a.id).toBe('jen-it-substack')
    expect(b.id).toBe('jenit-substack')
  })

  it('stay the same when the profile is renamed, so shared links keep working', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const created = await (await c.post('/api/profiles', { name: 'Old name' })).json()
    const renamed = await (
      await c.patch(`/api/profiles/${created.id}`, { name: 'New name' })
    ).json()
    expect(renamed).toMatchObject({ id: 'sam-old-name', name: 'New name' })
  })

  it('fall back to a plain id for names with no letters or digits', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const created = await (await c.post('/api/profiles', { name: '日本語' })).json()
    expect(created.id).toBe('sam-profile')
  })

  it('limits how many profiles one person can own', async () => {
    const c = setup().client()
    await register(c)
    for (let n = 1; n < MAX_OWNED_PROFILES; n++) {
      expect((await c.post('/api/profiles', { name: `P${n}` })).status).toBe(201)
    }
    const res = await c.post('/api/profiles', { name: 'One too many' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/up to 25 profiles/)
  })
})

describe('profile site link', () => {
  let c: TestClient
  beforeEach(async () => {
    c = setup().client()
    await register(c)
  })

  it('is optional, and is normalised to a full web address', async () => {
    const plain = await (await c.post('/api/profiles', { name: 'No link' })).json()
    expect(plain.siteUrl).toBeNull()
    const linked = await (
      await c.post('/api/profiles', { name: 'Linked', siteUrl: ' jeni.substack.com ' })
    ).json()
    expect(linked.siteUrl).toBe('https://jeni.substack.com')
  })

  it('refuses addresses that are not web pages', async () => {
    for (const siteUrl of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', '']) {
      const res = await c.post('/api/profiles', { name: 'Bad', siteUrl })
      expect(res.status, siteUrl).toBe(400)
      // A plain message the UI can show as it is, not a nested validation object.
      expect((await res.json()).error, siteUrl).toBe(
        'Enter a web address, like https://example.com',
      )
    }
    const noName = await c.post('/api/profiles', { name: '   ' })
    expect(noName.status).toBe(400)
    expect((await noName.json()).error).toBe('Enter a name')
    const created = await (await c.post('/api/profiles', { name: 'Fine' })).json()
    expect((await c.patch(`/api/profiles/${created.id}`, { siteUrl: 'javascript:1' })).status).toBe(
      400,
    )
  })

  it('can be changed or cleared without touching the name', async () => {
    const { id } = await (
      await c.post('/api/profiles', { name: 'Venue', siteUrl: 'https://a.example' })
    ).json()
    const changed = await (
      await c.patch(`/api/profiles/${id}`, { siteUrl: 'https://b.example' })
    ).json()
    expect(changed).toMatchObject({ name: 'Venue', siteUrl: 'https://b.example' })
    const renamed = await (await c.patch(`/api/profiles/${id}`, { name: 'Venue 2' })).json()
    expect(renamed).toMatchObject({ name: 'Venue 2', siteUrl: 'https://b.example' })
    const cleared = await (await c.patch(`/api/profiles/${id}`, { siteUrl: null })).json()
    expect(cleared.siteUrl).toBeNull()
  })
})

describe('profile image', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let id: string
  const url = () => `/api/profiles/${id}/image`

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    id = (await (await ada.get('/api/profiles')).json())[0].id
  })

  it('starts empty, and can be uploaded, shown to members, replaced and removed', async () => {
    expect((await ada.get(url())).status).toBe(404)
    expect((await (await ada.get(`/api/profiles/${id}`)).json()).imageUrl).toBeNull()

    const uploaded = await ada.putBytes(url(), PNG_BYTES, 'image/png')
    expect(uploaded.status).toBe(200)
    const profile = await uploaded.json()
    expect(profile.imageUrl).toMatch(new RegExp(`^${url()}\\?v=\\d+$`))

    const served = await ada.get(profile.imageUrl)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect(served.headers.get('cache-control')).toContain('private')
    expect(await served.bytes()).toEqual(PNG_BYTES)

    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9])
    await ada.putBytes(url(), jpeg)
    expect((await ada.get(url())).headers.get('content-type')).toBe('image/jpeg')

    expect((await ada.delete(url())).status).toBe(204)
    expect((await ada.get(url())).status).toBe(404)
    expect((await (await ada.get(`/api/profiles/${id}`)).json()).imageUrl).toBeNull()
  })

  it('trusts the bytes, not the declared type, and refuses SVG and other files', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    for (const bytes of [html, svg, new Uint8Array()]) {
      const res = await ada.putBytes(url(), bytes, 'image/png')
      expect(res.status).toBe(415)
      expect((await res.json()).error).toMatch(/PNG, JPEG, WebP or GIF/)
    }
    // A real PNG is accepted even if the client mislabels it.
    expect((await ada.putBytes(url(), PNG_BYTES, 'text/plain')).status).toBe(200)
    expect((await ada.get(url())).headers.get('content-type')).toBe('image/png')
  })

  it('refuses images over the size limit and says what to do', async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    big.set(PNG_BYTES)
    const res = await ada.putBytes(url(), big, 'image/png')
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/under 1 MB/)
    expect((await ada.get(url())).status).toBe(404)
  })

  it('can be seen by members, changed only by the owner, and is hidden from everyone else', async () => {
    await ada.putBytes(url(), PNG_BYTES)
    expect((await bob.get(url())).status).toBe(404)
    expect((await bob.putBytes(url(), PNG_BYTES)).status).toBe(404)

    verifyAccounts(ctx, 'ada@example.com') // inviting requires the inviter's address to be confirmed
    await shareProfile(ctx, ada, id, bob, 'bob@example.com')
    expect((await bob.get(url())).status).toBe(200)
    expect((await bob.putBytes(url(), PNG_BYTES)).status).toBe(403)
    expect((await bob.delete(url())).status).toBe(403)
    expect((await setup().client().get(url())).status).toBe(401)
  })

  it('is deleted with the profile', async () => {
    await ada.putBytes(url(), PNG_BYTES)
    await ada.delete(`/api/profiles/${id}`)
    expect(ctx.store.profiles.getImage(id)).toBeUndefined()
  })
})

describe('drafts and critique within a profile', () => {
  it('creates, updates, lists and deletes drafts, and critiques via the LLM', async () => {
    const ctx = setup()
    const c = ctx.client()
    await register(c)
    await saveKey(c)
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
    expect(await critique.json()).toEqual({
      text: 'Critique from claude-sonnet-5-5: needs a stronger opening.',
    })
    expect(ctx.llmCalls.at(-1)?.request.messages[0]?.content).toContain('There')

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
