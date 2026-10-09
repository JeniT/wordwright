import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_IDEA_LINKS } from '@lfwa/core'
import { MIGRATIONS, migrate } from './db/database'
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
      notes: 'Erosion loops.',
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
    expect(renamed).toMatchObject({ name: 'New', notes: 'Keep me' })
    const rewritten = await (await ada.patch(`${ideas()}/${idea.id}`, { notes: 'Changed' })).json()
    expect(rewritten).toMatchObject({ name: 'New', notes: 'Changed' })
    expect((await ada.patch(`${ideas()}/${idea.id}`, { name: '' })).status).toBe(400)
  })

  describe('links to related work', () => {
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
        })
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

describe('wrapping existing drafts in ideas', () => {
  it('gives every draft from before its own idea, named after it, and leaves ideas alone', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db, 'test', MIGRATIONS.slice(0, -1))
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
