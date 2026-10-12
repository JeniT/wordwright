import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from './db/database'
import { register, setup } from './test-helpers'

type Link = { id: string; url: string; title: string; tags: string[] }

/** A profile with an idea, as Ada. */
async function start() {
  const ctx = setup()
  const ada = ctx.client()
  await register(ada, 'ada@example.com', 'Ada')
  const profile = (await (await ada.get('/api/profiles')).json())[0].id as string
  const api = `/api/profiles/${profile}`
  const idea = (await (await ada.post(`${api}/ideas`, { name: 'Rivers' })).json()).id as string
  return { ctx, ada, profile, api, idea }
}

describe('tags on the profile’s reading list', () => {
  let s: Awaited<ReturnType<typeof start>>
  let item: Link
  const tag = (id: string, tags: unknown) => s.ada.put(`${s.api}/reading/${id}/tags`, { tags })
  const list = async (): Promise<Link[]> => (await s.ada.get(`${s.api}/reading`)).json()
  beforeEach(async () => {
    s = await start()
    item = (await (await s.ada.post(`${s.api}/reading`, { url: 'https://a.example/p' })).json())[0]
  })

  it('starts with none, sets them as a whole, and answers with the list', async () => {
    expect(item.tags).toEqual([])
    const res = await tag(item.id, [' Background ', 'part  2', 'background'])
    expect(res.status).toBe(200)
    expect(((await res.json()) as Link[])[0]!.tags).toEqual(['Background', 'part 2']) // tidied; one "background"
    expect((await list())[0]!.tags).toEqual(['Background', 'part 2'])
    expect(((await (await tag(item.id, ['part 2'])).json()) as Link[])[0]!.tags).toEqual(['part 2']) // replaced
    expect(((await (await tag(item.id, [])).json()) as Link[])[0]!.tags).toEqual([])
  })

  it('says what is wrong with an empty or oversized tag, or too many, and saves nothing', async () => {
    await tag(item.id, ['keep'])
    for (const [tags, message] of [
      [[''], 'A tag needs a word or two'],
      [['x'.repeat(41)], 'Use 40 characters or fewer in a tag'],
      [Array.from({ length: 11 }, (_, i) => `t${i}`), 'Use 10 tags or fewer on a note'],
    ] as const) {
      const res = await tag(item.id, tags)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe(message)
    }
    expect((await list())[0]!.tags).toEqual(['keep'])
  })

  it('belongs to an item on this list: not another list’s, not a missing one, not a stranger’s', async () => {
    expect((await tag('nope', ['a'])).status).toBe(404)
    const onIdea = (
      await (
        await s.ada.post(`${s.api}/ideas/${s.idea}/links`, { url: 'https://b.example/p' })
      ).json()
    ).links[0] as Link
    expect((await tag(onIdea.id, ['a'])).status).toBe(404) // an idea's item, through the profile's list
    const eve = s.ctx.client()
    await register(eve, 'eve@example.com', 'Eve')
    expect((await eve.put(`${s.api}/reading/${item.id}/tags`, { tags: ['x'] })).status).toBe(404)
  })
})

describe('tags on an idea’s reading list', () => {
  let s: Awaited<ReturnType<typeof start>>
  let item: Link
  const url = (id: string) => `${s.api}/ideas/${s.idea}/links/${id}/tags`
  const idea = async () => (await s.ada.get(`${s.api}/ideas/${s.idea}`)).json()
  beforeEach(async () => {
    s = await start()
    item = (
      await (
        await s.ada.post(`${s.api}/ideas/${s.idea}/links`, { url: 'https://a.example/p' })
      ).json()
    ).links[0]
  })

  it('shows them on the idea, in the order given, and counts as a change to the idea', async () => {
    s.ctx.store.ideas.touch(s.idea, 'long ago')
    const res = await s.ada.put(url(item.id), { tags: ['Second', 'first'] })
    expect(res.status).toBe(200)
    expect((await res.json()).links[0].tags).toEqual(['Second', 'first'])
    expect((await idea()).links[0].tags).toEqual(['Second', 'first'])
    expect((await idea()).updatedAt).not.toBe('long ago')
    expect((await s.ada.put(url(item.id), { tags: [] })).status).toBe(200)
    expect((await idea()).links[0].tags).toEqual([])
  })

  it('refuses a missing item and an item of another idea, and bad tags', async () => {
    expect((await s.ada.put(url('nope'), { tags: ['a'] })).status).toBe(404)
    const other = (await (await s.ada.post(`${s.api}/ideas`, { name: 'Other' })).json()).id
    expect(
      (await s.ada.put(`${s.api}/ideas/${other}/links/${item.id}/tags`, { tags: ['a'] })).status,
    ).toBe(404)
    expect((await s.ada.put(url(item.id), { tags: [''] })).status).toBe(400)
  })
})

describe('tagging several reading items at once', () => {
  let s: Awaited<ReturnType<typeof start>>
  const add = async (path: string, url: string): Promise<Link> => {
    const res = await (await s.ada.post(path, { url, title: url.replace('https://', '') })).json()
    return (Array.isArray(res) ? res : res.links).find((l: Link) => l.url === url)
  }
  beforeEach(async () => {
    s = await start()
  })

  for (const kind of ['profile', 'idea'] as const) {
    describe(`on the ${kind}'s list`, () => {
      const base = () =>
        kind === 'profile' ? `${s.api}/reading` : `${s.api}/ideas/${s.idea}/links`
      const bulk = (body: object) => s.ada.post(`${base()}/tags`, body)
      const tagsOf = async (): Promise<string[][]> => {
        const res = await (
          await s.ada.get(kind === 'profile' ? `${s.api}/reading` : `${s.api}/ideas/${s.idea}`)
        ).json()
        return (Array.isArray(res) ? res : res.links).map((l: Link) => l.tags)
      }

      it('adds tags to every chosen item, keeping what they have and ignoring repeats', async () => {
        const [a, b, c] = [
          await add(base(), 'https://a.example/p'),
          await add(base(), 'https://b.example/p'),
          await add(base(), 'https://c.example/p'),
        ]
        await s.ada.put(`${base()}/${a.id}/tags`, { tags: ['Intro'] })
        const res = await bulk({ ids: [a.id, b.id], add: ['intro', ' part  2 ', 'Part 2'] })
        expect(res.status).toBe(200)
        expect(await tagsOf()).toEqual([['Intro', 'part 2'], ['intro', 'part 2'], []])
        expect(c.id).toBeTruthy()
      })

      it('takes tags away, ignoring case, adding and removing in one request', async () => {
        const [a, b] = [
          await add(base(), 'https://a.example/p'),
          await add(base(), 'https://b.example/p'),
        ]
        await s.ada.put(`${base()}/${a.id}/tags`, { tags: ['One', 'Two'] })
        await s.ada.put(`${base()}/${b.id}/tags`, { tags: ['two', 'three'] })
        await bulk({ ids: [a.id, b.id], remove: ['TWO'], add: ['four'] })
        expect(await tagsOf()).toEqual([
          ['One', 'four'],
          ['three', 'four'],
        ])
      })

      it('asks for something to do and for items to do it to', async () => {
        const a = await add(base(), 'https://a.example/p')
        const nothing = await bulk({ ids: [a.id], add: [], remove: [] })
        expect(nothing.status).toBe(400)
        expect((await nothing.json()).error).toBe('Give a tag to add or to remove')
        expect((await bulk({ ids: [], add: ['x'] })).status).toBe(400)
        expect((await bulk({ ids: [a.id], add: ['x'.repeat(41)] })).status).toBe(400)
      })

      it('changes nothing at all if one item would have too many tags, and names it', async () => {
        const [a, b] = [
          await add(base(), 'https://a.example/p'),
          await add(base(), 'https://b.example/p'),
        ]
        await s.ada.put(`${base()}/${b.id}/tags`, {
          tags: Array.from({ length: 10 }, (_, i) => `t${i}`),
        })
        const res = await bulk({ ids: [a.id, b.id], add: ['one more'] })
        expect(res.status).toBe(409)
        expect((await res.json()).error).toMatch(
          /A link can have up to 10 tags, and “b\.example\/p” would have 11/,
        )
        expect((await tagsOf())[0]).toEqual([]) // the first was not tagged either
      })

      it('says 404 for items that are not on this list, and refuses strangers', async () => {
        const a = await add(base(), 'https://a.example/p')
        expect((await bulk({ ids: [a.id, 'nope'], add: ['x'] })).status).toBe(404)
        const eve = s.ctx.client()
        await register(eve, 'eve@example.com', 'Eve')
        expect((await eve.post(`${base()}/tags`, { ids: [a.id], add: ['x'] })).status).toBe(404)
        // The other list's item is not this list's.
        const elsewhere = await add(
          kind === 'profile' ? `${s.api}/ideas/${s.idea}/links` : `${s.api}/reading`,
          'https://z.example/p',
        )
        expect((await bulk({ ids: [elsewhere.id], add: ['x'] })).status).toBe(404)
      })
    })
  }

  it('counts as a change to the idea', async () => {
    const base = `${s.api}/ideas/${s.idea}/links`
    const a = await add(base, 'https://a.example/p')
    s.ctx.store.ideas.touch(s.idea, 'long ago')
    await s.ada.post(`${base}/tags`, { ids: [a.id], add: ['y'] })
    expect(s.ctx.store.ideas.get(s.profile, s.idea)!.updatedAt).not.toBe('long ago')
  })
})

describe('tags when reading items move', () => {
  let s: Awaited<ReturnType<typeof start>>
  const move = (ids: string[], ideaId: string | null) =>
    s.ada.post(`${s.api}/move/reading`, { ids, to: { ideaId } })
  beforeEach(async () => {
    s = await start()
  })

  it('go with an item to an idea and back', async () => {
    const item = (
      await (await s.ada.post(`${s.api}/reading`, { url: 'https://a.example/p' })).json()
    )[0] as Link
    await s.ada.put(`${s.api}/reading/${item.id}/tags`, { tags: ['one', 'two'] })
    await move([item.id], s.idea)
    expect(
      ((await (await s.ada.get(`${s.api}/ideas/${s.idea}`)).json()).links as Link[])[0]!.tags,
    ).toEqual(['one', 'two'])
    await move([item.id], null)
    expect(((await (await s.ada.get(`${s.api}/reading`)).json()) as Link[])[0]!.tags).toEqual([
      'one',
      'two',
    ])
  })

  it('are added to those of the item already there when two become one', async () => {
    const there = (
      await (
        await s.ada.post(`${s.api}/ideas/${s.idea}/links`, { url: 'https://a.example/p' })
      ).json()
    ).links[0] as Link
    await s.ada.put(`${s.api}/ideas/${s.idea}/links/${there.id}/tags`, { tags: ['One', 'shared'] })
    const mine = (
      await (await s.ada.post(`${s.api}/reading`, { url: 'https://a.example/p#frag' })).json()
    )[0] as Link
    await s.ada.put(`${s.api}/reading/${mine.id}/tags`, { tags: ['ONE', 'extra'] })
    await move([mine.id], s.idea)
    const links = (await (await s.ada.get(`${s.api}/ideas/${s.idea}`)).json()).links as Link[]
    expect(links.map((l) => l.id)).toEqual([there.id])
    expect(links[0]!.tags).toEqual(['One', 'shared', 'extra']) // "ONE" was already there
  })

  it('stay at the limit when joining, rather than refusing the move', async () => {
    const full = Array.from({ length: 9 }, (_, i) => `t${i}`)
    const there = (
      await (
        await s.ada.post(`${s.api}/ideas/${s.idea}/links`, { url: 'https://a.example/p' })
      ).json()
    ).links[0] as Link
    await s.ada.put(`${s.api}/ideas/${s.idea}/links/${there.id}/tags`, { tags: full })
    const mine = (
      await (await s.ada.post(`${s.api}/reading`, { url: 'https://a.example/p#frag' })).json()
    )[0] as Link
    await s.ada.put(`${s.api}/reading/${mine.id}/tags`, { tags: ['a', 'b'] })
    expect((await move([mine.id], s.idea)).status).toBe(200)
    const tags = ((await (await s.ada.get(`${s.api}/ideas/${s.idea}`)).json()).links as Link[])[0]!
      .tags
    expect(tags).toEqual([...full, 'a'])
  })

  it('are not copied with the source item that a moved note takes along', async () => {
    const item = (
      await (await s.ada.post(`${s.api}/reading`, { url: 'https://a.example/p' })).json()
    )[0] as Link
    await s.ada.put(`${s.api}/reading/${item.id}/tags`, { tags: ['profile only'] })
    const note = await (
      await s.ada.post(`${s.api}/notes`, { text: 'About it', readingItemId: item.id })
    ).json()
    await s.ada.post(`${s.api}/move/notes`, { ids: [note.id], to: { ideaId: s.idea } })
    const copy = ((await (await s.ada.get(`${s.api}/ideas/${s.idea}`)).json()).links as Link[])[0]!
    expect(copy.url).toBe('https://a.example/p')
    expect(copy.tags).toEqual([])
    expect(((await (await s.ada.get(`${s.api}/reading`)).json()) as Link[])[0]!.tags).toEqual([
      'profile only',
    ])
  })
})

describe('the reading-item tags table', () => {
  it('goes with its item, whatever removes it, and treats a tag as one whatever its case', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db, 'test')
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO ideas (id, profile_id, name, notes, created_at, updated_at) VALUES ('i', 'p', 'I', '', 't', 't');
      INSERT INTO idea_links (id, profile_id, idea_id, url, title, created_at) VALUES ('l', 'p', 'i', 'https://x.example', 'X', 't');
      INSERT INTO idea_link_tags (link_id, tag) VALUES ('l', 'Intro');
    `)
    expect(() =>
      db.exec("INSERT INTO idea_link_tags (link_id, tag) VALUES ('l', 'intro')"),
    ).toThrow()
    // Deleting the idea (which deletes its items) leaves no tags behind, and neither does deleting the profile.
    db.exec("DELETE FROM ideas WHERE id = 'i'")
    expect(db.prepare('SELECT count(*) AS n FROM idea_link_tags').get()).toEqual({ n: 0 })
    db.exec(`
      INSERT INTO idea_links (id, profile_id, idea_id, url, title, created_at) VALUES ('m', 'p', NULL, 'https://y.example', 'Y', 't');
      INSERT INTO idea_link_tags (link_id, tag) VALUES ('m', 'Own');
      DELETE FROM profiles WHERE id = 'p';
    `)
    expect(db.prepare('SELECT count(*) AS n FROM idea_link_tags').get()).toEqual({ n: 0 })
  })
})
