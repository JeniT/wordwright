import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFeedFetcher, MAX_IMAGE_BYTES, MAX_OWNED_PUBLICATIONS } from '@lfwa/core'
import { exampleFeeds } from './feeds/factory'
import {
  PASSWORD,
  PNG_BYTES,
  register,
  saveKey,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
  createDraft,
} from './test-helpers'

describe('publications and sharing', () => {
  let ada: TestClient
  let bob: TestClient
  let ctx: ReturnType<typeof setup>
  let adaPublication: string

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com') // inviting requires the inviter's address to be confirmed
    adaPublication = (await (await ada.get('/api/publications')).json())[0].id
  })

  it('lets a user have several publications', async () => {
    const res = await ada.post('/api/publications', { name: 'Newsletter' })
    expect(res.status).toBe(201)
    expect(await (await ada.get('/api/publications')).json()).toHaveLength(2)
  })

  it("hides other people's publications", async () => {
    expect(await (await bob.get('/api/publications')).json()).toHaveLength(1)
    expect((await bob.get(`/api/publications/${adaPublication}`)).status).toBe(404)
    expect((await bob.get(`/api/publications/${adaPublication}/ideas`)).status).toBe(404)
    expect(
      (await bob.post(`/api/publications/${adaPublication}/ideas`, { name: 'x' })).status,
    ).toBe(404)
  })

  it('shares a publication once the invitee accepts, and they can then write in it', async () => {
    await sharePublication(ctx, ada, adaPublication, bob, 'BOB@example.com')

    const draft = await createDraft(bob, adaPublication, { title: 'Joint', body: 'hi' })
    const seenByAda = await (
      await ada.get(`/api/publications/${adaPublication}/drafts/${draft.id}`)
    ).json()
    expect(seenByAda.title).toBe('Joint')
    expect(await (await bob.get('/api/publications')).json()).toHaveLength(2)
  })

  it('reserves management, including inviting, for the owner', async () => {
    await sharePublication(ctx, ada, adaPublication, bob, 'bob@example.com')
    expect(
      (await bob.patch(`/api/publications/${adaPublication}`, { name: 'Mine now' })).status,
    ).toBe(403)
    expect((await bob.delete(`/api/publications/${adaPublication}`)).status).toBe(403)
    expect(
      (
        await bob.post(`/api/publications/${adaPublication}/invitations`, {
          email: 'x@example.com',
        })
      ).status,
    ).toBe(403)
    expect((await bob.get(`/api/publications/${adaPublication}/invitations`)).status).toBe(403)
    expect(
      (await ada.patch(`/api/publications/${adaPublication}`, { name: 'Renamed' })).status,
    ).toBe(200)
  })

  it('lets editors leave but not the owner; owners can remove editors', async () => {
    await sharePublication(ctx, ada, adaPublication, bob, 'bob@example.com')
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    const adaId = (await (await ada.get('/api/auth/me')).json()).id

    expect((await ada.delete(`/api/publications/${adaPublication}/members/${adaId}`)).status).toBe(
      400,
    )
    expect((await bob.delete(`/api/publications/${adaPublication}/members/${adaId}`)).status).toBe(
      403,
    )
    expect((await bob.delete(`/api/publications/${adaPublication}/members/${bobId}`)).status).toBe(
      204,
    )
    expect((await bob.get(`/api/publications/${adaPublication}`)).status).toBe(404)

    await sharePublication(ctx, ada, adaPublication, bob, 'bob@example.com') // can be invited again
    expect((await ada.delete(`/api/publications/${adaPublication}/members/${bobId}`)).status).toBe(
      204,
    )
  })

  it('has no way to add someone without their acceptance', async () => {
    const res = await ada.post(`/api/publications/${adaPublication}/members`, {
      email: 'bob@example.com',
    })
    expect(res.status).toBe(404)
    expect(await (await bob.get('/api/publications')).json()).toHaveLength(1)
  })

  it('deletes a publication and its drafts', async () => {
    await createDraft(ada, adaPublication, { title: 'x' })
    expect((await ada.delete(`/api/publications/${adaPublication}`)).status).toBe(204)
    expect(ctx.store.drafts.list(adaPublication)).toEqual([])
  })
})

describe('publication ids', () => {
  it('give every user a unique handle, and build readable ids from it', async () => {
    const ctx = setup()
    const [sam, other] = [ctx.client(), ctx.client()]
    const user = await register(sam, 'sam@example.com', 'Sam', PASSWORD, 'sam')
    const second = await register(other, 'sam2@example.com', 'Sam', PASSWORD, 'sam2')
    expect(user.handle).toBe('sam')
    expect(second.handle).toBe('sam2')
    expect((await sam.get('/api/auth/me').then((r) => r.json())).handle).toBe('sam')

    // Two people can each have a publication called "Substack" without clashing.
    const mine = await (await sam.post('/api/publications', { name: 'Substack' })).json()
    const theirs = await (await other.post('/api/publications', { name: 'Substack' })).json()
    expect(mine.id).toBe('sam-substack')
    expect(theirs.id).toBe('sam2-substack')

    // The same person reusing a name gets a numbered id rather than an error.
    const again = await (await sam.post('/api/publications', { name: 'Substack' })).json()
    expect(again.id).toBe('sam-substack-2')
    expect(again.name).toBe('Substack')
  })

  it('cannot be forged by choosing a handle that looks like part of a slug', async () => {
    const ctx = setup()
    const [jen, jenit] = [ctx.client(), ctx.client()]
    await register(jen, 'jen@example.com', 'Jen')
    await register(jenit, 'jenit@example.com', 'Jenit')
    const a = await (await jen.post('/api/publications', { name: 'it substack' })).json()
    const b = await (await jenit.post('/api/publications', { name: 'Substack' })).json()
    expect(a.id).toBe('jen-it-substack')
    expect(b.id).toBe('jenit-substack')
  })

  it('follow the name when a publication is renamed, keeping its drafts, members and picture', async () => {
    const ctx = setup()
    const [sam, pat] = [ctx.client(), ctx.client()]
    await register(sam, 'sam@example.com', 'Sam')
    await register(pat, 'pat@example.com', 'Pat')
    verifyAccounts(ctx, 'sam@example.com')
    const created = await (await sam.post('/api/publications', { name: 'Old name' })).json()
    await sharePublication(ctx, sam, created.id, pat, 'pat@example.com')
    const draft = await createDraft(sam, created.id, { title: 'Hello', body: 'x' })
    await sam.post(`/api/publications/${created.id}/ideas/${draft.ideaId}/notes`, {
      text: 'A note',
    })
    await sam.putBytes(`/api/publications/${created.id}/image`, PNG_BYTES, 'image/png')

    const renamed = await (
      await sam.patch(`/api/publications/${created.id}`, { name: 'New name' })
    ).json()
    expect(renamed).toMatchObject({ id: 'sam-new-name', name: 'New name' })
    expect(renamed.imageUrl).toContain('/api/publications/sam-new-name/image')
    expect(renamed.members).toHaveLength(2)

    const listed = await (await pat.get('/api/publications')).json()
    expect(listed.map((p: { id: string }) => p.id)).toContain('sam-new-name')
    const kept = await (await sam.get(`/api/publications/sam-new-name/drafts/${draft.id}`)).json()
    expect(kept).toMatchObject({ id: draft.id, title: 'Hello' })
    const ideas = await (await sam.get('/api/publications/sam-new-name/ideas')).json()
    expect(ideas).toMatchObject([{ id: draft.ideaId, draftCount: 1 }])
    const notes = await (
      await sam.get(`/api/publications/sam-new-name/ideas/${draft.ideaId}/notes`)
    ).json()
    expect(notes).toMatchObject([{ text: 'A note' }])
    expect((await sam.get('/api/publications/sam-new-name/image')).status).toBe(200)
  })

  it('send the old address permanently to the new one, for members only', async () => {
    const ctx = setup()
    const [sam, pat, eve] = [ctx.client(), ctx.client(), ctx.client()]
    await register(sam, 'sam@example.com', 'Sam')
    await register(pat, 'pat@example.com', 'Pat')
    await register(eve, 'eve@example.com', 'Eve')
    verifyAccounts(ctx, 'sam@example.com')
    const created = await (await sam.post('/api/publications', { name: 'Old name' })).json()
    await sharePublication(ctx, sam, created.id, pat, 'pat@example.com')
    await sam.patch(`/api/publications/${created.id}`, { name: 'Middle' })
    await sam.patch('/api/publications/sam-middle', { name: 'Final' })

    for (const who of [sam, pat]) {
      // Reads get a 301; ids from before any number of renames reach the current one in one hop.
      const read = await who.get(`/api/publications/${created.id}/ideas?x=1`)
      expect(read.status).toBe(301)
      expect(read.headers.get('location')).toBe('/api/publications/sam-final/ideas?x=1')
      expect((await who.get('/api/publications/sam-middle')).headers.get('location')).toBe(
        '/api/publications/sam-final',
      )
    }
    // Writes get a 308 so the method and body are kept.
    const write = await pat.post(`/api/publications/${created.id}/ideas`, { name: 'x' })
    expect(write.status).toBe(308)
    expect(write.headers.get('location')).toBe('/api/publications/sam-final/ideas')

    // Someone with no access learns nothing, not even that the publication was renamed.
    const stranger = await eve.get(`/api/publications/${created.id}`)
    expect(stranger.status).toBe(404)
    expect(stranger.headers.get('location')).toBeNull()
  })

  it('never hand a retired address to a new publication, but let the owner take it back', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const first = await (await c.post('/api/publications', { name: 'Blog' })).json()
    await c.patch(`/api/publications/${first.id}`, { name: 'Journal' })
    // "sam-blog" now redirects to the journal, so a new "Blog" gets the next free id.
    const second = await (await c.post('/api/publications', { name: 'Blog' })).json()
    expect(second.id).toBe('sam-blog-2')
    expect((await c.get('/api/publications/sam-blog')).status).toBe(301)

    // Renaming the journal back to "Blog" can't have sam-blog-2's id, and keeps its own.
    const back = await (await c.patch('/api/publications/sam-journal', { name: 'Blog' })).json()
    expect(back.id).toBe('sam-blog')
    expect((await c.get('/api/publications/sam-journal')).status).toBe(301)
    expect((await c.get('/api/publications/sam-blog')).status).toBe(200)
  })

  it('keep an id when a rename gives the same address, and when only other fields change', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const created = await (await c.post('/api/publications', { name: 'Blog' })).json()
    const tidied = await (
      await c.patch(`/api/publications/${created.id}`, { name: 'BLOG!' })
    ).json()
    expect(tidied).toMatchObject({ id: 'sam-blog', name: 'BLOG!' })
    const site = await (
      await c.patch('/api/publications/sam-blog', { siteUrl: 'https://sam.example.com' })
    ).json()
    expect(site.id).toBe('sam-blog')
    expect((await c.get('/api/publications/sam-blog')).status).toBe(200)
  })

  it('stop redirecting once the publication is deleted', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const created = await (await c.post('/api/publications', { name: 'Old' })).json()
    await c.patch(`/api/publications/${created.id}`, { name: 'New' })
    await c.delete('/api/publications/sam-new')
    expect((await c.get(`/api/publications/${created.id}`)).status).toBe(404)
  })

  it('fall back to a plain id for names with no letters or digits', async () => {
    const c = setup().client()
    await register(c, 'sam@example.com', 'Sam')
    const created = await (await c.post('/api/publications', { name: '日本語' })).json()
    expect(created.id).toBe('sam-publication')
  })

  it('limits how many publications one person can own', async () => {
    const c = setup().client()
    await register(c)
    for (let n = 1; n < MAX_OWNED_PUBLICATIONS; n++) {
      expect((await c.post('/api/publications', { name: `P${n}` })).status).toBe(201)
    }
    const res = await c.post('/api/publications', { name: 'One too many' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/up to 25 publications/)
  })
})

describe('publication site link', () => {
  let c: TestClient
  beforeEach(async () => {
    c = setup().client()
    await register(c)
  })

  it('is optional, and is normalised to a full web address', async () => {
    const plain = await (await c.post('/api/publications', { name: 'No link' })).json()
    expect(plain.siteUrl).toBeNull()
    const linked = await (
      await c.post('/api/publications', { name: 'Linked', siteUrl: ' jeni.substack.com ' })
    ).json()
    expect(linked.siteUrl).toBe('https://jeni.substack.com')
  })

  it('refuses addresses that are not web pages', async () => {
    for (const siteUrl of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', '']) {
      const res = await c.post('/api/publications', { name: 'Bad', siteUrl })
      expect(res.status, siteUrl).toBe(400)
      // A plain message the UI can show as it is, not a nested validation object.
      expect((await res.json()).error, siteUrl).toBe(
        'Enter a web address, like https://example.com',
      )
    }
    const noName = await c.post('/api/publications', { name: '   ' })
    expect(noName.status).toBe(400)
    expect((await noName.json()).error).toBe('Enter a name')
    const created = await (await c.post('/api/publications', { name: 'Fine' })).json()
    expect(
      (await c.patch(`/api/publications/${created.id}`, { siteUrl: 'javascript:1' })).status,
    ).toBe(400)
  })

  it('can be changed or cleared without touching the name', async () => {
    const { id } = await (
      await c.post('/api/publications', { name: 'Publication', siteUrl: 'https://a.example' })
    ).json()
    const changed = await (
      await c.patch(`/api/publications/${id}`, { siteUrl: 'https://b.example' })
    ).json()
    expect(changed).toMatchObject({ name: 'Publication', siteUrl: 'https://b.example' })
    const renamed = await (
      await c.patch(`/api/publications/${id}`, { name: 'Publication 2' })
    ).json()
    expect(renamed).toMatchObject({ name: 'Publication 2', siteUrl: 'https://b.example' })
    const cleared = await (
      await c.patch(`/api/publications/${renamed.id}`, { siteUrl: null })
    ).json()
    expect(cleared.siteUrl).toBeNull()
  })
})

describe('publication description', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let id: string
  const url = () => `/api/publications/${id}/description`

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    id = (await (await ada.get('/api/publications')).json())[0].id
  })

  it('starts empty, then keeps what is written, trimmed', async () => {
    const before = await (await ada.get(`/api/publications/${id}`)).json()
    expect(before).toMatchObject({ description: null })
    // A description is always the writer's own words: nothing says where it came from or whether it was accepted.
    for (const gone of ['descriptionOrigin', 'descriptionConfirmed', 'descriptionSources']) {
      expect(before).not.toHaveProperty(gone)
    }
    expect((await ada.post(`/api/publications/${id}/description/confirm`, {})).status).toBe(404)
    const markdown = 'Weeknotes, mostly *for me*. See [the site](https://example.com).'
    const res = await ada.put(url(), { description: `  ${markdown}\n` })
    expect(res.status).toBe(200)
    expect((await res.json()).description).toBe(markdown)
    expect((await (await ada.get('/api/publications')).json())[0].description).toBe(markdown)
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
    await sharePublication(ctx, ada, id, bob, 'bob@example.com')
    const res = await bob.put(url(), { description: 'Written by an editor' })
    expect(res.status).toBe(200)
    expect((await (await ada.get(`/api/publications/${id}`)).json()).description).toBe(
      'Written by an editor',
    )
    // The name and website stay the owner's.
    expect((await bob.patch(`/api/publications/${id}`, { name: 'Mine' })).status).toBe(403)
  })

  it('is kept when the publication is renamed, and goes with the publication', async () => {
    await ada.put(url(), { description: 'Stays put' })
    const renamed = await (await ada.patch(`/api/publications/${id}`, { name: 'Renamed' })).json()
    expect(renamed.description).toBe('Stays put')
    expect((await ada.delete(`/api/publications/${renamed.id}`)).status).toBe(204)
    expect((await ada.get(`/api/publications/${renamed.id}`)).status).toBe(404)
  })
})

describe('publication image', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let id: string
  const url = () => `/api/publications/${id}/image`

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    id = (await (await ada.get('/api/publications')).json())[0].id
  })

  it('starts empty, and can be uploaded, shown to members, replaced and removed', async () => {
    expect((await ada.get(url())).status).toBe(404)
    expect((await (await ada.get(`/api/publications/${id}`)).json()).imageUrl).toBeNull()

    const uploaded = await ada.putBytes(url(), PNG_BYTES, 'image/png')
    expect(uploaded.status).toBe(200)
    const publication = await uploaded.json()
    expect(publication.imageUrl).toMatch(new RegExp(`^${url()}\\?v=\\d+$`))

    const served = await ada.get(publication.imageUrl)
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
    expect((await (await ada.get(`/api/publications/${id}`)).json()).imageUrl).toBeNull()
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
    await sharePublication(ctx, ada, id, bob, 'bob@example.com')
    expect((await bob.get(url())).status).toBe(200)
    expect((await bob.putBytes(url(), PNG_BYTES)).status).toBe(403)
    expect((await bob.delete(url())).status).toBe(403)
    expect((await setup().client().get(url())).status).toBe(401)
  })

  it('is deleted with the publication', async () => {
    await ada.putBytes(url(), PNG_BYTES)
    await ada.delete(`/api/publications/${id}`)
    expect(ctx.store.publications.getImage(id)).toBeUndefined()
  })
})

describe('drafts and critique within a publication', () => {
  it('creates, updates, lists and deletes drafts, and critiques via the LLM', async () => {
    const ctx = setup()
    const c = ctx.client()
    await register(c)
    await saveKey(c)
    const pid = (await (await c.get('/api/publications')).json())[0].id
    const base = `/api/publications/${pid}`

    const draft = await createDraft(c, pid, { title: 'Hello', body: 'World' })
    expect(draft).toMatchObject({ title: 'Hello', body: 'World', publicationId: pid })

    const updated = await (
      await c.put(`${base}/drafts/${draft.id}`, {
        title: 'Hi',
        body: 'There',
        version: draft.version,
      })
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
      },
    })
    expect(await (await c.get(`${base}/drafts/${draft.id}/comments`)).json()).toMatchObject([
      {
        byAi: true,
        block: 'b1',
        excerpt: 'There',
        text: 'Needs a stronger opening.',
        reason: 'It is the first thing read.',
        resolved: false,
      },
    ])
    expect(ctx.llmCalls.at(-1)?.request.messages[0]?.content).toContain('[b1] There')

    expect((await c.delete(`${base}/drafts/${draft.id}`)).status).toBe(204)
    expect((await c.get(`${base}/drafts/${draft.id}`)).status).toBe(404)
    expect((await c.post(`${base}/assist/critique`, { draftId: 'nope' })).status).toBe(404)
  })

  it('rejects invalid drafts', async () => {
    const c = setup().client()
    await register(c)
    const pid = (await (await c.get('/api/publications')).json())[0].id
    const idea = await (await c.post(`/api/publications/${pid}/ideas`, { name: 'x' })).json()
    expect(
      (await c.post(`/api/publications/${pid}/ideas/${idea.id}/drafts`, { title: 42 })).status,
    ).toBe(400)
  })
})

describe('several owners', () => {
  let ada: TestClient
  let bob: TestClient
  let ctx: ReturnType<typeof setup>
  let publication: string
  let adaId: string
  let bobId: string
  const role = (client: TestClient, userId: string, role: 'owner' | 'member') =>
    client.put(`/api/publications/${publication}/members/${userId}/role`, { role })
  const roleOf = async (userId: string) =>
    (
      (await (await ada.get(`/api/publications/${publication}`)).json()).members as {
        userId: string
        role: string
      }[]
    ).find((m) => m.userId === userId)?.role

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com', 'bob@example.com')
    publication = (await (await ada.get('/api/publications')).json())[0].id
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    adaId = (await (await ada.get('/api/auth/me')).json()).id
    bobId = (await (await bob.get('/api/auth/me')).json()).id
  })

  it('lets an owner make a member an owner, who can then manage the publication', async () => {
    expect((await bob.patch(`/api/publications/${publication}`, { name: 'Mine' })).status).toBe(403)
    const res = await role(ada, bobId, 'owner')
    expect(res.status).toBe(200)
    expect(
      (await res.json()).members.find((m: { userId: string }) => m.userId === bobId).role,
    ).toBe('owner')
    expect((await bob.patch(`/api/publications/${publication}`, { name: 'Ours' })).status).toBe(200)
  })

  it('lets an owner remove another owner, who stays a member with their drafts', async () => {
    await role(ada, bobId, 'owner')
    const draft = await createDraft(bob, publication, { title: 'Bob wrote this' })
    expect(
      (await ada.put(`/api/publications/${publication}/members/${bobId}/role`, { role: 'member' }))
        .status,
    ).toBe(200)
    expect(await roleOf(bobId)).toBe('member')
    expect((await bob.patch(`/api/publications/${publication}`, { name: 'x' })).status).toBe(403)
    const seen = await (await bob.get(`/api/publications/${publication}/drafts/${draft.id}`)).json()
    expect(seen.editorId).toBe(bobId)
  })

  it('lets an owner step down when another owner exists, and then lose owner-only powers', async () => {
    await role(ada, bobId, 'owner')
    expect((await role(ada, adaId, 'member')).status).toBe(200)
    expect((await ada.patch(`/api/publications/${publication}`, { name: 'x' })).status).toBe(403)
    expect(await roleOf(adaId)).toBe('member')
  })

  it('never leaves a publication without an owner', async () => {
    const res = await role(ada, adaId, 'member')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/at least one owner/i)
    expect(await roleOf(adaId)).toBe('owner')
  })

  it('stops two owners removing each other at once', async () => {
    await role(ada, bobId, 'owner')
    expect((await role(ada, bobId, 'member')).status).toBe(200)
    // Bob has just been demoted, so his request to demote Ada is no longer allowed.
    expect((await role(bob, adaId, 'member')).status).toBe(403)
    expect(await roleOf(adaId)).toBe('owner')
  })

  it('is for owners only, and for members of this publication only', async () => {
    expect((await role(bob, bobId, 'owner')).status).toBe(403)
    expect((await role(bob, adaId, 'member')).status).toBe(403)
    const stranger = ctx.client()
    await register(stranger, 'eve@example.com', 'Eve')
    expect((await role(stranger, bobId, 'owner')).status).toBe(404)
    const eveId = (await (await stranger.get('/api/auth/me')).json()).id
    expect((await role(ada, eveId, 'owner')).status).toBe(404) // not a member
    expect(
      (await ada.put(`/api/publications/${publication}/members/${bobId}/role`, { role: 'admin' }))
        .status,
    ).toBe(400)
  })

  it('tells an owner who tries to leave what to do instead', async () => {
    const alone = await ada.delete(`/api/publications/${publication}/members/${adaId}`)
    expect(alone.status).toBe(400)
    expect((await alone.json()).error).toMatch(/make someone else an owner first/i)
    await role(ada, bobId, 'owner')
    const shared = await ada.delete(`/api/publications/${publication}/members/${adaId}`)
    expect((await shared.json()).error).toMatch(/step down as owner first/i)
  })

  it('does not let the last owner delete their account while others depend on the publication', async () => {
    const body = { confirmEmail: 'ada@example.com', password: PASSWORD }
    const refused = await ada.delete('/api/account', body)
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toMatch(/make someone else an owner first/i)
    expect((await ada.get('/api/auth/me')).status).toBe(200)
    await role(ada, bobId, 'owner')
    expect((await ada.delete('/api/account', body)).status).toBe(204)
    expect(await (await bob.get(`/api/publications/${publication}`)).json()).toMatchObject({
      role: 'owner',
    })
  })
})

describe('publication site icon', () => {
  let ctx: ReturnType<typeof setup>
  let fetcher: FakeFeedFetcher
  let ada: TestClient
  let bob: TestClient

  beforeEach(async () => {
    fetcher = exampleFeeds()
    ctx = setup({ feeds: fetcher })
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
  })

  it('is fetched when a publication is created with a website, and served to members only', async () => {
    const created = await (
      await ada.post('/api/publications', { name: 'Garden', siteUrl: 'https://garden.example/' })
    ).json()
    expect(created.imageUrl).toBeNull()
    expect(created.siteIconUrl).toMatch(
      new RegExp(`^/api/publications/${created.id}/site-icon\\?v=\\d+$`),
    )

    const served = await ada.get(created.siteIconUrl)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await bob.get(`/api/publications/${created.id}/site-icon`)).status).toBe(404)
  })

  it('is left out when there is no website, or the site has no icon', async () => {
    const plain = await (await ada.post('/api/publications', { name: 'Plain' })).json()
    expect(plain.siteIconUrl).toBeNull()
    expect((await ada.get(`/api/publications/${plain.id}/site-icon`)).status).toBe(404)
    // Not a *.example address, so the fake knows no icon for it.
    const bare = await ada.post('/api/publications', {
      name: 'Bare',
      siteUrl: 'https://nothing.test/',
    })
    expect(bare.status).toBe(201)
    expect((await bare.json()).siteIconUrl).toBeNull()
  })

  it('never stops a publication being created when the icon cannot be fetched', async () => {
    const failing = setup({
      feeds: new FakeFeedFetcher({}, () => ({ icon: true })),
    })
    vi.spyOn(failing.feeds, 'fetchIcon').mockRejectedValue(new Error('network down'))
    const c = failing.client()
    await register(c, 'cy@example.com', 'Cy')
    const res = await c.post('/api/publications', {
      name: 'Garden',
      siteUrl: 'https://garden.example/',
    })
    expect(res.status).toBe(201)
    expect((await res.json()).siteIconUrl).toBeNull()
  })

  it('follows the website: replaced when it changes, removed when it is cleared', async () => {
    const created = await (
      await ada.post('/api/publications', { name: 'Garden', siteUrl: 'https://garden.example/' })
    ).json()
    expect(fetcher.iconsFetched).toEqual(['https://garden.example/'])

    // A change of name alone fetches nothing.
    const renamed = await (
      await ada.patch(`/api/publications/${created.id}`, { name: 'Allotment' })
    ).json()
    expect(fetcher.iconsFetched).toHaveLength(1)
    expect(renamed.siteIconUrl).toContain(`/api/publications/${renamed.id}/site-icon`)

    const moved = await (
      await ada.patch(`/api/publications/${renamed.id}`, { siteUrl: 'https://allotment.example/' })
    ).json()
    expect(fetcher.iconsFetched).toEqual(['https://garden.example/', 'https://allotment.example/'])
    expect(moved.siteIconUrl).not.toBeNull()

    const cleared = await (
      await ada.patch(`/api/publications/${renamed.id}`, { siteUrl: null })
    ).json()
    expect(cleared.siteIconUrl).toBeNull()
    expect((await ada.get(`/api/publications/${renamed.id}/site-icon`)).status).toBe(404)
  })

  it('drops the old icon when the new website has none', async () => {
    const created = await (
      await ada.post('/api/publications', { name: 'Garden', siteUrl: 'https://garden.example/' })
    ).json()
    const moved = await (
      await ada.patch(`/api/publications/${created.id}`, { siteUrl: 'https://nothing.test/' })
    ).json()
    expect(moved.siteIconUrl).toBeNull()
  })

  it('does not touch the uploaded picture, which is kept alongside it', async () => {
    const created = await (
      await ada.post('/api/publications', { name: 'Garden', siteUrl: 'https://garden.example/' })
    ).json()
    await ada.putBytes(`/api/publications/${created.id}/image`, PNG_BYTES, 'image/png')
    const publication = await (await ada.get(`/api/publications/${created.id}`)).json()
    expect(publication.imageUrl).not.toBeNull()
    expect(publication.siteIconUrl).not.toBeNull()
    await ada.delete(`/api/publications/${created.id}/image`)
    const after = await (await ada.get(`/api/publications/${created.id}`)).json()
    expect(after.imageUrl).toBeNull()
    expect(after.siteIconUrl).not.toBeNull()
  })

  it('goes with the publication, and moves with it when it is renamed', async () => {
    const created = await (
      await ada.post('/api/publications', { name: 'Garden', siteUrl: 'https://garden.example/' })
    ).json()
    const renamed = await (
      await ada.patch(`/api/publications/${created.id}`, { name: 'Allotment' })
    ).json()
    expect((await ada.get(`/api/publications/${renamed.id}/site-icon`)).status).toBe(200)
    expect(ctx.store.publications.getSiteIcon(renamed.id)).toBeDefined()
    await ada.delete(`/api/publications/${renamed.id}`)
    expect(ctx.store.publications.getSiteIcon(renamed.id)).toBeUndefined()
  })
})
