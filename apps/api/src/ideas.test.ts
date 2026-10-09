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
    it('adds links, assuming https, and removes them', async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      const res = await ada.post(`${ideas()}/${idea.id}/links`, {
        url: 'example.org/meanders',
        title: ' A paper ',
      })
      expect(res.status).toBe(201)
      const withLink = await res.json()
      expect(withLink.links).toEqual([
        { id: expect.any(String), url: 'https://example.org/meanders', title: 'A paper' },
      ])

      await ada.post(`${ideas()}/${idea.id}/links`, { url: 'https://example.org/second' })
      const two = await (await ada.get(`${ideas()}/${idea.id}`)).json()
      expect(two.links.map((l: { url: string }) => l.url)).toEqual([
        'https://example.org/meanders',
        'https://example.org/second',
      ])
      expect(two.links[1].title).toBe('')

      const gone = await ada.delete(`${ideas()}/${idea.id}/links/${withLink.links[0].id}`)
      expect(gone.status).toBe(204)
      const one = await (await ada.get(`${ideas()}/${idea.id}`)).json()
      expect(one.links).toHaveLength(1)
      expect((await ada.delete(`${ideas()}/${idea.id}/links/nope`)).status).toBe(404)
    })

    it('accepts only web addresses', async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      for (const url of ['javascript:alert(1)', 'not a link', 'ftp://example.org/x', '']) {
        const res = await ada.post(`${ideas()}/${idea.id}/links`, { url })
        expect(res.status, url).toBe(400)
        expect((await res.json()).error).toEqual(expect.any(String))
      }
    })

    it('caps how many an idea can hold', async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      for (let i = 0; i < MAX_IDEA_LINKS; i++) {
        ctx.store.ideas.addLink(idea.id, { url: `https://example.org/${i}`, title: '' })
      }
      const res = await ada.post(`${ideas()}/${idea.id}/links`, { url: 'https://example.org/more' })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain(`up to ${MAX_IDEA_LINKS} links`)
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

    it("stay out of the profile's own list of drafts", async () => {
      const idea = await (await ada.post(ideas(), { name: 'Rivers' })).json()
      await ada.post(`${ideas()}/${idea.id}/drafts`, { title: 'Inside' })
      await ada.post(`/api/profiles/${profile}/drafts`, { title: 'Alone' })
      const standalone = await (await ada.get(`/api/profiles/${profile}/drafts`)).json()
      expect(standalone.map((d: { title: string }) => d.title)).toEqual(['Alone'])
      expect(standalone[0].ideaId).toBeNull()
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

describe('the ideas migration', () => {
  it('leaves drafts that already exist as standalone drafts', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db, 'test', MIGRATIONS.slice(0, -1))
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO drafts (id, profile_id, title, body, created_at, updated_at)
        VALUES ('d', 'p', 'Old draft', 'text', 'now', 'now');
    `)
    migrate(db, 'test')
    expect(db.prepare('SELECT idea_id, title FROM drafts').all()).toEqual([
      expect.objectContaining({ idea_id: null, title: 'Old draft' }),
    ])
  })
})
