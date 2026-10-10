import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_IDEA_NOTES, NOTE_TEXT_MAX } from '@lfwa/core'
import { MIGRATIONS, migrate } from './db/database'
import {
  PASSWORD,
  register,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

type Note = {
  id: string
  text: string
  origin: string
  authorId: string | null
  authorName: string | null
  tags: string[]
  quote: boolean
}

describe('idea notes', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let profile: string
  let idea: string
  const ideas = () => `/api/profiles/${profile}/ideas`
  const notes = () => `${ideas()}/${idea}/notes`
  const list = async (): Promise<Note[]> => (await ada.get(notes())).json()
  const add = async (text: string): Promise<Note> => (await ada.post(notes(), { text })).json()
  const addNote = async (text: string, extra: object = {}): Promise<Note> =>
    (await ada.post(notes(), { text, ...extra })).json()

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    profile = (await (await ada.get('/api/profiles')).json())[0].id
    idea = (await (await ada.post(ideas(), { name: 'Rivers' })).json()).id
  })

  it('starts with none, and adds notes in order, recording who typed them', async () => {
    expect(await list()).toEqual([])
    const first = await ada.post(notes(), { text: '  Erosion loops.  ' })
    expect(first.status).toBe(201)
    await add('Deposition on the inside.')
    const all = await list()
    expect(all.map((n) => n.text)).toEqual(['Erosion loops.', 'Deposition on the inside.'])
    expect(all[0]).toMatchObject({ origin: 'entered', addedAt: null })
    expect(all[0]!.authorId).toBeTruthy()
    expect(all[0]!.authorName).toBe('Ada')
  })

  it('edits a note, and says what is wrong with an empty or oversized one', async () => {
    const note = await add('Draft thought')
    const edited = await (
      await ada.patch(`${notes()}/${note.id}`, { text: 'Better thought' })
    ).json()
    expect(edited).toMatchObject({ id: note.id, text: 'Better thought' })

    const empty = await ada.post(notes(), { text: '   ' })
    expect(empty.status).toBe(400)
    expect(await empty.json()).toEqual({ error: 'Write something in the note' })
    expect((await ada.post(notes(), { text: 'x'.repeat(NOTE_TEXT_MAX + 1) })).status).toBe(400)
    expect((await ada.patch(`${notes()}/missing`, { text: 'x' })).status).toBe(404)
  })

  it('deletes a note, and keeps the rest in order', async () => {
    const [a, b, c] = [await add('a'), await add('b'), await add('c')]
    expect((await ada.delete(`${notes()}/${b!.id}`)).status).toBe(204)
    expect((await list()).map((n) => n.id)).toEqual([a!.id, c!.id])
    expect((await ada.delete(`${notes()}/${b!.id}`)).status).toBe(404)
    expect((await add('d')).text).toBe('d')
    expect((await list()).map((n) => n.text)).toEqual(['a', 'c', 'd'])
  })

  it('reorders by the whole list of ids, and refuses a stale one', async () => {
    const [a, b, c] = [await add('a'), await add('b'), await add('c')]
    const res = await ada.put(`${notes()}/order`, { ids: [c!.id, a!.id, b!.id] })
    expect(res.status).toBe(200)
    expect((await res.json()).map((n: Note) => n.text)).toEqual(['c', 'a', 'b'])
    expect((await list()).map((n) => n.text)).toEqual(['c', 'a', 'b'])

    for (const ids of [
      [a!.id, b!.id],
      [a!.id, a!.id, b!.id],
      [a!.id, b!.id, 'other'],
    ]) {
      const stale = await ada.put(`${notes()}/order`, { ids })
      expect(stale.status).toBe(409)
    }
    expect((await list()).map((n) => n.text)).toEqual(['c', 'a', 'b'])
  })

  it('limits how many notes an idea holds', async () => {
    for (let i = 0; i < MAX_IDEA_NOTES; i++) ctx.store.notes.append(profile, idea, null, `n${i}`)
    const res = await ada.post(notes(), { text: 'one too many' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain(`${MAX_IDEA_NOTES} notes`)
  })

  describe('taken from the reading list', () => {
    const itemOn = async () => {
      await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/paper' })
      return (await (await ada.get(`${ideas()}/${idea}`)).json()).links[0].id as string
    }

    it('is a note from reading, remembering which item', async () => {
      const item = await itemOn()
      const res = await ada.post(notes(), { text: 'A useful quote.', readingItemId: item })
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({
        text: 'A useful quote.',
        origin: 'reading',
        readingItemId: item,
        authorName: 'Ada',
      })
      expect(await add('Typed by hand')).toMatchObject({ origin: 'entered', readingItemId: null })
    })

    it('must come from an item on this idea', async () => {
      const other = (await (await ada.post(ideas(), { name: 'Other' })).json()).id
      await ada.post(`${ideas()}/${other}/links`, { url: 'https://example.org/else' })
      const elsewhere = (await (await ada.get(`${ideas()}/${other}`)).json()).links[0].id
      const res = await ada.post(notes(), { text: 'x', readingItemId: elsewhere })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("isn't on this idea's reading list")
      expect(await list()).toEqual([])
    })

    it('keeps its origin if the item is removed, and loses only the link to it', async () => {
      const item = await itemOn()
      await ada.post(notes(), { text: 'Quote.', readingItemId: item })
      await ada.delete(`${ideas()}/${idea}/links/${item}`)
      expect(await list()).toMatchObject([
        { text: 'Quote.', origin: 'reading', readingItemId: null },
      ])
    })

    it('stays attached when the note is edited', async () => {
      const item = await itemOn()
      const note = await (await ada.post(notes(), { text: 'Quote.', readingItemId: item })).json()
      const edited = await (
        await ada.patch(`${notes()}/${note.id}`, {
          text: 'Better quote.',
          readingItemId: 'ignored',
        })
      ).json()
      expect(edited).toMatchObject({
        text: 'Better quote.',
        origin: 'reading',
        readingItemId: item,
      })
    })
  })

  describe('direct quotations', () => {
    const itemOn = async () => {
      await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/paper' })
      return (await (await ada.get(`${ideas()}/${idea}`)).json()).links[0].id as string
    }
    const quote = async (text = 'Meanders grow.') => {
      const item = await itemOn()
      const res = await ada.post(notes(), { text, readingItemId: item, quote: true })
      return { item, res, note: (await res.json()) as Note }
    }

    it('are notes from reading that say they are quotations; other notes are not', async () => {
      const { item, res, note } = await quote()
      expect(res.status).toBe(201)
      expect(note).toMatchObject({ quote: true, origin: 'reading', readingItemId: item })
      const plain = await (await ada.post(notes(), { text: 'Mine.', readingItemId: item })).json()
      expect(plain.quote).toBe(false)
      expect((await add('Typed by hand')).quote).toBe(false)
    })

    it('need the reading-list item they come from', async () => {
      const res = await ada.post(notes(), { text: 'Unsourced.', quote: true })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('needs the reading-list item')
      expect(await list()).toEqual([])
    })

    it('cannot be edited, and are left as they were', async () => {
      const { note } = await quote()
      const res = await ada.patch(`${notes()}/${note.id}`, { text: 'Reworded.' })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("can't be edited")
      expect(await list()).toMatchObject([{ text: 'Meanders grow.', quote: true }])
    })

    it('can still be tagged, put in order and deleted', async () => {
      const { note } = await quote()
      const tagged = await ada.put(`${notes()}/${note.id}/tags`, { tags: ['Intro'] })
      expect((await tagged.json()).tags).toEqual(['Intro'])
      expect((await ada.delete(`${notes()}/${note.id}`)).status).toBe(204)
      expect(await list()).toEqual([])
    })

    it("are not rewritten by changing the idea's notes as one text", async () => {
      await quote()
      const idea0 = await (await ada.get(`${ideas()}/${idea}`)).json()
      const res = await ada.patch(`${ideas()}/${idea}`, { notes: 'Something else entirely.' })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain('quotations')
      // Sending the same text back, or only a new name, is fine.
      expect((await ada.patch(`${ideas()}/${idea}`, { notes: idea0.notes })).status).toBe(200)
      expect((await ada.patch(`${ideas()}/${idea}`, { name: 'Renamed' })).status).toBe(200)
      expect(await list()).toMatchObject([{ text: 'Meanders grow.', quote: true }])
    })

    it('keep their words even if something goes round the routes: the database refuses', async () => {
      const { note } = await quote()
      expect(() => ctx.store.notes.updateText(idea, note.id, 'Reworded.')).toThrow(
        /cannot be edited/,
      )
      expect(ctx.store.notes.get(idea, note.id)?.text).toBe('Meanders grow.')
    })
  })

  describe('tags', () => {
    const tag = (id: string, tags: unknown) => ada.put(`${notes()}/${id}/tags`, { tags })

    it('start empty, and are set as a whole, in the order given', async () => {
      const note = await add('Erosion loops.')
      expect(note.tags).toEqual([])
      const res = await tag(note.id, ['Intro', 'draft 2'])
      expect(res.status).toBe(200)
      expect((await res.json()).tags).toEqual(['Intro', 'draft 2'])
      expect((await list())[0]!.tags).toEqual(['Intro', 'draft 2'])
      expect((await (await tag(note.id, ['draft 2'])).json()).tags).toEqual(['draft 2']) // replaced, not added to
      expect((await (await tag(note.id, [])).json()).tags).toEqual([])
    })

    it('are tidied, and repeats (ignoring case) are dropped, keeping the first', async () => {
      const note = await add('x')
      const saved = await (
        await tag(note.id, ['  Part   one ', 'part one', 'PART ONE', 'Part two'])
      ).json()
      expect(saved.tags).toEqual(['Part one', 'Part two'])
    })

    it('are refused when empty, too long or too many, saying what to do', async () => {
      const note = await add('x')
      for (const [tags, message] of [
        [['ok', '   '], 'A tag needs a word or two'],
        [['x'.repeat(41)], 'Use 40 characters or fewer in a tag'],
        [Array.from({ length: 11 }, (_, i) => `t${i}`), 'Use 10 tags or fewer on a note'],
      ] as const) {
        const res = await tag(note.id, tags)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe(message)
      }
      expect((await tag(note.id, 'nope')).status).toBe(400)
      expect((await list())[0]!.tags).toEqual([]) // nothing half-saved
    })

    it('belong to a note on this idea, shared by members and hidden from everyone else', async () => {
      const bob = ctx.client()
      const eve = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      await register(eve, 'eve@example.com', 'Eve')
      verifyAccounts(ctx, 'ada@example.com')
      await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
      const note = await add('x')
      expect((await tag('nope', ['a'])).status).toBe(404)
      expect((await bob.put(`${notes()}/${note.id}/tags`, { tags: ['from bob'] })).status).toBe(200)
      expect((await list())[0]!.tags).toEqual(['from bob'])
      expect((await eve.put(`${notes()}/${note.id}/tags`, { tags: ['x'] })).status).toBe(404)

      const other = (await (await ada.post(ideas(), { name: 'Other' })).json()).id
      const via = `${ideas()}/${other}/notes/${note.id}/tags`
      expect((await ada.put(via, { tags: ['x'] })).status).toBe(404) // not that idea's note
    })

    it('stay on the note when its text changes or notes are put in order, and change the idea', async () => {
      const [a, b] = [await add('a'), await add('b')]
      await tag(a.id, ['one'])
      await ada.patch(`${notes()}/${a.id}`, { text: 'a, edited' })
      await ada.put(`${notes()}/order`, { ids: [b.id, a.id] })
      expect(await list()).toMatchObject([{ tags: [] }, { text: 'a, edited', tags: ['one'] }])

      ctx.store.ideas.touch(idea, 'long ago')
      await tag(b.id, ['two'])
      expect(ctx.store.ideas.get(profile, idea)!.updatedAt).not.toBe('long ago')
    })
  })

  describe('merging', () => {
    const merge = (ids: string[]) => ada.post(`${notes()}/merge`, { ids })

    it('joins notes into the first, as paragraphs, removing the others and answering with all the notes', async () => {
      const [a, b, c, d] = [
        await add('One.'),
        await add('Two.'),
        await add('Three.'),
        await add('Four.'),
      ]
      const res = await merge([c.id, a.id]) // ticked in any order; the arrangement decides
      expect(res.status).toBe(200)
      const all = await res.json()
      expect(all.map((n: Note) => n.text)).toEqual(['One.\n\nThree.', 'Two.', 'Four.'])
      expect(all.map((n: Note) => n.id)).toEqual([a.id, b.id, d.id]) // the merged note keeps the first one's place
      expect(await list()).toEqual(all)
      // The notes that are left stay in order and can still be moved.
      expect((await ada.put(`${notes()}/order`, { ids: [d.id, b.id, a.id] })).status).toBe(200)
      void c
    })

    it('keeps the origin (and reading source) they share, and takes every tag once', async () => {
      await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/paper' })
      const item = (await (await ada.get(`${ideas()}/${idea}`)).json()).links[0].id
      const [a, b] = [
        await addNote('From the paper.', { readingItemId: item }),
        await addNote('Also the paper.', { readingItemId: item }),
      ]
      await ada.put(`${notes()}/${a.id}/tags`, { tags: ['intro', 'Part 1'] })
      await ada.put(`${notes()}/${b.id}/tags`, { tags: ['part 1', 'later'] })
      const [merged] = await (await merge([a.id, b.id])).json()
      expect(merged).toMatchObject({
        text: 'From the paper.\n\nAlso the paper.',
        origin: 'reading',
        readingItemId: item,
        tags: ['intro', 'Part 1', 'later'],
        addedAt: null,
      })
    })

    it('says whose words they are: the author if all the notes had one, otherwise whoever merged', async () => {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      verifyAccounts(ctx, 'ada@example.com')
      await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
      const [a1, a2] = [await add('Ada one.'), await add('Ada two.')]
      const b1 = await (await bob.post(notes(), { text: 'Bob one.' })).json()
      expect((await (await merge([a1.id, a2.id])).json())[0].authorName).toBe('Ada')
      const mixed = await (await bob.post(`${notes()}/merge`, { ids: [a1.id, b1.id] })).json()
      expect(mixed[0]).toMatchObject({
        authorName: 'Bob',
        text: 'Ada one.\n\nAda two.\n\nBob one.',
      })
    })

    it('refuses notes from different places, different sources, quotations and notes already in a draft', async () => {
      await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/a' })
      await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/b' })
      const links = (await (await ada.get(`${ideas()}/${idea}`)).json()).links
      const typed = await add('Typed.')
      const brainstormed = ctx.store.notes.append(
        profile,
        idea,
        null,
        'From the chat.',
        'brainstorm',
      )
      const fromA = await addNote('From A.', { readingItemId: links[0].id })
      const fromB = await addNote('From B.', { readingItemId: links[1].id })
      const quote = await addNote('Exact words.', { readingItemId: links[0].id, quote: true })
      const used = await add('In a draft.')
      ctx.store.notes.setAdded(idea, used.id, true)

      const cases: [string[], RegExp][] = [
        [[typed.id, brainstormed.id], /different places/],
        [[fromA.id, fromB.id], /different reading-list items/],
        [[fromA.id, quote.id], /Quotations can't be merged/],
        [[typed.id, used.id], /already in a draft/],
      ]
      for (const [ids, message] of cases) {
        const res = await merge(ids)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toMatch(message)
      }
      expect(await list()).toHaveLength(6) // nothing changed
    })

    it('needs at least two real notes of this idea, and is not too long', async () => {
      const [a, b] = [await add('One.'), await add('Two.')]
      expect((await merge([a.id])).status).toBe(400)
      expect((await merge([a.id, a.id])).status).toBe(400)
      expect((await merge([a.id, 'nope'])).status).toBe(404)
      const other = (await (await ada.post(ideas(), { name: 'Other' })).json()).id
      const elsewhere = (await (await ada.post(`${ideas()}/${other}/notes`, { text: 'x' })).json())
        .id
      expect((await merge([a.id, elsewhere])).status).toBe(404)

      const long1 = ctx.store.notes.append(profile, idea, null, 'x'.repeat(NOTE_TEXT_MAX - 5))
      const long2 = ctx.store.notes.append(profile, idea, null, 'y'.repeat(100))
      const res = await merge([long1.id, long2.id])
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('longer than 20,000')
      expect(await list()).toHaveLength(4)
      void b
    })

    it('is shared by members, hidden from others, and changes the idea', async () => {
      const eve = ctx.client()
      await register(eve, 'eve@example.com', 'Eve')
      const [a, b] = [await add('One.'), await add('Two.')]
      expect((await eve.post(`${notes()}/merge`, { ids: [a.id, b.id] })).status).toBe(404)
      ctx.store.ideas.touch(idea, 'long ago')
      await merge([a.id, b.id])
      expect(ctx.store.ideas.get(profile, idea)!.updatedAt).not.toBe('long ago')
    })
  })

  describe('splitting', () => {
    const split = (id: string, before: string, after: string) =>
      ada.post(`${notes()}/${id}/split`, { before, after })

    it('cuts a note in two, the second just after the first and the same in every other respect', async () => {
      const [a, b] = [await add('One. Two.'), await add('Next.')]
      await ada.put(`${notes()}/${a.id}/tags`, { tags: ['intro'] })
      const res = await split(a.id, '  One.  ', 'Two. ')
      expect(res.status).toBe(201)
      const all = await res.json()
      expect(all.map((n: Note) => n.text)).toEqual(['One.', 'Two.', 'Next.'])
      expect(all[0].id).toBe(a.id) // the first part is the note itself
      expect(all[2].id).toBe(b.id)
      expect(all[1]).toMatchObject({
        origin: 'entered',
        authorName: 'Ada',
        tags: ['intro'],
        addedAt: null,
      })
      expect(all[1].id).not.toBe(a.id)
    })

    it('keeps where a note came from on both halves', async () => {
      await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/paper' })
      const item = (await (await ada.get(`${ideas()}/${idea}`)).json()).links[0].id
      const note = await addNote('First part. Second part.', { readingItemId: item })
      const all = await (await split(note.id, 'First part.', 'Second part.')).json()
      expect(all.map((n: Note & { readingItemId: string }) => [n.origin, n.readingItemId])).toEqual(
        [
          ['reading', item],
          ['reading', item],
        ],
      )
    })

    it('needs words on each side, refuses quotations and notes in a draft, and respects the limit', async () => {
      const note = await add('Whole.')
      for (const [before, after] of [
        ['', 'x'],
        ['x', '   '],
      ]) {
        const res = await split(note.id, before!, after!)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toContain('Put the cursor inside the note')
      }
      await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/paper' })
      const item = (await (await ada.get(`${ideas()}/${idea}`)).json()).links[0].id
      const quote = await addNote('Exact words here.', { readingItemId: item, quote: true })
      const refusedQuote = await split(quote.id, 'Exact', 'words here.')
      expect(refusedQuote.status).toBe(409)
      expect((await refusedQuote.json()).error).toContain("can't be split")
      ctx.store.notes.setAdded(idea, note.id, true)
      expect((await split(note.id, 'a', 'b')).status).toBe(409)
      expect((await split('nope', 'a', 'b')).status).toBe(404)

      ctx.store.notes.setAdded(idea, note.id, false)
      for (let i = ctx.store.notes.count(idea); i < MAX_IDEA_NOTES; i++)
        ctx.store.notes.append(profile, idea, null, `n${i}`)
      expect((await split(note.id, 'a', 'b')).status).toBe(409)
    })
  })

  it('marks the idea as changed', async () => {
    const stamp = () => ctx.store.ideas.get(profile, idea)!.updatedAt
    const touchedBy = async (change: () => Promise<unknown>) => {
      ctx.store.ideas.touch(idea, 'long ago')
      await change()
      expect(stamp()).not.toBe('long ago')
    }
    await touchedBy(() => add('a'))
    const [note, other] = await list()
    await touchedBy(() => ada.patch(`${notes()}/${note!.id}`, { text: 'b' }))
    await touchedBy(() => add('c'))
    const ids = (await list()).map((n) => n.id).reverse()
    await touchedBy(() => ada.put(`${notes()}/order`, { ids }))
    await touchedBy(() => ada.delete(`${notes()}/${other?.id ?? ids[0]}`))
  })

  it('is shared by profile members, and hidden from everyone else', async () => {
    const bob = ctx.client()
    const eve = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await register(eve, 'eve@example.com', 'Eve')
    verifyAccounts(ctx, 'ada@example.com')
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    const note = await add('Ada wrote this')
    expect((await bob.post(notes(), { text: 'Bob wrote this' })).status).toBe(201)
    expect((await bob.patch(`${notes()}/${note.id}`, { text: 'Bob edited' })).status).toBe(200)
    expect((await eve.get(notes())).status).toBe(404)
    expect((await eve.post(notes(), { text: 'hi' })).status).toBe(404)
  })

  it("shows an author's new name on notes they wrote before they changed it", async () => {
    await add('Written as Ada')
    expect((await list()).map((n) => n.authorName)).toEqual(['Ada'])
    expect((await ada.put('/api/account/name', { name: 'Ada King' })).status).toBe(200)
    expect((await list()).map((n) => n.authorName)).toEqual(['Ada King'])
  })

  it("names each note's author, and says nothing once they have left", async () => {
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    await add('Ada wrote this')
    const bobs = await (await bob.post(notes(), { text: 'Bob wrote this' })).json()
    expect(bobs.authorName).toBe('Bob')
    expect((await list()).map((n) => n.authorName)).toEqual(['Ada', 'Bob'])

    // Once they have left, the note stays, with nobody named.
    const left = await bob.delete('/api/account', {
      confirmEmail: 'bob@example.com',
      password: PASSWORD,
    })
    expect(left.status).toBe(204)
    expect(await list()).toMatchObject([
      { authorName: 'Ada' },
      { authorId: null, authorName: null },
    ])
  })

  it("does not reach into another profile's idea", async () => {
    const other = await (await ada.post('/api/profiles', { name: 'Other' })).json()
    const note = await add('mine')
    const via = `/api/profiles/${other.id}/ideas/${idea}/notes`
    expect((await ada.get(via)).status).toBe(404)
    expect((await ada.delete(`${via}/${note.id}`)).status).toBe(404)
  })

  it('goes with the idea', async () => {
    await add('a')
    await ada.delete(`${ideas()}/${idea}`)
    expect(ctx.store.notes.list(idea)).toEqual([])
  })

  describe('the idea\'s single "notes" text (until the screens use separate notes)', () => {
    it("is the notes as bullets, with a note's own lines and bullets indented under it", async () => {
      await add('one\nstill one')
      await add('two:\n- a\n- b')
      expect((await (await ada.get(`${ideas()}/${idea}`)).json()).notes).toBe(
        '- one\n  still one\n- two:\n  - a\n  - b',
      )
    })

    it('creating with notes makes one note; blank makes none', async () => {
      const withNotes = await (
        await ada.post(ideas(), { name: 'A', notes: 'Erosion loops.' })
      ).json()
      expect(ctx.store.notes.list(withNotes.id).map((n) => n.text)).toEqual(['Erosion loops.'])
      const without = await (await ada.post(ideas(), { name: 'B' })).json()
      expect(ctx.store.notes.list(without.id)).toEqual([])
    })

    it("saving bullets splits them into notes, keeping each note's own lines", async () => {
      await ada.patch(`${ideas()}/${idea}`, { notes: '- one\n  still one\n- two:\n  - a\n  - b' })
      expect((await list()).map((n) => n.text)).toEqual(['one\nstill one', 'two:\n- a\n- b'])
    })

    it('saving text that is not bullets makes it one note; blank removes the notes', async () => {
      await add('one')
      await add('two')
      await ada.patch(`${ideas()}/${idea}`, { notes: 'rewritten\n\nin two paragraphs' })
      expect((await list()).map((n) => n.text)).toEqual(['rewritten\n\nin two paragraphs'])
      await ada.patch(`${ideas()}/${idea}`, { notes: '' })
      expect(await list()).toEqual([])
    })

    it('saving the same text, or the same notes laid out differently, keeps the existing notes', async () => {
      const [one, two] = [await add('one'), await add('two')]
      const text = (await (await ada.get(`${ideas()}/${idea}`)).json()).notes
      await ada.patch(`${ideas()}/${idea}`, { name: 'Renamed', notes: text })
      await ada.patch(`${ideas()}/${idea}`, { notes: '- one\n\n- two\n\n' })
      expect((await list()).map((n) => n.id)).toEqual([one.id, two.id])
    })
  })
})

describe('the tags table', () => {
  it('goes with its note, and treats a tag as one whatever its case', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db, 'test')
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO ideas (id, profile_id, name, notes, created_at, updated_at) VALUES ('i', 'p', 'I', '', 't', 't');
      INSERT INTO idea_notes (id, profile_id, idea_id, text, origin, position, created_at, updated_at)
        VALUES ('n', 'p', 'i', 'x', 'entered', 0, 't', 't');
      INSERT INTO idea_note_tags (note_id, tag) VALUES ('n', 'Intro');
    `)
    expect(() =>
      db.exec("INSERT INTO idea_note_tags (note_id, tag) VALUES ('n', 'intro')"),
    ).toThrow()
    db.exec("DELETE FROM idea_notes WHERE id = 'n'")
    expect(db.prepare('SELECT count(*) AS n FROM idea_note_tags').get()).toEqual({ n: 0 })
  })
})

describe('moving existing notes into the notes table', () => {
  it("turns each idea's text into one note of its own, and skips blank ones", () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    // Everything before the migration under test, wherever it sits as later ones are added.
    const at = MIGRATIONS.findIndex(
      (m) => typeof m === 'string' && m.includes('CREATE TABLE idea_notes'),
    )
    expect(at).toBeGreaterThan(0)
    migrate(db, 'test', MIGRATIONS.slice(0, at))
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO ideas (id, profile_id, name, notes, created_at, updated_at)
        VALUES ('full', 'p', 'Has notes', 'Line one\n\nLine two', 'then', 'later'),
               ('blank', 'p', 'No notes', '', 'then', 'then'),
               ('spaces', 'p', 'Whitespace', '  \n ', 'then', 'then');
    `)
    migrate(db, 'test')
    const rows = db.prepare('SELECT * FROM idea_notes').all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      profile_id: 'p',
      idea_id: 'full',
      text: 'Line one\n\nLine two',
      origin: 'entered',
      position: 0,
      added_at: null,
      created_at: 'then',
      updated_at: 'later',
    })
  })
})
