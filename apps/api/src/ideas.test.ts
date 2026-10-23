import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_IDEA_LINKS } from '@wordwright/core'
import { register, setup, sharePublication, verifyAccounts, type TestClient } from './test-helpers'

describe('ideas', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let publication: string
  const ideas = () => `/api/publications/${publication}/ideas`

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    publication = (await (await ada.get('/api/publications')).json())[0].id
  })

  it('starts with none, and lists them most recently changed first', async () => {
    expect(await (await ada.get(ideas())).json()).toEqual([])
    await ada.post(ideas(), { name: 'Rivers' })
    ctx.clock.now = new Date('2026-01-02T00:00:00Z')
    await ada.post(ideas(), { name: 'Tides' })
    const list = await (await ada.get(ideas())).json()
    expect(list.map((i: { name: string }) => i.name)).toEqual(['Tides', 'Rivers'])
    expect(list[0]).toMatchObject({ draftCount: 0 })
  })

  it('creates an idea with a name and notes, and reads it back', async () => {
    const res = await ada.post(ideas(), { name: '  Why rivers meander  ', notes: 'Erosion loops.' })
    expect(res.status).toBe(201)
    const idea = await res.json()
    expect(idea).toMatchObject({
      publicationId: publication,
      name: 'Why rivers meander', // trimmed
      notes: '- Erosion loops.',
      links: [],
      drafts: [],
    })
    expect(await (await ada.get(`${ideas()}/${idea.id}`)).json()).toEqual(idea)
  })

  it('notes are optional', async () => {
    const idea = await (await ada.post(ideas(), { name: 'Just a name' })).json()
    expect(idea.notes).toBe('')
  })

  it('refuses a missing name with a readable message', async () => {
    const res = await ada.post(ideas(), { name: '   ', notes: 'x' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Describe your idea in a few words' })
  })

  it('updates the name and notes independently', async () => {
    const idea = await (await ada.post(ideas(), { name: 'Old', notes: 'Keep me' })).json()
    const renamed = await (await ada.patch(`${ideas()}/${idea.id}`, { name: 'New' })).json()
    expect(renamed).toMatchObject({ name: 'New', notes: '- Keep me' })
    const rewritten = await (await ada.patch(`${ideas()}/${idea.id}`, { notes: 'Changed' })).json()
    expect(rewritten).toMatchObject({ name: 'New', notes: '- Changed' })
    expect((await ada.patch(`${ideas()}/${idea.id}`, { name: '' })).status).toBe(400)
  })

  describe('the reading list (links to things to read)', () => {
    let idea: { id: string }
    const links = () => `${ideas()}/${idea.id}/links`
    const read = async () => (await (await ada.get(`${ideas()}/${idea.id}`)).json()).links
    const add = (url: string, title?: string) => ada.post(links(), title ? { url, title } : { url })

    beforeEach(async () => {
      idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
    })

    it('adds a link, assuming https, and shows the title found at the address', async () => {
      const res = await add('example.org/meanders')
      expect(res.status).toBe(201)
      expect((await res.json()).links).toEqual([
        {
          id: expect.any(String),
          url: 'https://example.org/meanders',
          title: 'Fake title for example.org',
          authors: [],
          tags: [],
          readAt: null,
          why: null,
          origin: 'entered',
          kept: false,
          addedAt: expect.any(String),
        },
      ])
      expect(ctx.pageFetcher.calls).toEqual(['https://example.org/meanders'])
    })

    it('keeps a link whose page has no title, with an empty title (the address is shown instead)', async () => {
      const res = await add('https://example.org/untitled')
      expect(res.status).toBe(201)
      expect((await res.json()).links[0].title).toBe('')
    })

    it('uses a title the person supplied rather than the fetched one', async () => {
      const link = (await (await add('https://example.org/a', '  My title ')).json()).links[0]
      expect(link.title).toBe('My title')
    })

    describe('marking items read', () => {
      it('marks an item read and unread again, answering with the whole idea', async () => {
        await add('https://example.org/a')
        await add('https://example.org/b')
        const [first, second] = await read()
        const readUrl = `${links()}/${first.id}/read`

        const marked = await ada.put(readUrl, { read: true })
        expect(marked.status).toBe(200)
        const idea = await marked.json()
        // Read items go last, so the one just read is now second.
        expect(idea.links[1]).toMatchObject({ id: first.id, readAt: expect.any(String) })
        expect(idea.links[0]).toMatchObject({ id: second.id, readAt: null }) // only that one

        const unmarked = await (await ada.put(readUrl, { read: false })).json()
        expect(unmarked.links[0]).toMatchObject({ id: first.id, readAt: null }) // and back in its place
      })

      it('lists unread items first and read ones last, each group in the order added', async () => {
        for (const name of ['a', 'b', 'c', 'd']) await add(`https://example.org/${name}`)
        const [a, b, c, d] = await read()
        const urls = async () => (await read()).map((l: { url: string }) => l.url.slice(-1))
        await ada.put(`${links()}/${b.id}/read`, { read: true })
        expect(await urls()).toEqual(['a', 'c', 'd', 'b'])
        await ada.put(`${links()}/${a.id}/read`, { read: true })
        expect(await urls()).toEqual(['c', 'd', 'a', 'b'])
        await ada.put(`${links()}/${b.id}/read`, { read: false })
        expect(await urls()).toEqual(['b', 'c', 'd', 'a'])
        void c
        void d
      })

      it('keeps the first date when it is marked read twice, and counts as a change to the idea', async () => {
        await add('https://example.org/a')
        const [item] = await read()
        const first = (await (await ada.put(`${links()}/${item.id}/read`, { read: true })).json())
          .links[0].readAt
        ctx.store.ideas.touch(idea.id, 'long ago')
        const again = await (await ada.put(`${links()}/${item.id}/read`, { read: true })).json()
        expect(again.links[0].readAt).toBe(first)
        expect(again.updatedAt).not.toBe('long ago')
      })

      it('refuses a bad body, an unknown item, and someone outside the publication', async () => {
        await add('https://example.org/a')
        const [item] = await read()
        expect((await ada.put(`${links()}/${item.id}/read`, { read: 'yes' })).status).toBe(400)
        expect((await ada.put(`${links()}/nope/read`, { read: true })).status).toBe(404)
        const eve = ctx.client()
        await register(eve, 'eve@example.com', 'Eve')
        expect((await eve.put(`${links()}/${item.id}/read`, { read: true })).status).toBe(404)
      })

      it('says where an item came from; those added by hand are "entered"', async () => {
        await add('https://example.org/a')
        ctx.store.ideas.addLink(idea.id, { url: 'https://example.org/b', title: 'B' }, 'brainstorm')
        expect((await read()).map((l: { origin: string }) => l.origin)).toEqual([
          'entered',
          'brainstorm',
        ])
      })
    })

    it('removes a link', async () => {
      await add('https://example.org/a')
      const [link] = await read()
      expect((await ada.delete(`${links()}/${link.id}`)).status).toBe(204)
      expect(await read()).toEqual([])
      expect((await ada.delete(`${links()}/nope`)).status).toBe(404)
    })

    describe('refuses text that is not a plausible web address', () => {
      it.each([
        'rubbish',
        'not a web address',
        '',
        'https://rubbish',
        'localhost',
        'javascript:alert(1)',
        'ftp://example.org/x',
        'https://user:pw@example.com/',
      ])('%j', async (url) => {
        const res = await add(url)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('Enter a web address, like https://example.com')
        expect(await read()).toEqual([])
        expect(ctx.pageFetcher.calls).toEqual([]) // never even looked up
      })
    })

    it('refuses an address whose site does not exist', async () => {
      const res = await add('https://nonexistent.example.org/')
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("couldn't find a website")
      expect(await read()).toEqual([])
    })

    it('refuses an address on a private network', async () => {
      const res = await add('https://private.example.org/')
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("isn't a public website")
      expect(await read()).toEqual([])
    })

    describe('duplicates', () => {
      it('refuses the same link twice, however it is written, without looking it up again', async () => {
        await add('https://example.org/a/b')
        ctx.pageFetcher.calls.length = 0
        for (const again of [
          'https://example.org/a/b',
          'example.org/a/b',
          'http://www.example.org/a/b/',
          'https://EXAMPLE.org/a/b#top',
        ]) {
          const res = await add(again)
          expect(res.status, again).toBe(409)
          expect((await res.json()).error).toBe('That link is already in this idea.')
        }
        expect(await read()).toHaveLength(1)
        expect(ctx.pageFetcher.calls).toEqual([])
      })

      it('allows different pages, and the same page in a different idea', async () => {
        await add('https://example.org/a')
        expect((await add('https://example.org/b')).status).toBe(201)
        const other = await (await ada.post(ideas(), { name: 'Tides' })).json()
        const res = await ada.post(`${ideas()}/${other.id}/links`, { url: 'https://example.org/a' })
        expect(res.status).toBe(201)
      })
    })

    describe('editing', () => {
      let link: { id: string; url: string; title: string }
      const edit = (body: object, id = link.id) => ada.patch(`${links()}/${id}`, body)

      beforeEach(async () => {
        await add('https://example.org/a')
        await add('https://example.org/b')
        link = (await read())[0]
      })

      it('changes the title alone without fetching anything', async () => {
        ctx.pageFetcher.calls.length = 0
        const res = await edit({ url: link.url, title: 'A better title' })
        expect(res.status).toBe(200)
        expect((await res.json()).links[0]).toEqual({ ...link, title: 'A better title' })
        expect(ctx.pageFetcher.calls).toEqual([])
      })

      it('fetches the title again when it is cleared', async () => {
        await edit({ url: link.url, title: 'Mine' })
        const res = await edit({ url: link.url, title: '' })
        expect((await res.json()).links[0].title).toBe('Fake title for example.org')
      })

      it('looks up the new address, and its title, when the address changes', async () => {
        const res = await edit({ url: 'https://example.com/c', title: link.title })
        expect((await res.json()).links[0]).toEqual({
          id: link.id,
          url: 'https://example.com/c',
          title: 'Fake title for example.com',
          authors: [],
          tags: [],
          readAt: null,
          why: null,
          origin: 'entered',
          kept: false,
          addedAt: expect.any(String),
        })
      })

      it('keeps it marked read', async () => {
        await ada.put(`${links()}/${link.id}/read`, { read: true })
        const saved = (
          await (await edit({ url: 'https://example.com/c', title: 'New' })).json()
        ).links.find((l: { id: string }) => l.id === link.id)
        expect(saved.readAt).toEqual(expect.any(String))
      })

      it('keeps a title the person typed when they change the address too', async () => {
        const res = await edit({ url: 'https://example.com/c', title: 'Chosen' })
        expect((await res.json()).links[0].title).toBe('Chosen')
      })

      it('holds the same checks as adding: syntax, existence and duplicates', async () => {
        expect((await edit({ url: 'rubbish', title: '' })).status).toBe(400)
        expect((await edit({ url: 'https://nonexistent.example.org', title: '' })).status).toBe(400)
        const dup = await edit({ url: 'www.example.org/b', title: '' })
        expect(dup.status).toBe(409)
        expect((await dup.json()).error).toBe('That link is already in this idea.')
        expect(await read()).toHaveLength(2)
        expect((await read())[0]).toEqual(link) // nothing changed
      })

      it('lets a link be saved as itself, or tidied (a trailing slash is not a duplicate of itself)', async () => {
        expect((await edit({ url: 'https://example.org/a/', title: 'Tidied' })).status).toBe(200)
      })

      it('answers 404 for a link that is not there', async () => {
        expect((await edit({ url: 'https://example.org/z', title: '' }, 'nope')).status).toBe(404)
      })

      it('does not reach another idea’s link', async () => {
        const other = await (await ada.post(ideas(), { name: 'Tides' })).json()
        const res = await ada.patch(`${ideas()}/${other.id}/links/${link.id}`, {
          url: 'https://example.org/q',
          title: '',
        })
        expect(res.status).toBe(404)
      })
    })

    it('caps how many an idea can hold', async () => {
      for (let i = 0; i < MAX_IDEA_LINKS; i++) {
        ctx.store.ideas.addLink(idea.id, { url: `https://example.org/${i}`, title: '' })
      }
      const res = await add('https://example.org/more')
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain(`up to ${MAX_IDEA_LINKS} links`)
    })

    it('slows down someone looking up a great many pages', async () => {
      let refused = 0
      for (let i = 0; i < 31; i++) {
        const res = await ada.post(links(), { url: `https://example.org/page-${i}` })
        if (res.status === 429) refused++
        else expect(res.status).toBe(i < MAX_IDEA_LINKS ? 201 : 409)
      }
      expect(refused).toBe(1)
    })

    it('is limited to members of the publication', async () => {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      expect((await bob.post(links(), { url: 'https://example.org/x' })).status).toBe(404)
      expect(ctx.pageFetcher.calls).toEqual([])
    })
  })

  describe('drafts', () => {
    it('are added to an idea in order, whether one post or a linked set', async () => {
      const idea = await (await ada.post(ideas(), { name: 'A series on rivers' })).json()
      const first = await (
        await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Part 1' })
      ).json()
      await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Part 2' })
      expect(first.ideaId).toBe(idea.id)

      const full = await (await ada.get(`${ideas()}/${idea.id}`)).json()
      expect(full.drafts.map((d: { title: string }) => d.title)).toEqual(['Part 1', 'Part 2'])
      expect((await (await ada.get(ideas())).json())[0].draftCount).toBe(2)
    })

    it('count as drafts only until they are marked published, though the idea still lists them', async () => {
      const idea = await (await ada.post(ideas(), { name: 'A series on rivers' })).json()
      const first = await (
        await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Part 1' })
      ).json()
      await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Part 2' })
      const draftCount = async () => (await (await ada.get(ideas())).json())[0].draftCount
      await ada.put(`/api/publications/${publication}/drafts/${first.id}/published`, {
        published: true,
      })
      expect(await draftCount()).toBe(1)
      expect((await (await ada.get(`${ideas()}/${idea.id}`)).json()).drafts).toHaveLength(2)
    })

    it('say who edits each, so a list of drafts with different editors can show it', async () => {
      const idea = await (await ada.post(ideas(), { name: 'A series' })).json()
      const draft = await (
        await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Part 1' })
      ).json()
      const full = await (await ada.get(`${ideas()}/${idea.id}`)).json()
      expect(full.drafts).toMatchObject([
        { id: draft.id, editorId: draft.editorId, editorName: 'Ada' },
      ])
    })

    it('can be opened and edited like any other draft', async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      const draft = await (await ada.post(`${ideas()}/${idea.id}/drafts`, {})).json()
      const saved = await ada.put(`/api/publications/${publication}/drafts/${draft.id}`, {
        title: 'Why rivers meander',
        body: 'Text',
        version: draft.version,
      })
      expect((await saved.json()).ideaId).toBe(idea.id)
    })

    describe('reordering', () => {
      const titles = (idea: { drafts: { title: string }[] }) => idea.drafts.map((d) => d.title)
      async function ideaWithDrafts(...names: string[]) {
        const idea = await (await ada.post(ideas(), { name: 'A series' })).json()
        const ids: string[] = []
        for (const title of names) {
          ids.push((await (await ada.post(`${ideas()}/${idea.id}/drafts`, { title })).json()).id)
        }
        return { idea, ids }
      }

      it('puts the drafts in the order given, answers with the idea, and keeps it', async () => {
        const { idea, ids } = await ideaWithDrafts('One', 'Two', 'Three')
        const res = await ada.put(`${ideas()}/${idea.id}/drafts/order`, {
          ids: [ids[2], ids[0], ids[1]],
        })
        expect(res.status).toBe(200)
        expect(titles(await res.json())).toEqual(['Three', 'One', 'Two'])
        expect(titles(await (await ada.get(`${ideas()}/${idea.id}`)).json())).toEqual([
          'Three',
          'One',
          'Two',
        ])
      })

      it('puts a draft added afterwards at the end', async () => {
        const { idea, ids } = await ideaWithDrafts('One', 'Two')
        await ada.put(`${ideas()}/${idea.id}/drafts/order`, { ids: [ids[1], ids[0]] })
        await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Three' })
        expect(titles(await (await ada.get(`${ideas()}/${idea.id}`)).json())).toEqual([
          'Two',
          'One',
          'Three',
        ])
      })

      it('counts as a change to the idea', async () => {
        const { idea, ids } = await ideaWithDrafts('One', 'Two')
        const before = (await (await ada.get(`${ideas()}/${idea.id}`)).json()).updatedAt
        await new Promise((r) => setTimeout(r, 5))
        const saved = await (
          await ada.put(`${ideas()}/${idea.id}/drafts/order`, { ids: [ids[1], ids[0]] })
        ).json()
        expect(saved.updatedAt > before).toBe(true)
      })

      it('refuses an out-of-date order, changing nothing', async () => {
        const { idea, ids } = await ideaWithDrafts('One', 'Two')
        const elsewhere = await (await ada.post(ideas(), { name: 'Elsewhere' })).json()
        const foreign = (
          await (await ada.post(`${ideas()}/${elsewhere.id}/drafts`, { title: 'Not here' })).json()
        ).id
        for (const bad of [
          [ids[0]], // one missing
          [ids[0], ids[1], 'extra'], // one unknown
          [ids[0], ids[0]], // a repeat
          [ids[0], foreign], // a draft of another idea
          [],
        ]) {
          const res = await ada.put(`${ideas()}/${idea.id}/drafts/order`, { ids: bad })
          expect(res.status, JSON.stringify(bad)).toBe(409)
        }
        expect((await ada.put(`${ideas()}/${idea.id}/drafts/order`, { ids: 'a' })).status).toBe(400)
        expect(titles(await (await ada.get(`${ideas()}/${idea.id}`)).json())).toEqual([
          'One',
          'Two',
        ])
        expect(titles(await (await ada.get(`${ideas()}/${elsewhere.id}`)).json())).toEqual([
          'Not here',
        ])
      })

      it('is open to members only, and 404s for an idea that is not in the publication', async () => {
        const { idea, ids } = await ideaWithDrafts('One', 'Two')
        const outsider = ctx.client()
        await register(outsider, 'eve@example.com', 'Eve')
        const url = `/api/publications/${publication}/ideas/${idea.id}/drafts/order`
        expect((await outsider.put(url, { ids })).status).toBe(404)
        expect((await ctx.client().put(url, { ids })).status).toBe(401)
        expect((await ada.put(`${ideas()}/nope/drafts/order`, { ids })).status).toBe(404)
      })
    })

    it('cannot be started without an idea', async () => {
      const res = await ada.post(`/api/publications/${publication}/drafts`, { title: 'Alone' })
      expect(res.status).toBe(404)
      expect((await ada.get(`/api/publications/${publication}/drafts`)).status).toBe(404)
    })
  })

  it('deleting an idea deletes its links and drafts, and nothing else', async () => {
    const idea = await (await ada.post(ideas(), { name: 'Doomed' })).json()
    const other = await (await ada.post(ideas(), { name: 'Safe' })).json()
    await ada.post(`${ideas()}/${idea.id}/links`, { url: 'https://example.org' })
    const draft = await (await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Gone' })).json()
    const kept = await (await ada.post(`${ideas()}/${other.id}/drafts`, { title: 'Kept' })).json()

    expect((await ada.delete(`${ideas()}/${idea.id}`)).status).toBe(204)
    expect((await ada.get(`${ideas()}/${idea.id}`)).status).toBe(404)
    expect((await ada.get(`/api/publications/${publication}/drafts/${draft.id}`)).status).toBe(404)
    expect((await ada.get(`/api/publications/${publication}/drafts/${kept.id}`)).status).toBe(200)
    expect(ctx.store.ideas.countLinks(idea.id)).toBe(0)
  })

  describe('access', () => {
    it('is limited to members of the publication', async () => {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      const idea = await (await ada.post(ideas(), { name: 'Private' })).json()
      expect((await bob.get(ideas())).status).toBe(404)
      expect((await bob.get(`${ideas()}/${idea.id}`)).status).toBe(404)
      expect((await bob.post(ideas(), { name: 'x' })).status).toBe(404)
      expect((await bob.delete(`${ideas()}/${idea.id}`)).status).toBe(404)
      expect((await ctx.client().get(ideas())).status).toBe(401)
    })

    it("does not reach an idea through a different publication's address", async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      const second = await (await ada.post('/api/publications', { name: 'Second' })).json()
      const via = `/api/publications/${second.id}/ideas/${idea.id}`
      expect((await ada.get(via)).status).toBe(404)
      expect((await ada.patch(via, { name: 'x' })).status).toBe(404)
      expect((await ada.post(`${via}/drafts`, {})).status).toBe(404)
      expect((await ada.post(`${via}/links`, { url: 'https://example.org' })).status).toBe(404)
    })

    it('lets people a publication is shared with work on its ideas', async () => {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      verifyAccounts(ctx, 'ada@example.com')
      await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
      const idea = await (await bob.post(ideas(), { name: 'Bob had this' })).json()
      expect((await ada.patch(`${ideas()}/${idea.id}`, { notes: 'Ada adds' })).status).toBe(200)
      expect((await bob.get(`${ideas()}/${idea.id}`)).status).toBe(200)
    })
  })
})
