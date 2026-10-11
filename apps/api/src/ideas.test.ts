import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_IDEA_LINKS } from '@lfwa/core'
import { MIGRATIONS, migrate, wrapStandaloneDraftsInIdeas } from './db/database'
import { register, setup, shareProfile, verifyAccounts, type TestClient } from './test-helpers'

describe('ideas', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let profile: string
  const ideas = () => `/api/profiles/${profile}/ideas`

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    profile = (await (await ada.get('/api/profiles')).json())[0].id
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
      profileId: profile,
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

      it('refuses a bad body, an unknown item, and someone outside the profile', async () => {
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

    it('is limited to members of the profile', async () => {
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

    it('can be opened and edited like any other draft', async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      const draft = await (await ada.post(`${ideas()}/${idea.id}/drafts`, {})).json()
      const saved = await ada.put(`/api/profiles/${profile}/drafts/${draft.id}`, {
        title: 'Why rivers meander',
        body: 'Text',
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

      it('is open to members only, and 404s for an idea that is not in the profile', async () => {
        const { idea, ids } = await ideaWithDrafts('One', 'Two')
        const outsider = ctx.client()
        await register(outsider, 'eve@example.com', 'Eve')
        const url = `/api/profiles/${profile}/ideas/${idea.id}/drafts/order`
        expect((await outsider.put(url, { ids })).status).toBe(404)
        expect((await ctx.client().put(url, { ids })).status).toBe(401)
        expect((await ada.put(`${ideas()}/nope/drafts/order`, { ids })).status).toBe(404)
      })
    })

    it('cannot be started without an idea', async () => {
      const res = await ada.post(`/api/profiles/${profile}/drafts`, { title: 'Alone' })
      expect(res.status).toBe(404)
      expect((await ada.get(`/api/profiles/${profile}/drafts`)).status).toBe(404)
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
    expect((await ada.get(`/api/profiles/${profile}/drafts/${draft.id}`)).status).toBe(404)
    expect((await ada.get(`/api/profiles/${profile}/drafts/${kept.id}`)).status).toBe(200)
    expect(ctx.store.ideas.countLinks(idea.id)).toBe(0)
  })

  describe('access', () => {
    it('is limited to members of the profile', async () => {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      const idea = await (await ada.post(ideas(), { name: 'Private' })).json()
      expect((await bob.get(ideas())).status).toBe(404)
      expect((await bob.get(`${ideas()}/${idea.id}`)).status).toBe(404)
      expect((await bob.post(ideas(), { name: 'x' })).status).toBe(404)
      expect((await bob.delete(`${ideas()}/${idea.id}`)).status).toBe(404)
      expect((await ctx.client().get(ideas())).status).toBe(401)
    })

    it("does not reach an idea through a different profile's address", async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      const second = await (await ada.post('/api/profiles', { name: 'Second' })).json()
      const via = `/api/profiles/${second.id}/ideas/${idea.id}`
      expect((await ada.get(via)).status).toBe(404)
      expect((await ada.patch(via, { name: 'x' })).status).toBe(404)
      expect((await ada.post(`${via}/drafts`, {})).status).toBe(404)
      expect((await ada.post(`${via}/links`, { url: 'https://example.org' })).status).toBe(404)
    })

    it('lets people a profile is shared with work on its ideas', async () => {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      verifyAccounts(ctx, 'ada@example.com')
      await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
      const idea = await (await bob.post(ideas(), { name: 'Bob had this' })).json()
      expect((await ada.patch(`${ideas()}/${idea.id}`, { notes: 'Ada adds' })).status).toBe(200)
      expect((await bob.get(`${ideas()}/${idea.id}`)).status).toBe(200)
    })
  })
})

describe('numbering existing drafts', () => {
  it('starts each idea’s drafts in the order they were created', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    const at = MIGRATIONS.findIndex(
      (m) => typeof m === 'string' && m.includes('ALTER TABLE drafts ADD COLUMN position'),
    )
    expect(at).toBeGreaterThan(0)
    migrate(db, 'test', MIGRATIONS.slice(0, at))
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO ideas (id, profile_id, name, notes, created_at, updated_at)
        VALUES ('i1', 'p', 'One', '', 't', 't'), ('i2', 'p', 'Two', '', 't', 't');
      INSERT INTO drafts (id, profile_id, idea_id, title, body, created_at, updated_at)
        VALUES ('b', 'p', 'i1', '', '', '2026-01-02', 't'),
               ('a', 'p', 'i1', '', '', '2026-01-01', 't'),
               ('c', 'p', 'i1', '', '', '2026-01-03', 't'),
               ('x', 'p', 'i2', '', '', '2026-01-05', 't'),
               ('tie1', 'p', 'i2', '', '', '2026-01-06', 't'),
               ('tie2', 'p', 'i2', '', '', '2026-01-06', 't');
    `)
    migrate(db, 'test')
    const order = (idea: string) =>
      (
        db
          .prepare('SELECT id FROM drafts WHERE idea_id = ? ORDER BY position, rowid')
          .all(idea) as { id: string }[]
      ).map((r) => r.id)
    expect(order('i1')).toEqual(['a', 'b', 'c'])
    expect(order('i2')).toEqual(['x', 'tie1', 'tie2'])
    expect(db.prepare("SELECT position FROM drafts WHERE id = 'c'").get()).toEqual({ position: 2 })
    expect(db.prepare("SELECT position FROM drafts WHERE id = 'tie2'").get()).toEqual({
      position: 2,
    })
  })
})

describe('the reading list columns', () => {
  it('give links already saved no read date and the origin "entered", and notes no source', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    const at = MIGRATIONS.findIndex(
      (m) => typeof m === 'string' && m.includes('ADD COLUMN read_at TEXT'),
    )
    expect(at).toBeGreaterThan(0)
    migrate(db, 'test', MIGRATIONS.slice(0, at))
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO ideas (id, profile_id, name, notes, created_at, updated_at)
        VALUES ('i', 'p', 'Idea', 'A note', 'then', 'then');
      INSERT INTO idea_links (id, idea_id, url, title, created_at)
        VALUES ('l', 'i', 'https://example.org', 'Old link', 'then');
      INSERT INTO idea_notes (id, profile_id, idea_id, text, origin, position, created_at, updated_at)
        VALUES ('n', 'p', 'i', 'A note', 'entered', 0, 'then', 'then');
    `)
    migrate(db, 'test')
    expect(db.prepare('SELECT read_at, origin FROM idea_links').get()).toEqual({
      read_at: null,
      origin: 'entered',
    })
    expect(db.prepare('SELECT reading_item_id FROM idea_notes').get()).toEqual({
      reading_item_id: null,
    })
    // An origin nobody has heard of is refused.
    expect(() => db.exec("UPDATE idea_links SET origin = 'made-up'")).toThrow()
  })
})

describe('wrapping existing drafts in ideas', () => {
  it('gives every draft from before its own idea, named after it, and leaves ideas alone', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    // Everything before the migration under test, so later migrations don't change what this proves.
    migrate(db, 'test', MIGRATIONS.slice(0, MIGRATIONS.indexOf(wrapStandaloneDraftsInIdeas)))
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO ideas (id, profile_id, name, notes, created_at, updated_at)
        VALUES ('i', 'p', 'Existing idea', '', 'then', 'then');
      INSERT INTO drafts (id, profile_id, title, body, created_at, updated_at)
        VALUES ('d1', 'p', '  Old draft ', 'text', 'a', 'b'),
               ('d2', 'p', '', 'text', 'c', 'd');
      INSERT INTO drafts (id, profile_id, idea_id, title, body, created_at, updated_at)
        VALUES ('d3', 'p', 'i', 'Already in an idea', '', 'e', 'f');
    `)
    migrate(db, 'test')

    const rows = db
      .prepare(
        `SELECT d.id AS draft, d.idea_id, i.name, i.created_at, i.updated_at
         FROM drafts d JOIN ideas i ON i.id = d.idea_id ORDER BY d.id`,
      )
      .all()
    expect(rows).toHaveLength(3) // none left without an idea
    expect(rows[0]).toMatchObject({ name: 'Old draft', created_at: 'a', updated_at: 'b' })
    expect(rows[1]).toMatchObject({ name: 'Untitled idea' })
    expect(rows[2]).toMatchObject({ idea_id: 'i', name: 'Existing idea' })
    expect(rows[0]!.idea_id).not.toBe(rows[1]!.idea_id)
    expect(db.prepare('SELECT count(*) AS n FROM ideas').get()).toEqual({ n: 3 })
  })
})
