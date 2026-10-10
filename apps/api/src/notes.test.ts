import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_IDEA_NOTES, NOTE_TEXT_MAX } from '@lfwa/core'
import { MIGRATIONS, migrate } from './db/database'
import { register, setup, shareProfile, verifyAccounts, type TestClient } from './test-helpers'

type Note = { id: string; text: string; origin: string; authorId: string | null }

describe('idea notes', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let profile: string
  let idea: string
  const ideas = () => `/api/profiles/${profile}/ideas`
  const notes = () => `${ideas()}/${idea}/notes`
  const list = async (): Promise<Note[]> => (await ada.get(notes())).json()
  const add = async (text: string): Promise<Note> => (await ada.post(notes(), { text })).json()

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
    it('is the notes joined by blank lines', async () => {
      await add('one')
      await add('two')
      expect((await (await ada.get(`${ideas()}/${idea}`)).json()).notes).toBe('one\n\ntwo')
    })

    it('creating with notes makes one note; blank makes none', async () => {
      const withNotes = await (
        await ada.post(ideas(), { name: 'A', notes: 'Erosion loops.' })
      ).json()
      expect(ctx.store.notes.list(withNotes.id).map((n) => n.text)).toEqual(['Erosion loops.'])
      const without = await (await ada.post(ideas(), { name: 'B' })).json()
      expect(ctx.store.notes.list(without.id)).toEqual([])
    })

    it('saving different text replaces the notes with one; saving the same text keeps them', async () => {
      await add('one')
      await add('two')
      await ada.patch(`${ideas()}/${idea}`, { name: 'Renamed', notes: 'one\n\ntwo' })
      expect(await list()).toHaveLength(2)
      await ada.patch(`${ideas()}/${idea}`, { notes: 'rewritten' })
      expect((await list()).map((n) => n.text)).toEqual(['rewritten'])
      await ada.patch(`${ideas()}/${idea}`, { notes: '' })
      expect(await list()).toEqual([])
    })
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
