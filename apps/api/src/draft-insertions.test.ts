import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
  allRows,
  register,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

describe('words pulled into a draft from notes', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let publication: string
  let idea: string
  let draft: string
  const ideas = () => `/api/publications/${publication}/ideas`
  const insertions = () => `/api/publications/${publication}/drafts/${draft}/insertions`
  const addNote = async (text: string, extra: object = {}) =>
    (await (await ada.post(`${ideas()}/${idea}/notes`, { text, ...extra })).json()) as {
      id: string
    }
  const noteNow = (id: string) => ctx.store.notes.get(idea, id)!

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    publication = (await (await ada.get('/api/publications')).json())[0].id
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
      noteAuthorId: expect.any(String),
      noteAuthorName: 'Ada',
      insertedByName: 'Ada',
      insertedAt: expect.any(String),
      source: null,
    })
    expect(noteNow(note.id).addedAt).toEqual(expect.any(String))
    expect(await (await ada.get(insertions())).json()).toHaveLength(1)
  })

  it('lets a quotation in only as a blockquote', async () => {
    await ada.post(`${ideas()}/${idea}/articles`, { url: 'https://example.org/paper' })
    const item = (await (await ada.get(`${ideas()}/${idea}`)).json()).articles[0]
    const quote = await addNote('Meanders grow.', { articleId: item.id, quote: true })

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
    await ada.post(`${ideas()}/${idea}/articles`, { url: 'https://example.org/paper' })
    const item = (await (await ada.get(`${ideas()}/${idea}`)).json()).articles[0]
    const fromReading = await addNote('A quote.', { articleId: item.id })
    const made = ctx.store.notes.append(publication, idea, null, 'From the chat.', 'brainstorm')

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
        await ada.post(`/api/publications/${publication}/drafts/nope/insertions`, {
          noteId: note.id,
          text: 'x',
        })
      ).status,
    ).toBe(404)
    expect(noteNow(note.id).addedAt).toBeNull() // none of that set it aside
  })

  it('is shared with the publication, and hidden from everyone else', async () => {
    const bob = ctx.client()
    const eve = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await register(eve, 'eve@example.com', 'Eve')
    verifyAccounts(ctx, 'ada@example.com')
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
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
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    const note = await addNote('Ada wrote this')
    const adaId = (await (await ada.get('/api/auth/me')).json()).id
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    ctx.store.drafts.reassignEditor(publication, adaId, bobId) // until handover exists, Bob edits this one
    await bob.post(insertions(), { noteId: note.id, text: 'Ada wrote this' })

    await ada.delete(`${ideas()}/${idea}/notes/${note.id}`)
    expect(await (await ada.get(insertions())).json()).toMatchObject([
      { text: 'Ada wrote this', origin: 'entered' },
    ])

    const left = await bob.delete('/api/account', {
      password: PASSWORD,
      keepName: false,
    })
    expect(left.status).toBe(204)
    expect(await (await ada.get(insertions())).json()).toMatchObject([{ insertedByName: null }])

    await ada.delete(`/api/publications/${publication}/drafts/${draft}`)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })
})

describe('options used from a Rephrase window (#162)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let publication: string
  let draft: string
  const options = () => `/api/publications/${publication}/drafts/${draft}/option-insertions`
  const insertions = () => `/api/publications/${publication}/drafts/${draft}/insertions`
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
    publication = (await (await ada.get('/api/publications')).json())[0].id
    const idea = (
      await (await ada.post(`/api/publications/${publication}/ideas`, { name: 'Rivers' })).json()
    ).id
    draft = (
      await (
        await ada.post(`/api/publications/${publication}/ideas/${idea}/drafts`, { title: 'Part 1' })
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
      noteAuthorId: null,
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
      (await ada.post(`/api/publications/${publication}/drafts/nope/option-insertions`, use))
        .status,
    ).toBe(404)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })

  it('is only for the draft’s editor, and for signed-in members', async () => {
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    expect((await bob.post(options(), use)).status).toBe(403)
    expect((await ctx.client().post(options(), use)).status).toBe(401)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })

  describe('when the person who used it deletes their account', () => {
    async function bobUsesAnOptionAndLeaves(keepName: boolean) {
      const bob = ctx.client()
      await register(bob, 'bob@example.com', 'Bob')
      verifyAccounts(ctx, 'ada@example.com')
      await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
      const adaId = (await (await ada.get('/api/auth/me')).json()).id
      const bobId = (await (await bob.get('/api/auth/me')).json()).id
      ctx.store.drafts.reassignEditor(publication, adaId, bobId)
      await bob.post(options(), use)
      const left = await bob.delete('/api/account', {
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
    await ada.delete(`/api/publications/${publication}/drafts/${draft}`)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })
})
