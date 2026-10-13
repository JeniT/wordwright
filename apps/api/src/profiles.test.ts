import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, MAX_OWNED_PROFILES } from '@lfwa/core'
import {
  PASSWORD,
  PNG_BYTES,
  register,
  saveKey,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
  createDraft,
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
    expect((await bob.get(`/api/profiles/${adaProfile}/ideas`)).status).toBe(404)
    expect((await bob.post(`/api/profiles/${adaProfile}/ideas`, { name: 'x' })).status).toBe(404)
  })

  it('shares a profile once the invitee accepts, and they can then write in it', async () => {
    await shareProfile(ctx, ada, adaProfile, bob, 'BOB@example.com')

    const draft = await createDraft(bob, adaProfile, { title: 'Joint', body: 'hi' })
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
    await createDraft(ada, adaProfile, { title: 'x' })
    expect((await ada.delete(`/api/profiles/${adaProfile}`)).status).toBe(204)
    expect(ctx.store.drafts.list(adaProfile)).toEqual([])
  })
})

describe('profile ids', () => {
  it('give every user a unique handle, and build readable ids from it', async () => {
    const ctx = setup()
    const [sam, other] = [ctx.client(), ctx.client()]
    const user = await register(sam, 'sam@example.com', 'Sam', PASSWORD, 'sam')
    const second = await register(other, 'sam2@example.com', 'Sam', PASSWORD, 'sam2')
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

  it('follow the name when a profile is renamed, keeping its drafts, members and picture', async () => {
    const ctx = setup()
    const [sam, pat] = [ctx.client(), ctx.client()]
    await register(sam, 'sam@example.com', 'Sam')
    await register(pat, 'pat@example.com', 'Pat')
    verifyAccounts(ctx, 'sam@example.com')
    const created = await (await sam.post('/api/profiles', { name: 'Old name' })).json()
    await shareProfile(ctx, sam, created.id, pat, 'pat@example.com')
    const draft = await createDraft(sam, created.id, { title: 'Hello', body: 'x' })
    await sam.post(`/api/profiles/${created.id}/ideas/${draft.ideaId}/notes`, { text: 'A note' })
    await sam.putBytes(`/api/profiles/${created.id}/image`, PNG_BYTES, 'image/png')

    const renamed = await (
      await sam.patch(`/api/profiles/${created.id}`, { name: 'New name' })
    ).json()
    expect(renamed).toMatchObject({ id: 'sam-new-name', name: 'New name' })
    expect(renamed.imageUrl).toContain('/api/profiles/sam-new-name/image')
    expect(renamed.members).toHaveLength(2)

    const listed = await (await pat.get('/api/profiles')).json()
    expect(listed.map((p: { id: string }) => p.id)).toContain('sam-new-name')
    const kept = await (await sam.get(`/api/profiles/sam-new-name/drafts/${draft.id}`)).json()
    expect(kept).toMatchObject({ id: draft.id, title: 'Hello' })
    const ideas = await (await sam.get('/api/profiles/sam-new-name/ideas')).json()
    expect(ideas).toMatchObject([{ id: draft.ideaId, draftCount: 1 }])
    const notes = await (
      await sam.get(`/api/profiles/sam-new-name/ideas/${draft.ideaId}/notes`)
    ).json()
    expect(notes).toMatchObject([{ text: 'A note' }])
    expect((await sam.get('/api/profiles/sam-new-name/image')).status).toBe(200)
  })

  it('send the old address permanently to the new one, for members only', async () => {
    const ctx = setup()
    const [sam, pat, eve] = [ctx.client(), ctx.client(), ctx.client()]
    await register(sam, 'sam@example.com', 'Sam')
    await register(pat, 'pat@example.com', 'Pat')
    await register(eve, 'eve@example.com', 'Eve')
    verifyAccounts(ctx, 'sam@example.com')
    const created = await (await sam.post('/api/profiles', { name: 'Old name' })).json()
    await shareProfile(ctx, sam, created.id, pat, 'pat@example.com')
    await sam.patch(`/api/profiles/${created.id}`, { name: 'Middle' })
    await sam.patch('/api/profiles/sam-middle', { name: 'Final' })

    for (const who of [sam, pat]) {
      // Reads get a 301; ids from before any number of renames reach the current one in one hop.
      const read = await who.get(`/api/profiles/${created.id}/ideas?x=1`)
      expect(read.status).toBe(301)
      expect(read.headers.get('location')).toBe('/api/profiles/sam-final/ideas?x=1')
      expect((await who.get('/api/profiles/sam-middle')).headers.get('location')).toBe(
        '/api/profiles/sam-final',
      )
    }
    // Writes get a 308 so the method and body are kept.
    const write = await pat.post(`/api/profiles/${created.id}/ideas`, { name: 'x' })
    expect(write.status).toBe(308)
    expect(write.headers.get('location')).toBe('/api/profiles/sam-final/ideas')

    // Someone with no access learns nothing, not even that the profile was renamed.
    const stranger = await eve.get(`/api/profiles/${created.id}`)
    expect(stranger.status).toBe(404)
    expect(stranger.headers.get('location')).toBeNull()
  })

  it('never hand a retired address to a new profile, but let the owner take it back', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const first = await (await c.post('/api/profiles', { name: 'Blog' })).json()
    await c.patch(`/api/profiles/${first.id}`, { name: 'Journal' })
    // "sam-blog" now redirects to the journal, so a new "Blog" gets the next free id.
    const second = await (await c.post('/api/profiles', { name: 'Blog' })).json()
    expect(second.id).toBe('sam-blog-2')
    expect((await c.get('/api/profiles/sam-blog')).status).toBe(301)

    // Renaming the journal back to "Blog" can't have sam-blog-2's id, and keeps its own.
    const back = await (await c.patch('/api/profiles/sam-journal', { name: 'Blog' })).json()
    expect(back.id).toBe('sam-blog')
    expect((await c.get('/api/profiles/sam-journal')).status).toBe(301)
    expect((await c.get('/api/profiles/sam-blog')).status).toBe(200)
  })

  it('keep an id when a rename gives the same address, and when only other fields change', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const created = await (await c.post('/api/profiles', { name: 'Blog' })).json()
    const tidied = await (await c.patch(`/api/profiles/${created.id}`, { name: 'BLOG!' })).json()
    expect(tidied).toMatchObject({ id: 'sam-blog', name: 'BLOG!' })
    const site = await (
      await c.patch('/api/profiles/sam-blog', { siteUrl: 'https://sam.example.com' })
    ).json()
    expect(site.id).toBe('sam-blog')
    expect((await c.get('/api/profiles/sam-blog')).status).toBe(200)
  })

  it('stop redirecting once the profile is deleted', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const created = await (await c.post('/api/profiles', { name: 'Old' })).json()
    await c.patch(`/api/profiles/${created.id}`, { name: 'New' })
    await c.delete('/api/profiles/sam-new')
    expect((await c.get(`/api/profiles/${created.id}`)).status).toBe(404)
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
    const cleared = await (await c.patch(`/api/profiles/${renamed.id}`, { siteUrl: null })).json()
    expect(cleared.siteUrl).toBeNull()
  })
})

describe('profile description', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let id: string
  const url = () => `/api/profiles/${id}/description`

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    id = (await (await ada.get('/api/profiles')).json())[0].id
  })

  it('starts empty, then keeps what is written, trimmed', async () => {
    const before = await (await ada.get(`/api/profiles/${id}`)).json()
    expect(before).toMatchObject({ description: null })
    // A description is always the writer's own words: nothing says where it came from or whether it was accepted.
    for (const gone of ['descriptionOrigin', 'descriptionConfirmed', 'descriptionSources']) {
      expect(before).not.toHaveProperty(gone)
    }
    expect((await ada.post(`/api/profiles/${id}/description/confirm`, {})).status).toBe(404)
    const markdown = 'Weeknotes, mostly *for me*. See [the site](https://example.com).'
    const res = await ada.put(url(), { description: `  ${markdown}\n` })
    expect(res.status).toBe(200)
    expect((await res.json()).description).toBe(markdown)
    expect((await (await ada.get('/api/profiles')).json())[0].description).toBe(markdown)
  })

  it('clears with blank text or null, and refuses text that is too long', async () => {
    await ada.put(url(), { description: 'Something' })
    expect((await (await ada.put(url(), { description: '  \n ' })).json()).description).toBeNull()
    await ada.put(url(), { description: 'Again' })
    expect((await (await ada.put(url(), { description: null })).json()).description).toBeNull()
    const tooLong = await ada.put(url(), { description: 'x'.repeat(5001) })
    expect(tooLong.status).toBe(400)
    expect((await tooLong.json()).error).toContain('5000')
    expect((await ada.put(url(), { description: 'x'.repeat(5000) })).status).toBe(200)
  })

  it('can be written by any member, and is hidden from everyone else', async () => {
    expect((await bob.put(url(), { description: 'Sneaky' })).status).toBe(404)
    expect((await setup().client().put(url(), { description: 'x' })).status).toBe(401)
    await shareProfile(ctx, ada, id, bob, 'bob@example.com')
    const res = await bob.put(url(), { description: 'Written by an editor' })
    expect(res.status).toBe(200)
    expect((await (await ada.get(`/api/profiles/${id}`)).json()).description).toBe(
      'Written by an editor',
    )
    // The name and website stay the owner's.
    expect((await bob.patch(`/api/profiles/${id}`, { name: 'Mine' })).status).toBe(403)
  })

  it('is kept when the profile is renamed, and goes with the profile', async () => {
    await ada.put(url(), { description: 'Stays put' })
    const renamed = await (await ada.patch(`/api/profiles/${id}`, { name: 'Renamed' })).json()
    expect(renamed.description).toBe('Stays put')
    expect((await ada.delete(`/api/profiles/${renamed.id}`)).status).toBe(204)
    expect((await ada.get(`/api/profiles/${renamed.id}`)).status).toBe(404)
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

    const draft = await createDraft(c, pid, { title: 'Hello', body: 'World' })
    expect(draft).toMatchObject({ title: 'Hello', body: 'World', profileId: pid })

    const updated = await (
      await c.put(`${base}/drafts/${draft.id}`, { title: 'Hi', body: 'There' })
    ).json()
    expect(updated).toMatchObject({ title: 'Hi', body: 'There' })
    const idea = await (await c.get(`${base}/ideas/${draft.ideaId}`)).json()
    expect(idea.drafts).toMatchObject([{ id: draft.id, title: 'Hi' }])

    const critique = await c.post(`${base}/assist/critique`, { draftId: draft.id })
    expect(await critique.json()).toMatchObject({
      used: 1,
      allowed: 3,
      round: {
        summary: 'Critique from claude-sonnet-5-5.',
        ready: false,
        points: [
          {
            block: 'b1',
            excerpt: 'There',
            point: 'Needs a stronger opening.',
            reason: 'It is the first thing read.',
            dismissed: false,
          },
        ],
      },
    })
    expect(ctx.llmCalls.at(-1)?.request.messages[0]?.content).toContain('[b1] There')

    expect((await c.delete(`${base}/drafts/${draft.id}`)).status).toBe(204)
    expect((await c.get(`${base}/drafts/${draft.id}`)).status).toBe(404)
    expect((await c.post(`${base}/assist/critique`, { draftId: 'nope' })).status).toBe(404)
  })

  it('rejects invalid drafts', async () => {
    const c = setup().client()
    await register(c)
    const pid = (await (await c.get('/api/profiles')).json())[0].id
    const idea = await (await c.post(`/api/profiles/${pid}/ideas`, { name: 'x' })).json()
    expect(
      (await c.post(`/api/profiles/${pid}/ideas/${idea.id}/drafts`, { title: 42 })).status,
    ).toBe(400)
  })
})
