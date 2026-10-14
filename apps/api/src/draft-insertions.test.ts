import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from './db/database'
import {
  PASSWORD,
  allRows,
  register,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

describe('words pulled into a draft from notes', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let profile: string
  let idea: string
  let draft: string
  const ideas = () => `/api/profiles/${profile}/ideas`
  const insertions = () => `/api/profiles/${profile}/drafts/${draft}/insertions`
  const addNote = async (text: string, extra: object = {}) =>
    (await (await ada.post(`${ideas()}/${idea}/notes`, { text, ...extra })).json()) as {
      id: string
    }
  const noteNow = (id: string) => ctx.store.notes.get(idea, id)!

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    profile = (await (await ada.get('/api/profiles')).json())[0].id
    idea = (await (await ada.post(ideas(), { name: 'Rivers' })).json()).id
    draft = (await (await ada.post(`${ideas()}/${idea}/drafts`, { title: 'Part 1' })).json()).id
  })

  it('records what was inserted, with the origin and author of the note, and sets the note aside', async () => {
    const note = await addNote('Erosion loops.')
    const res = await ada.post(insertions(), { noteId: note.id, text: '  Erosion loops.  ' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      id: expect.any(String),
      text: 'Erosion loops.',
      origin: 'entered',
      noteAuthorName: 'Ada',
      insertedByName: 'Ada',
      insertedAt: expect.any(String),
      source: null,
    })
    expect(noteNow(note.id).addedAt).toEqual(expect.any(String))
    expect(await (await ada.get(insertions())).json()).toHaveLength(1)
  })

  it('lets a quotation in only as a blockquote', async () => {
    await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/paper' })
    const item = (await (await ada.get(`${ideas()}/${idea}`)).json()).links[0]
    const quote = await addNote('Meanders grow.', { readingItemId: item.id, quote: true })

    const bare = await ada.post(insertions(), { noteId: quote.id, text: 'Meanders grow.' })
    expect(bare.status).toBe(400)
    expect((await bare.json()).error).toContain('as a quotation')
    const half = await ada.post(insertions(), {
      noteId: quote.id,
      text: '> Meanders grow.\n\nAnd then some words of my own.',
    })
    expect(half.status).toBe(400)
    expect(noteNow(quote.id).addedAt).toBeNull() // nothing was recorded, and the note is still available

    const text = '> Meanders grow.\n>\n> — [A paper](https://example.org/paper)'
    const ok = await ada.post(insertions(), { noteId: quote.id, text })
    expect(ok.status).toBe(201)
    expect(await ok.json()).toMatchObject({ text, origin: 'reading' })
    expect(noteNow(quote.id).addedAt).toEqual(expect.any(String))
  })

  it('takes the origin and source from the note, whatever the request says', async () => {
    await ada.post(`${ideas()}/${idea}/links`, { url: 'https://example.org/paper' })
    const item = (await (await ada.get(`${ideas()}/${idea}`)).json()).links[0]
    const fromReading = await addNote('A quote.', { readingItemId: item.id })
    const made = ctx.store.notes.append(profile, idea, null, 'From the chat.', 'brainstorm')

    const quoted = await (
      await ada.post(insertions(), {
        noteId: fromReading.id,
        text: 'A quote. ([x](https://example.org/paper))',
        origin: 'entered', // ignored
      })
    ).json()
    expect(quoted).toMatchObject({
      origin: 'reading',
      source: { title: item.title, url: 'https://example.org/paper' },
    })
    const chat = await (
      await ada.post(insertions(), { noteId: made.id, text: 'From the chat.' })
    ).json()
    expect(chat).toMatchObject({ origin: 'brainstorm', noteAuthorName: null, source: null })
    expect(
      (await (await ada.get(insertions())).json()).map((i: { origin: string }) => i.origin),
    ).toEqual(['reading', 'brainstorm'])
  })

  it('refuses a note from another idea, empty text, and a draft that is not there', async () => {
    const other = (await (await ada.post(ideas(), { name: 'Other' })).json()).id
    const foreign = (
      await (await ada.post(`${ideas()}/${other}/notes`, { text: 'Elsewhere' })).json()
    ).id
    const refused = await ada.post(insertions(), { noteId: foreign, text: 'Elsewhere' })
    expect(refused.status).toBe(400)
    expect((await refused.json()).error).toContain("isn't on this draft's idea")

    const note = await addNote('Mine')
    expect((await ada.post(insertions(), { noteId: note.id, text: '   ' })).status).toBe(400)
    expect(
      (
        await ada.post(`/api/profiles/${profile}/drafts/nope/insertions`, {
          noteId: note.id,
          text: 'x',
        })
      ).status,
    ).toBe(404)
    expect(noteNow(note.id).addedAt).toBeNull() // none of that set it aside
  })

  it('is shared with the profile, and hidden from everyone else', async () => {
    const bob = ctx.client()
    const eve = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await register(eve, 'eve@example.com', 'Eve')
    verifyAccounts(ctx, 'ada@example.com')
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    const note = await addNote('Ada wrote this')
    // Bob is a member, not the editor: he can read what was added but not add anything.
    expect((await bob.post(insertions(), { noteId: note.id, text: 'Ada wrote this' })).status).toBe(
      403,
    )
    const made = await (
      await ada.post(insertions(), { noteId: note.id, text: 'Ada wrote this' })
    ).json()
    expect(made).toMatchObject({ noteAuthorName: 'Ada', insertedByName: 'Ada' })
    expect(await (await bob.get(insertions())).json()).toHaveLength(1)
    expect((await eve.get(insertions())).status).toBe(404)
    expect((await eve.post(insertions(), { noteId: note.id, text: 'x' })).status).toBe(404)
  })

  it('can be put back among the notes, without taking the words out of the draft record', async () => {
    const note = await addNote('Erosion loops.')
    await ada.post(insertions(), { noteId: note.id, text: 'Erosion loops.' })
    const back = await ada.put(`${ideas()}/${idea}/notes/${note.id}/added`, { added: false })
    expect(back.status).toBe(200)
    expect(await back.json()).toMatchObject({ id: note.id, addedAt: null })
    expect(await (await ada.get(insertions())).json()).toHaveLength(1)

    const again = await (
      await ada.put(`${ideas()}/${idea}/notes/${note.id}/added`, { added: true })
    ).json()
    expect(again.addedAt).toEqual(expect.any(String))
    expect((await ada.put(`${ideas()}/${idea}/notes/nope/added`, { added: false })).status).toBe(
      404,
    )
    expect(
      (await ada.put(`${ideas()}/${idea}/notes/${note.id}/added`, { added: 'no' })).status,
    ).toBe(400)
  })

  it('outlives the note and the people involved, and goes with the draft', async () => {
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    const note = await addNote('Ada wrote this')
    const adaId = (await (await ada.get('/api/auth/me')).json()).id
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    ctx.store.drafts.reassignEditor(profile, adaId, bobId) // until handover exists, Bob edits this one
    await bob.post(insertions(), { noteId: note.id, text: 'Ada wrote this' })

    await ada.delete(`${ideas()}/${idea}/notes/${note.id}`)
    expect(await (await ada.get(insertions())).json()).toMatchObject([
      { text: 'Ada wrote this', origin: 'entered' },
    ])

    const left = await bob.delete('/api/account', {
      confirmEmail: 'bob@example.com',
      password: PASSWORD,
      keepName: false,
    })
    expect(left.status).toBe(204)
    expect(await (await ada.get(insertions())).json()).toMatchObject([{ insertedByName: null }])

    await ada.delete(`/api/profiles/${profile}/drafts/${draft}`)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })
})

describe('options used from a Rephrase window (#162)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let profile: string
  let draft: string
  const options = () => `/api/profiles/${profile}/drafts/${draft}/option-insertions`
  const insertions = () => `/api/profiles/${profile}/drafts/${draft}/insertions`
  const use = {
    kind: 'passage',
    offered: 'Rivers bend because the outer bank wears away.',
    text: '  Rivers bend because the outer bank wears away faster.  ',
    aim: 'Plainer for a general reader',
  }

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    profile = (await (await ada.get('/api/profiles')).json())[0].id
    const idea = (
      await (await ada.post(`/api/profiles/${profile}/ideas`, { name: 'Rivers' })).json()
    ).id
    draft = (
      await (
        await ada.post(`/api/profiles/${profile}/ideas/${idea}/drafts`, { title: 'Part 1' })
      ).json()
    ).id
  })

  it('records the option as offered, the words as used, the aim and who used it', async () => {
    const res = await ada.post(options(), use)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      id: expect.any(String),
      text: 'Rivers bend because the outer bank wears away faster.',
      origin: 'option',
      option: { kind: 'passage', offered: use.offered, aim: use.aim },
      noteAuthorName: null,
      insertedByName: 'Ada',
      insertedAt: expect.any(String),
      source: null,
    })
    // It is listed with the words pulled in from notes, oldest first.
    expect(await (await ada.get(insertions())).json()).toHaveLength(1)
  })

  it('records a title the same way', async () => {
    const res = await ada.post(options(), {
      ...use,
      kind: 'title',
      offered: 'Why rivers bend',
      text: 'Why rivers bend',
    })
    expect(res.status).toBe(201)
    expect((await res.json()).option.kind).toBe('title')
  })

  it('refuses empty words, a thin aim, an unknown kind and a draft that is not there', async () => {
    expect((await ada.post(options(), { ...use, text: '  ' })).status).toBe(400)
    expect((await ada.post(options(), { ...use, offered: '' })).status).toBe(400)
    const thin = await ada.post(options(), { ...use, aim: 'Better' })
    expect(thin.status).toBe(400)
    expect((await thin.json()).error).toMatch(/few words/)
    expect((await ada.post(options(), { ...use, kind: 'opening' })).status).toBe(400)
    expect(
      (await ada.post(`/api/profiles/${profile}/drafts/nope/option-insertions`, use)).status,
    ).toBe(404)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })

  it('is only for the draft’s editor, and for signed-in members', async () => {
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    expect((await bob.post(options(), use)).status).toBe(403)
    expect((await ctx.client().post(options(), use)).status).toBe(401)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })

  describe('when the person who used it deletes their account', () => {
    async function bobUsesAnOptionAndLeaves(keepName: boolean) {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      verifyAccounts(ctx, 'ada@example.com')
      await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
      const adaId = (await (await ada.get('/api/auth/me')).json()).id
      const bobId = (await (await bob.get('/api/auth/me')).json()).id
      ctx.store.drafts.reassignEditor(profile, adaId, bobId)
      await bob.post(options(), use)
      const left = await bob.delete('/api/account', {
        confirmEmail: 'bob@example.com',
        password: PASSWORD,
        keepName,
      })
      expect(left.status).toBe(204)
    }

    it('keeps the record, with their display name if they chose that', async () => {
      await bobUsesAnOptionAndLeaves(true)
      expect(await (await ada.get(insertions())).json()).toMatchObject([
        { origin: 'option', insertedByName: 'Bob' },
      ])
      expect(JSON.stringify(allRows(ctx))).not.toContain('bob@example.com')
    })

    it('keeps the record but no trace of the name if they chose not to', async () => {
      await bobUsesAnOptionAndLeaves(false)
      expect(await (await ada.get(insertions())).json()).toMatchObject([
        { origin: 'option', insertedByName: null },
      ])
      expect(JSON.stringify(allRows(ctx))).not.toContain('Bob')
    })
  })

  it('goes with the draft', async () => {
    await ada.post(options(), use)
    await ada.delete(`/api/profiles/${profile}/drafts/${draft}`)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })

  it('keeps every earlier insertion as it was when the database is upgraded', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    const at = MIGRATIONS.findIndex(
      (m) => typeof m === 'string' && m.includes('CREATE TABLE draft_insertions_new'),
    )
    expect(at).toBeGreaterThan(0)
    migrate(db, 'test', MIGRATIONS.slice(0, at))
    db.exec(`
      INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'now');
      INSERT INTO ideas (id, profile_id, name, notes, created_at, updated_at) VALUES ('i', 'p', 'I', '', 't', 't');
      INSERT INTO drafts (id, profile_id, idea_id, title, body, created_at, updated_at) VALUES ('d', 'p', 'i', 'T', 'One.', 't', 't');
      INSERT INTO draft_insertions (id, draft_id, text, origin, source_title, source_url, source_authors, inserted_at, kept_inserted_by_name)
        VALUES ('x', 'd', 'Words.', 'reading', 'A paper', 'https://example.org/p', '["Ada"]', '2026-01-01T00:00:00Z', 'Bo');
    `)
    migrate(db, 'test')
    expect(db.prepare('SELECT * FROM draft_insertions').all()).toEqual([
      expect.objectContaining({
        id: 'x',
        draft_id: 'd',
        text: 'Words.',
        origin: 'reading',
        source_title: 'A paper',
        source_authors: '["Ada"]',
        kept_inserted_by_name: 'Bo',
        option_kind: null,
        option_offered: null,
        option_aim: null,
      }),
    ])
    db.prepare(
      "INSERT INTO draft_insertions (id, draft_id, text, origin, inserted_at) VALUES ('y', 'd', 'W', 'option', 't')",
    ).run()
    expect(db.prepare('SELECT count(*) AS n FROM draft_insertions').get()).toEqual({ n: 2 })
  })
})
