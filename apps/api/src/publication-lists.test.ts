import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFeedFetcher, MAX_IDEA_LINKS, MAX_IDEA_NOTES } from '@wordwright/core'
import { register, setup, sharePublication, verifyAccounts } from './test-helpers'

type Link = {
  id: string
  url: string
  title: string
  readAt: string | null
  authors: string[]
  kept?: boolean
  addedAt?: string
}
type Note = {
  id: string
  text: string
  readingItemId: string | null
  tags: string[]
  addedAt: string | null
}

/** A publication with an idea, as Ada; Bob can be added as a member. */
async function start(feeds?: FakeFeedFetcher) {
  const ctx = setup(feeds ? { feeds } : {})
  const ada = ctx.client()
  await register(ada, 'ada@example.com', 'Ada')
  const publication = (await (await ada.get('/api/publications')).json())[0].id as string
  const api = `/api/publications/${publication}`
  const newIdea = async (name = 'Rivers') =>
    (await (await ada.post(`${api}/ideas`, { name })).json()).id as string
  return {
    ctx,
    ada,
    publication,
    api,
    newIdea,
    // the publication's own lists
    reading: () => `${api}/reading`,
    notes: () => `${api}/notes`,
    // an idea's lists
    ideaLinks: (idea: string) => `${api}/ideas/${idea}/links`,
    ideaNotes: (idea: string) => `${api}/ideas/${idea}/notes`,
    links: async (idea?: string): Promise<Link[]> =>
      idea
        ? (await (await ada.get(`${api}/ideas/${idea}`)).json()).links
        : (await ada.get(`${api}/reading`)).json(),
    noteList: async (idea?: string): Promise<Note[]> =>
      (await ada.get(idea ? `${api}/ideas/${idea}/notes` : `${api}/notes`)).json(),
  }
}

describe('the publication’s own articles', () => {
  let s: Awaited<ReturnType<typeof start>>
  beforeEach(async () => {
    s = await start()
  })

  it('starts empty, adds items (looking the title up), and keeps them apart from every idea’s', async () => {
    const idea = await s.newIdea()
    expect(await s.links()).toEqual([])
    const added = await s.ada.post(s.reading(), { url: 'https://a.example/post' })
    expect(added.status).toBe(201)
    expect(await added.json()).toEqual([
      expect.objectContaining({
        url: 'https://a.example/post',
        title: 'Fake title for a.example',
        origin: 'entered',
        readAt: null,
      }),
    ])
    await s.ada.post(s.ideaLinks(idea), { url: 'https://b.example/post' })
    expect((await s.links()).map((l) => l.url)).toEqual(['https://a.example/post'])
    expect((await s.links(idea)).map((l) => l.url)).toEqual(['https://b.example/post'])
  })

  it('allows the same address on the publication list and on an idea’s, but not twice in one', async () => {
    const idea = await s.newIdea()
    await s.ada.post(s.reading(), { url: 'https://a.example/post' })
    const again = await s.ada.post(s.reading(), { url: 'a.example/post#top' })
    expect(again.status).toBe(409)
    expect((await again.json()).error).toContain('already in this publication')
    expect((await s.ada.post(s.ideaLinks(idea), { url: 'https://a.example/post' })).status).toBe(
      201,
    )
  })

  it('has no maximum on the publication’s own list, though an idea’s keeps its limit', async () => {
    const idea = await s.newIdea()
    for (let i = 0; i < MAX_IDEA_LINKS; i++) {
      s.ctx.store.reading.add(s.publication, null, { url: `https://s${i}.example/`, title: 't' })
      s.ctx.store.reading.add(s.publication, idea, { url: `https://i${i}.example/`, title: 't' })
    }
    expect((await s.ada.post(s.reading(), { url: 'https://one-more.example/' })).status).toBe(201)
    expect(await s.links()).toHaveLength(MAX_IDEA_LINKS + 1)
    const full = await s.ada.post(s.ideaLinks(idea), { url: 'https://one-more.example/' })
    expect(full.status).toBe(409)
    expect((await full.json()).error).toContain(`An idea can have up to ${MAX_IDEA_LINKS} links`)
  })

  it('marks an item read and unread, edits it, and removes it', async () => {
    const [item] = await (await s.ada.post(s.reading(), { url: 'https://a.example/post' })).json()
    const read = await s.ada.put(`${s.reading()}/${item.id}/read`, { read: true })
    expect((await read.json())[0].readAt).toBeTruthy()
    expect(
      (await (await s.ada.put(`${s.reading()}/${item.id}/read`, { read: false })).json())[0].readAt,
    ).toBeNull()

    const edited = await s.ada.patch(`${s.reading()}/${item.id}`, {
      url: 'https://a.example/post',
      title: 'My name for it',
      authors: ['Ada Lovelace'],
    })
    expect((await edited.json())[0]).toMatchObject({
      title: 'My name for it',
      authors: ['Ada Lovelace'],
    })
    expect((await s.ada.delete(`${s.reading()}/${item.id}`)).status).toBe(204)
    expect(await s.links()).toEqual([])
    expect((await s.ada.delete(`${s.reading()}/${item.id}`)).status).toBe(404)
  })

  it('cannot touch an idea’s item through the publication list, or the other way round', async () => {
    const idea = await s.newIdea()
    const withIdea = await (
      await s.ada.post(s.ideaLinks(idea), { url: 'https://b.example/post' })
    ).json()
    const ideaItem = withIdea.links[0].id as string
    expect((await s.ada.delete(`${s.reading()}/${ideaItem}`)).status).toBe(404)
    expect((await s.ada.put(`${s.reading()}/${ideaItem}/read`, { read: true })).status).toBe(404)
    const [mine] = await (await s.ada.post(s.reading(), { url: 'https://a.example/post' })).json()
    expect((await s.ada.delete(`${s.ideaLinks(idea)}/${mine.id}`)).status).toBe(404)
  })

  it('is for members only', async () => {
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(s.ctx, 'ada@example.com')
    expect((await bob.get(s.reading())).status).toBe(404)
    expect((await bob.post(s.reading(), { url: 'https://a.example/' })).status).toBe(404)
    await sharePublication(s.ctx, s.ada, s.publication, bob, 'bob@example.com')
    expect((await bob.post(s.reading(), { url: 'https://a.example/' })).status).toBe(201)
    expect(await s.links()).toHaveLength(1)
  })
})

describe('the publication’s own notes', () => {
  let s: Awaited<ReturnType<typeof start>>
  const add = async (text: string, extra: object = {}): Promise<Note> =>
    (await s.ada.post(s.notes(), { text, ...extra })).json()
  beforeEach(async () => {
    s = await start()
  })

  it('adds, lists in order, edits and deletes notes that belong to no idea', async () => {
    const idea = await s.newIdea()
    const first = await add('First thought')
    await add('Second thought')
    await s.ada.post(s.ideaNotes(idea), { text: 'An idea’s note' })
    expect((await s.noteList()).map((n) => n.text)).toEqual(['First thought', 'Second thought'])
    expect((await s.noteList(idea)).map((n) => n.text)).toEqual(['An idea’s note'])

    const edited = await s.ada.patch(`${s.notes()}/${first.id}`, { text: 'Better' })
    expect((await edited.json()).text).toBe('Better')
    expect((await s.ada.delete(`${s.notes()}/${first.id}`)).status).toBe(204)
    expect((await s.noteList()).map((n) => n.text)).toEqual(['Second thought'])
    expect((await s.ada.patch(`${s.ideaNotes(idea)}/${first.id}`, { text: 'x' })).status).toBe(404)
  })

  it('has its own order: reordering the publication’s notes leaves an idea’s alone, and a stale order is refused', async () => {
    const idea = await s.newIdea()
    const a = await add('A')
    const b = await add('B')
    const c = await add('C')
    const x = (await (await s.ada.post(s.ideaNotes(idea), { text: 'X' })).json()) as Note
    const y = (await (await s.ada.post(s.ideaNotes(idea), { text: 'Y' })).json()) as Note

    const res = await s.ada.put(`${s.notes()}/order`, { ids: [c.id, a.id, b.id] })
    expect((await res.json()).map((n: Note) => n.text)).toEqual(['C', 'A', 'B'])
    expect((await s.noteList(idea)).map((n) => n.text)).toEqual(['X', 'Y'])

    expect((await s.ada.put(`${s.notes()}/order`, { ids: [a.id, b.id] })).status).toBe(409)
    expect((await s.ada.put(`${s.notes()}/order`, { ids: [a.id, b.id, c.id, x.id] })).status).toBe(
      409,
    )
    expect((await s.ada.put(`${s.ideaNotes(idea)}/order`, { ids: [y.id, x.id] })).status).toBe(200)
    expect((await s.noteList()).map((n) => n.text)).toEqual(['C', 'A', 'B'])
  })

  it('takes notes from an item of the publication’s articles, which then counts as read', async () => {
    const [item] = await (await s.ada.post(s.reading(), { url: 'https://a.example/post' })).json()
    const note = await add('Said this', { readingItemId: item.id })
    expect(note).toMatchObject({ readingItemId: item.id })
    expect((await s.links())[0]!.readAt).toBeTruthy()
    const quote = await add('“Exact words”', { readingItemId: item.id, quote: true })
    expect(quote).toMatchObject({ quote: true, origin: 'reading' })
    expect((await s.ada.patch(`${s.notes()}/${quote.id}`, { text: 'changed' })).status).toBe(409)
  })

  it('refuses a source that is not on the publication’s list (including one on an idea’s), and a quote with none', async () => {
    const idea = await s.newIdea()
    const withItem = await (
      await s.ada.post(s.ideaLinks(idea), { url: 'https://b.example/post' })
    ).json()
    const res = await s.ada.post(s.notes(), { text: 'x', readingItemId: withItem.links[0].id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("isn't in this publication's articles")
    expect((await s.ada.post(s.notes(), { text: 'x', quote: true })).status).toBe(400)
  })

  it('tags, merges and splits notes, as an idea’s notes can', async () => {
    const a = await add('One')
    const b = await add('Two')
    const tagged = await s.ada.put(`${s.notes()}/${a.id}/tags`, { tags: ['intro'] })
    expect((await tagged.json()).tags).toEqual(['intro'])
    const merged = await (await s.ada.post(`${s.notes()}/merge`, { ids: [a.id, b.id] })).json()
    expect(merged.map((n: Note) => n.text)).toEqual(['One\n\nTwo'])
    const split = await s.ada.post(`${s.notes()}/${a.id}/split`, { before: 'One', after: 'Two' })
    expect(split.status).toBe(201)
    expect((await split.json()).map((n: Note) => n.text)).toEqual(['One', 'Two'])
  })

  it('limits the notes, in words that name the publication, and has no “added to a draft” state', async () => {
    for (let i = 0; i < MAX_IDEA_NOTES; i++) {
      s.ctx.store.notes.append(s.publication, null, null, `n${i}`)
    }
    const res = await s.ada.post(s.notes(), { text: 'one more' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('A publication can have up to')
    const [first] = await s.noteList()
    expect((await s.ada.put(`${s.notes()}/${first!.id}/added`, { added: true })).status).toBe(404)
  })

  it('is for members only', async () => {
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.get(s.notes())).status).toBe(404)
    expect((await bob.post(s.notes(), { text: 'x' })).status).toBe(404)
  })
})

describe('moving articles', () => {
  let s: Awaited<ReturnType<typeof start>>
  const move = (ids: string[], ideaId: string | null) =>
    s.ada.post(`${s.api}/move/reading`, { ids, to: { ideaId } })
  const item = async (url: string, extra: object = {}): Promise<Link> =>
    (await s.ada.post(s.reading(), { url, title: url.replace('https://', ''), ...extra }))
      .json()
      .then((l: Link[]) => l.find((x) => x.url === url)!)
  beforeEach(async () => {
    s = await start()
  })

  it('moves an item from the publication to an idea with its notes, read date, authors, why and origin', async () => {
    const idea = await s.newIdea()
    const a = await item('https://a.example/post', { authors: ['Ada'] })
    await s.ada.put(`${s.reading()}/${a.id}/read`, { read: true })
    s.ctx.store.reading.add(
      s.publication,
      null,
      { url: 'https://r.example/', title: 'R', why: 'Because', authors: ['Bo'] },
      'research',
    )
    const note = await (
      await s.ada.post(s.notes(), { text: 'About A', readingItemId: a.id })
    ).json()
    const other = await (await s.ada.post(s.notes(), { text: 'Unrelated' })).json()
    const before = (await s.links()).find((l) => l.id === a.id)!

    const res = await move([a.id], idea)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ readingItems: 1, merged: 0, notes: 1 })

    expect((await s.links()).map((l) => l.url)).toEqual(['https://r.example/'])
    const moved = (await s.links(idea))[0]!
    expect(moved).toMatchObject({ id: a.id, url: a.url, authors: ['Ada'], readAt: before.readAt })
    expect((await s.noteList(idea)).map((n) => [n.text, n.readingItemId])).toEqual([
      ['About A', a.id],
    ])
    expect((await s.noteList()).map((n) => n.id)).toEqual([other.id])
    expect(note.id).toBeTruthy()
  })

  it('moves an idea’s item to the publication, and between ideas', async () => {
    const one = await s.newIdea('One')
    const two = await s.newIdea('Two')
    const withItem = await (
      await s.ada.post(s.ideaLinks(one), { url: 'https://a.example/post' })
    ).json()
    const id = withItem.links[0].id as string
    await s.ada.post(s.ideaNotes(one), { text: 'Taken', readingItemId: id })

    expect((await move([id], null)).status).toBe(200)
    expect(await s.links(one)).toEqual([])
    expect((await s.links()).map((l) => l.id)).toEqual([id])
    expect((await s.noteList()).map((n) => n.text)).toEqual(['Taken'])
    expect(await s.noteList(one)).toEqual([])

    expect((await move([id], two)).status).toBe(200)
    expect((await s.links(two)).map((l) => l.id)).toEqual([id])
    expect((await s.noteList(two)).map((n) => n.text)).toEqual(['Taken'])
  })

  it('merges with an item of the same address that is already there, and the notes follow to that one', async () => {
    const idea = await s.newIdea()
    const there = (
      await (
        await s.ada.post(s.ideaLinks(idea), {
          url: 'https://a.example/post',
          title: 'Already here',
        })
      ).json()
    ).links[0]
    const mine = await item('https://a.example/post#frag')
    await s.ada.put(`${s.reading()}/${mine.id}/read`, { read: true })
    await s.ada.post(s.notes(), { text: 'Mine', readingItemId: mine.id })

    const res = await (await move([mine.id], idea)).json()
    expect(res).toMatchObject({ readingItems: 1, merged: 1, notes: 1 })
    const list = await s.links(idea)
    expect(list.map((l) => l.id)).toEqual([there.id]) // the one already there stays
    expect(list[0]!.title).toBe('Already here')
    expect(list[0]!.readAt).toBeTruthy() // and counts as read, since the moved one was
    expect((await s.noteList(idea)).map((n) => [n.text, n.readingItemId])).toEqual([
      ['Mine', there.id],
    ])
    expect(await s.links()).toEqual([])
  })

  it('moves several together, joining two with the same address into one', async () => {
    const idea = await s.newIdea()
    const a = await item('https://a.example/post')
    const a2 = item('https://a.example/post2')
    await a2
    const res = await move([a.id, (await a2).id], idea)
    expect((await res.json()).readingItems).toBe(2)
    expect((await s.links(idea)).map((l) => l.url)).toEqual([
      'https://a.example/post',
      'https://a.example/post2',
    ])
  })

  it('refuses things outside this publication, changing nothing', async () => {
    const idea = await s.newIdea()
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    const bobPublication = (await (await bob.get('/api/publications')).json())[0].id
    const bobItem = (
      await (
        await bob.post(`/api/publications/${bobPublication}/reading`, { url: 'https://x.example/' })
      ).json()
    )[0]
    const mine = await item('https://a.example/post')

    expect((await move([mine.id, bobItem.id], idea)).status).toBe(404)
    expect(await s.links(idea)).toEqual([])
    expect((await s.links()).map((l) => l.id)).toEqual([mine.id])
    // An idea of someone else's publication is not a destination.
    const bobIdea = (
      await (await bob.post(`/api/publications/${bobPublication}/ideas`, { name: 'Theirs' })).json()
    ).id
    expect((await move([mine.id], bobIdea)).status).toBe(404)
    expect(
      (await bob.post(`${s.api}/move/reading`, { ids: [mine.id], to: { ideaId: null } })).status,
    ).toBe(404)
  })

  it('says so when everything is already there, and refuses an empty choice', async () => {
    const a = await item('https://a.example/post')
    const res = await move([a.id], null)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('already there')
    expect((await move([], null)).status).toBe(400)
  })

  it('refuses, changing nothing, when the destination would have too many items or notes', async () => {
    const idea = await s.newIdea()
    for (let i = 0; i < MAX_IDEA_LINKS; i++) {
      s.ctx.store.reading.add(s.publication, idea, { url: `https://f${i}.example/`, title: 't' })
    }
    const a = await item('https://a.example/post')
    await s.ada.post(s.notes(), { text: 'n', readingItemId: a.id })
    const full = await move([a.id], idea)
    expect(full.status).toBe(409)
    expect((await full.json()).error).toContain('up to')
    expect((await s.links()).map((l) => l.id)).toEqual([a.id])
    expect(await s.noteList(idea)).toEqual([])

    const roomy = await s.newIdea('Notes full')
    for (let i = 0; i < MAX_IDEA_NOTES; i++)
      s.ctx.store.notes.append(s.publication, roomy, null, `n${i}`)
    const tooMany = await move([a.id], roomy)
    expect(tooMany.status).toBe(409)
    expect((await tooMany.json()).error).toContain('notes')
    expect((await s.links()).map((l) => l.id)).toEqual([a.id])
  })

  it('happens in full or not at all: a failure part-way changes nothing', async () => {
    const idea = await s.newIdea()
    const a = await item('https://a.example/post')
    const b = await item('https://b.example/post')
    await s.ada.post(s.notes(), { text: 'n', readingItemId: a.id })
    const before = { links: await s.links(), notes: await s.noteList() }
    let calls = 0
    s.ctx.store.moves.record = () => {
      if (++calls === 3) throw new Error('disk full')
    }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await move([a.id, b.id], idea)
    quiet.mockRestore()
    expect(res.status).toBe(500)
    expect(await s.links()).toEqual(before.links)
    expect(await s.noteList()).toEqual(before.notes)
    expect(await s.links(idea)).toEqual([])
    expect(await s.noteList(idea)).toEqual([])
  })

  it('records every move: who, what, from where to where', async () => {
    const idea = await s.newIdea()
    const a = await item('https://a.example/post')
    const note = await (await s.ada.post(s.notes(), { text: 'x', readingItemId: a.id })).json()
    const { batchId } = await (await move([a.id], idea)).json()
    const log = s.ctx.store.moves.list(s.publication)
    expect(log.map((m) => [m.kind, m.itemId, m.fromIdeaId, m.toIdeaId, m.batchId]).sort()).toEqual(
      [
        ['note', note.id, null, idea, batchId],
        ['reading', a.id, null, idea, batchId],
      ].sort(),
    )
  })

  it('updates the last-changed time of the ideas it touches, and not of others', async () => {
    const from = await s.newIdea('From')
    const to = await s.newIdea('To')
    const bystander = await s.newIdea('Bystander')
    const withItem = await (
      await s.ada.post(s.ideaLinks(from), { url: 'https://a.example/post' })
    ).json()
    const old = '2000-01-01T00:00:00.000Z'
    for (const id of [from, to, bystander]) s.ctx.store.ideas.touch(id, old)
    await move([withItem.links[0].id], to)
    const updated = async (id: string) =>
      (await (await s.ada.get(`${s.api}/ideas/${id}`)).json()).updatedAt as string
    expect(await updated(from)).not.toBe(old)
    expect(await updated(to)).not.toBe(old)
    expect(await updated(bystander)).toBe(old)
  })
})

describe('moving notes', () => {
  let s: Awaited<ReturnType<typeof start>>
  const move = (ids: string[], ideaId: string | null) =>
    s.ada.post(`${s.api}/move/notes`, { ids, to: { ideaId } })
  const note = async (text: string, extra: object = {}): Promise<Note> =>
    (await s.ada.post(s.notes(), { text, ...extra })).json()
  beforeEach(async () => {
    s = await start()
  })

  it('moves chosen notes to an idea, in their order, with tags, quote mark and author', async () => {
    const idea = await s.newIdea()
    const [src] = await (
      await s.ada.post(s.reading(), { url: 'https://a.example/post', title: 'A post' })
    ).json()
    const a = await note('A')
    const q = await note('“Quote”', { readingItemId: src.id, quote: true })
    const c = await note('C')
    await note('Stays')
    await s.ada.put(`${s.notes()}/${a.id}/tags`, { tags: ['intro'] })

    const res = await move([c.id, a.id, q.id], idea) // picked out of order
    expect(await res.json()).toMatchObject({ notes: 3, copied: 1 })
    const moved = await s.noteList(idea)
    expect(moved.map((n) => n.text)).toEqual(['A', '“Quote”', 'C']) // as they were arranged, not as picked
    expect(moved[0]!.tags).toEqual(['intro'])
    expect(moved[1]).toMatchObject({ quote: true, authorName: 'Ada', origin: 'reading' })
    expect((await s.noteList()).map((n) => n.text)).toEqual(['Stays'])
  })

  it('copies the source into the idea’s articles (read state, authors and why kept) and leaves the original', async () => {
    const idea = await s.newIdea()
    s.ctx.store.reading.add(
      s.publication,
      null,
      { url: 'https://a.example/post', title: 'A post', authors: ['Ada'], why: 'Because' },
      'research',
    )
    const [src] = await s.links()
    const n = await note('From A', { readingItemId: src!.id })
    await note('Also from A', { readingItemId: src!.id })

    await move([n.id], idea)
    const copy = (await s.links(idea))[0]!
    expect(copy.id).not.toBe(src!.id)
    expect(copy).toMatchObject({ url: 'https://a.example/post', title: 'A post', authors: ['Ada'] })
    expect(copy.readAt).toBeTruthy() // taking a note from it marked the original read
    expect((await s.noteList(idea))[0]!.readingItemId).toBe(copy.id)
    // The original is still on the publication's list, and the note left behind still points at it.
    expect((await s.links()).map((l) => l.id)).toEqual([src!.id])
    expect((await s.noteList())[0]!.readingItemId).toBe(src!.id)
  })

  it('uses the item the idea already has for that address, and copies a source only once', async () => {
    const idea = await s.newIdea()
    const there = (
      await (
        await s.ada.post(s.ideaLinks(idea), { url: 'https://a.example/post', title: 'There' })
      ).json()
    ).links[0]
    await s.ada.post(s.reading(), { url: 'https://a.example/post#x' })
    const both: Link[] = await (
      await s.ada.post(s.reading(), { url: 'https://b.example/post' })
    ).json()
    const src = both.find((l) => l.url.startsWith('https://a.example'))!
    const other = both.find((l) => l.url.startsWith('https://b.example'))!
    const n1 = await note('1', { readingItemId: src.id })
    const n2 = await note('2', { readingItemId: src.id })
    const n3 = await note('3', { readingItemId: other.id })
    const n4 = await note('4', { readingItemId: other.id })

    const res = await (await move([n1.id, n2.id, n3.id, n4.id], idea)).json()
    expect(res.copied).toBe(1)
    const links = await s.links(idea)
    expect(links).toHaveLength(2)
    expect(links.find((l) => l.url.startsWith('https://b'))).toBeTruthy()
    const moved = await s.noteList(idea)
    expect(moved.filter((n) => n.readingItemId === there.id)).toHaveLength(2)
  })

  it('moves notes between ideas and back to the publication, putting them at the end', async () => {
    const one = await s.newIdea('One')
    const two = await s.newIdea('Two')
    const a = (await (await s.ada.post(s.ideaNotes(one), { text: 'A' })).json()) as Note
    await s.ada.post(s.ideaNotes(two), { text: 'Already in two' })
    await move([a.id], two)
    expect((await s.noteList(two)).map((n) => n.text)).toEqual(['Already in two', 'A'])
    expect(await s.noteList(one)).toEqual([])
    await move([a.id], null)
    expect((await s.noteList()).map((n) => n.text)).toEqual(['A'])
  })

  it('moves notes from several places at once, one place after another', async () => {
    const one = await s.newIdea('One')
    const two = await s.newIdea('Two')
    const p = await note('P')
    const a = (await (await s.ada.post(s.ideaNotes(one), { text: 'A' })).json()) as Note
    const b = (await (await s.ada.post(s.ideaNotes(two), { text: 'B' })).json()) as Note
    const dest = await s.newIdea('New')
    await move([b.id, a.id, p.id], dest)
    expect((await s.noteList(dest)).map((n) => n.text)).toEqual(['B', 'A', 'P'])
  })

  it('puts a note that was in a draft back among those not yet used, in its new home', async () => {
    const one = await s.newIdea('One')
    const two = await s.newIdea('Two')
    const n = (await (await s.ada.post(s.ideaNotes(one), { text: 'Used' })).json()) as Note
    await s.ada.put(`${s.ideaNotes(one)}/${n.id}/added`, { added: true })
    await move([n.id], two)
    expect((await s.noteList(two))[0]!.addedAt).toBeNull()
  })

  it('refuses notes from elsewhere or an idea of another publication, and a full destination, changing nothing', async () => {
    const idea = await s.newIdea()
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    const bobPublication = (await (await bob.get('/api/publications')).json())[0].id
    const bobNote = await (
      await bob.post(`/api/publications/${bobPublication}/notes`, { text: 'Bob’s' })
    ).json()
    const mine = await note('Mine')
    expect((await move([mine.id, bobNote.id], idea)).status).toBe(404)
    expect(await s.noteList(idea)).toEqual([])
    expect((await s.noteList()).map((n) => n.id)).toEqual([mine.id])

    const full = await s.newIdea('Full')
    for (let i = 0; i < MAX_IDEA_NOTES; i++)
      s.ctx.store.notes.append(s.publication, full, null, `n${i}`)
    expect((await move([mine.id], full)).status).toBe(409)
    expect((await s.noteList()).map((n) => n.id)).toEqual([mine.id])

    const tight = await s.newIdea('Tight')
    for (let i = 0; i < MAX_IDEA_LINKS; i++)
      s.ctx.store.reading.add(s.publication, tight, { url: `https://f${i}.example/`, title: 't' })
    const [src] = await (await s.ada.post(s.reading(), { url: 'https://new.example/' })).json()
    const withSrc = await note('From a new source', { readingItemId: src.id })
    expect((await move([withSrc.id], tight)).status).toBe(409)
    expect((await s.noteList()).map((n) => n.id)).toContain(withSrc.id)
  })

  it('refuses a selection that has gone stale (a note deleted meanwhile), changing nothing', async () => {
    const idea = await s.newIdea()
    const a = await note('Still here')
    const gone = await note('Deleted meanwhile')
    await s.ada.delete(`${s.notes()}/${gone.id}`)
    const res = await move([a.id, gone.id], idea)
    expect(res.status).toBe(404)
    expect((await s.noteList()).map((n) => n.id)).toEqual([a.id])
    expect(await s.noteList(idea)).toEqual([])
  })

  it('says so when they are already there, records the move, and is for members only', async () => {
    const idea = await s.newIdea()
    const n = await note('A')
    expect((await move([n.id], null)).status).toBe(400)
    const { batchId } = await (await move([n.id], idea)).json()
    expect(s.ctx.store.moves.list(s.publication)).toEqual([
      expect.objectContaining({
        kind: 'note',
        itemId: n.id,
        fromIdeaId: null,
        toIdeaId: idea,
        batchId,
      }),
    ])
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect(
      (await bob.post(`${s.api}/move/notes`, { ids: [n.id], to: { ideaId: null } })).status,
    ).toBe(404)
  })
})

describe('moving between publications', () => {
  let s: Awaited<ReturnType<typeof start>>
  let other: string // a second publication of Ada's
  let otherApi: string
  const post = (kind: 'reading' | 'notes', ids: string[], to: object, via = s.api) =>
    s.ada.post(`${via}/move/${kind}`, { ids, to })
  const item = async (url: string, extra: object = {}): Promise<Link> =>
    (await s.ada.post(s.reading(), { url, title: url.replace('https://', ''), ...extra }))
      .json()
      .then((l: Link[]) => l.find((x) => x.url === url)!)
  const otherLinks = async (): Promise<Link[]> => (await s.ada.get(`${otherApi}/reading`)).json()
  const otherNotes = async (): Promise<Note[]> => (await s.ada.get(`${otherApi}/notes`)).json()
  beforeEach(async () => {
    s = await start()
    other = (await (await s.ada.post('/api/publications', { name: 'Second' })).json()).id
    otherApi = `/api/publications/${other}`
  })

  it('moves an item with its notes to the other publication’s list, or to one of its ideas', async () => {
    const a = await item('https://a.example/post', { authors: ['Ada'] })
    const note = await (
      await s.ada.post(s.notes(), { text: 'About A', readingItemId: a.id, tags: [] })
    ).json()
    const res = await post('reading', [a.id], { ideaId: null, publicationId: other })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ readingItems: 1, merged: 0, notes: 1 })
    expect(await s.links()).toEqual([])
    expect(await s.noteList()).toEqual([])
    expect((await otherLinks()).map((l) => [l.id, l.authors])).toEqual([[a.id, ['Ada']]])
    expect((await otherNotes()).map((n) => [n.id, n.readingItemId])).toEqual([[note.id, a.id]])

    const idea = (await (await s.ada.post(`${otherApi}/ideas`, { name: 'Elsewhere' })).json()).id
    const b = await item('https://b.example/post')
    await post('reading', [b.id], { ideaId: idea, publicationId: other })
    expect(
      (await (await s.ada.get(`${otherApi}/ideas/${idea}`)).json()).links.map((l: Link) => l.id),
    ).toEqual([b.id])
  })

  it('moves notes, copying their source and joining the same address already there', async () => {
    const a = await item('https://a.example/post')
    const b = await item('https://b.example/post')
    s.ctx.store.reading.add(other, null, { url: 'https://b.example/post', title: 'B' })
    const na = await (await s.ada.post(s.notes(), { text: 'A', readingItemId: a.id })).json()
    const nb = await (await s.ada.post(s.notes(), { text: 'B', readingItemId: b.id })).json()
    const res = await post('notes', [na.id, nb.id], { ideaId: null, publicationId: other })
    expect(await res.json()).toMatchObject({ notes: 2, copied: 1 })
    const links = await otherLinks()
    expect(links.map((l) => l.url).sort()).toEqual([
      'https://a.example/post',
      'https://b.example/post',
    ])
    const there = new Map(links.map((l) => [l.url, l.id]))
    expect((await otherNotes()).map((n) => [n.text, n.readingItemId])).toEqual([
      ['A', there.get('https://a.example/post')],
      ['B', there.get('https://b.example/post')],
    ])
    // The sources stay where the notes came from.
    expect((await s.links()).map((l) => l.id).sort()).toEqual([a.id, b.id].sort())
    expect(await s.noteList()).toEqual([])
  })

  it('joins an item with the one of the same address already in the other publication', async () => {
    const a = await item('https://a.example/post')
    const there = s.ctx.store.reading.add(other, null, {
      url: 'https://a.example/post',
      title: 'A',
    })
    const note = await (await s.ada.post(s.notes(), { text: 'A', readingItemId: a.id })).json()
    const res = await post('reading', [a.id], { ideaId: null, publicationId: other })
    expect(await res.json()).toMatchObject({ readingItems: 1, merged: 1, notes: 1 })
    expect((await otherLinks()).map((l) => l.id)).toEqual([there.id])
    expect((await otherNotes()).map((n) => [n.id, n.readingItemId])).toEqual([[note.id, there.id]])
    expect(await s.links()).toEqual([])
  })

  it('applies the destination’s limits', async () => {
    const idea = (await (await s.ada.post(`${otherApi}/ideas`, { name: 'Full' })).json()).id
    for (let i = 0; i < MAX_IDEA_NOTES; i++) {
      s.ctx.store.notes.append(other, idea, null, `n${i}`)
    }
    const n = await (await s.ada.post(s.notes(), { text: 'one too many' })).json()
    const res = await post('notes', [n.id], { ideaId: idea, publicationId: other })
    expect(res.status).toBe(409)
    expect((await s.noteList()).map((x) => x.id)).toEqual([n.id])
  })

  it('can be undone from the other side, by a member of both', async () => {
    const a = await item('https://a.example/post')
    const note = await (await s.ada.post(s.notes(), { text: 'N', readingItemId: a.id })).json()
    await post('reading', [a.id], { ideaId: null, publicationId: other })
    const back = await post(
      'reading',
      [a.id],
      { ideaId: null, publicationId: s.publication },
      otherApi,
    )
    expect(back.status).toBe(200)
    expect((await s.links()).map((l) => l.id)).toEqual([a.id])
    expect((await s.noteList()).map((n) => n.id)).toEqual([note.id])
    expect(await otherLinks()).toEqual([])
  })

  it('refuses a publication the person is not a member of, as if it did not exist, changing nothing', async () => {
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    const bobs = (await (await bob.get('/api/publications')).json())[0].id as string
    const a = await item('https://a.example/post')
    const n = await (await s.ada.post(s.notes(), { text: 'N' })).json()
    for (const publicationId of [bobs, 'no-such-publication']) {
      const r = await post('reading', [a.id], { ideaId: null, publicationId })
      expect(r.status).toBe(404)
      expect((await post('notes', [n.id], { ideaId: null, publicationId })).status).toBe(404)
      expect(await r.json()).toEqual({ error: 'Not found' })
    }
    expect((await s.links()).map((l) => l.id)).toEqual([a.id])
    expect((await s.noteList()).map((x) => x.id)).toEqual([n.id])
    expect(await (await bob.get(`/api/publications/${bobs}/reading`)).json()).toEqual([])
  })

  it('refuses someone who belongs only to the source, and an idea that is in neither publication', async () => {
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(s.ctx, 'ada@example.com')
    await sharePublication(s.ctx, s.ada, s.publication, bob, 'bob@example.com')
    const a = await item('https://a.example/post')
    // Bob can move within the shared publication but not into Ada's other one.
    const r = await bob.post(`${s.api}/move/reading`, {
      ids: [a.id],
      to: { ideaId: null, publicationId: other },
    })
    expect(r.status).toBe(404)
    expect((await s.links()).map((l) => l.id)).toEqual([a.id])
    // An idea of the source publication is not a destination in the other one.
    const idea = await s.newIdea()
    expect((await post('reading', [a.id], { ideaId: idea, publicationId: other })).status).toBe(404)
  })

  it('records both sides in the log', async () => {
    const a = await item('https://a.example/post')
    const { batchId } = await (
      await post('reading', [a.id], { ideaId: null, publicationId: other })
    ).json()
    for (const publication of [s.publication, other]) {
      expect(s.ctx.store.moves.list(publication)).toEqual([
        expect.objectContaining({ kind: 'reading', itemId: a.id, toPublicationId: other, batchId }),
      ])
    }
    // A move within the publication records no destination publication.
    const b = await item('https://b.example/post')
    const idea = await s.newIdea()
    await post('reading', [b.id], { ideaId: idea })
    expect(s.ctx.store.moves.list(s.publication)[0]).toMatchObject({
      itemId: b.id,
      toPublicationId: null,
    })
  })

  it('goes from the log of both publications when either is deleted', async () => {
    const a = await item('https://a.example/post')
    await post('reading', [a.id], { ideaId: null, publicationId: other })
    expect(s.ctx.store.moves.list(s.publication)).toHaveLength(1)
    await s.ada.delete(otherApi)
    expect(s.ctx.store.moves.list(s.publication)).toEqual([])
  })
})

describe('items dropping off the publication’s articles after a month', () => {
  let s: Awaited<ReturnType<typeof start>>
  const DAY = 86_400_000
  const start0 = new Date('2026-05-01T12:00:00Z').getTime()
  /** Items are dated by the real clock when they are made, so the clock is set to when each should be made. */
  const at = (days: number) => vi.setSystemTime(start0 + days * DAY)
  const add = async (url: string, extra: object = {}): Promise<Link> =>
    (await (await s.ada.post(s.reading(), { url, title: url, ...extra })).json()).find(
      (l: Link) => l.url === url,
    )
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    at(0)
    s = await start()
  })
  afterEach(() => vi.useRealTimers())
  const urls = async () => (await s.links()).map((l) => l.url)
  /** What a feed brings is not kept; a link typed in by hand is, so these switch Keep off to be able to drop. */
  const addUnkept = async (url: string) => {
    const item = await add(url)
    await s.ada.put(`${s.reading()}/${item.id}/kept`, { kept: false })
    return item
  }

  it('keeps a link the writer added by hand from the start, dated from when it was added', async () => {
    const item = await add('https://mine.example/')
    expect(item.kept).toBe(true)
    expect(item.addedAt).toBe('2026-05-01T12:00:00.000Z')
    at(90)
    expect(await urls()).toEqual(['https://mine.example/'])
  })

  it('drops items a month after they were put there, quietly, and not before', async () => {
    await addUnkept('https://old.example/')
    at(10)
    await addUnkept('https://newer.example/')
    at(29)
    expect(await urls()).toEqual(['https://old.example/', 'https://newer.example/'])
    at(31)
    expect(await urls()).toEqual(['https://newer.example/'])
    at(41)
    expect(await urls()).toEqual([])
  })

  it('keeps an item that was marked to be kept, and drops it again once that is undone', async () => {
    const item = await addUnkept('https://kept.example/')
    const kept = await s.ada.put(`${s.reading()}/${item.id}/kept`, { kept: true })
    expect(kept.status).toBe(200)
    expect((await kept.json())[0].kept).toBe(true)
    at(90)
    expect(await urls()).toEqual(['https://kept.example/'])
    await s.ada.put(`${s.reading()}/${item.id}/kept`, { kept: false })
    expect(await urls()).toEqual([])
  })

  it('never drops an item that notes were taken from, kept or not', async () => {
    const item = await addUnkept('https://noted.example/')
    await addUnkept('https://plain.example/')
    await s.ada.post(s.notes(), { text: 'Taken from it', readingItemId: item.id })
    at(60)
    expect(await urls()).toEqual(['https://noted.example/'])
    expect((await s.noteList())[0]!.readingItemId).toBe(item.id)
  })

  it('does not touch an idea’s articles or notes', async () => {
    const idea = await s.newIdea()
    await s.ada.post(s.ideaLinks(idea), { url: 'https://idea.example/' })
    await s.ada.post(s.ideaNotes(idea), { text: 'An idea note' })
    at(400)
    expect((await s.links(idea)).map((l) => l.url)).toEqual(['https://idea.example/'])
    expect(await s.noteList(idea)).toHaveLength(1)
  })

  it('starts the month again when an item is moved onto the publication’s list, unkept', async () => {
    const idea = await s.newIdea()
    const withItem = await (
      await s.ada.post(s.ideaLinks(idea), { url: 'https://moved.example/' })
    ).json()
    const id = withItem.links[0].id as string
    at(100) // long enough that anything made at the start would be gone
    await s.ada.post(`${s.api}/move/reading`, { ids: [id], to: { ideaId: null } })
    at(120)
    expect(await urls()).toEqual(['https://moved.example/']) // 20 days on the publication's list
    await s.ada.put(`${s.reading()}/${id}/kept`, { kept: true })
    await s.ada.post(`${s.api}/move/reading`, { ids: [id], to: { ideaId: idea } })
    await s.ada.post(`${s.api}/move/reading`, { ids: [id], to: { ideaId: null } })
    expect((await s.links())[0]!.kept).toBe(false) // keeping doesn't survive a round trip
  })

  it('refuses to keep an item of an idea, or one that is not there, and is for members only', async () => {
    const idea = await s.newIdea()
    const withItem = await (
      await s.ada.post(s.ideaLinks(idea), { url: 'https://idea.example/' })
    ).json()
    expect(
      (await s.ada.put(`${s.reading()}/${withItem.links[0].id}/kept`, { kept: true })).status,
    ).toBe(404)
    expect((await s.ada.put(`${s.reading()}/nope/kept`, { kept: true })).status).toBe(404)
    const bob = s.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    const item = await add('https://a.example/')
    expect((await bob.put(`${s.reading()}/${item.id}/kept`, { kept: true })).status).toBe(404)
  })

  it('offers a post from a feed again when its item has been dropped', async () => {
    const feeds = new FakeFeedFetcher({
      'https://f.example/feed': {
        title: 'F',
        items: [
          {
            id: 'p1',
            title: 'Post one',
            url: 'https://f.example/p1',
            summary: null,
            authors: [],
            publishedAt: new Date(start0 + 20 * DAY).toISOString(),
          },
        ],
      },
    })
    s = await start(feeds)
    const sourceId = (
      await (await s.ada.post(`${s.api}/sources`, { url: 'https://f.example/feed' })).json()
    ).id
    const status = async () =>
      (await (await s.ada.get(`${s.api}/sources/recent?days=60`)).json()).posts[0].status
    expect(await status()).toBe('new')
    await s.ada.post(`${s.api}/sources/recent/add`, { posts: [{ sourceId, postId: 'p1' }] })
    expect(await status()).toBe('added')
    at(35)
    expect(await status()).toBe('new')
    expect(await urls()).toEqual([])
  })
})
