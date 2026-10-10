import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
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
    const made = await (
      await bob.post(insertions(), { noteId: note.id, text: 'Ada wrote this' })
    ).json()
    expect(made).toMatchObject({ noteAuthorName: 'Ada', insertedByName: 'Bob' })
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
    await bob.post(insertions(), { noteId: note.id, text: 'Ada wrote this' })

    await ada.delete(`${ideas()}/${idea}/notes/${note.id}`)
    expect(await (await ada.get(insertions())).json()).toMatchObject([
      { text: 'Ada wrote this', origin: 'entered' },
    ])

    const left = await bob.delete('/api/account', {
      confirmEmail: 'bob@example.com',
      password: PASSWORD,
    })
    expect(left.status).toBe(204)
    expect(await (await ada.get(insertions())).json()).toMatchObject([{ insertedByName: null }])

    await ada.delete(`/api/profiles/${profile}/drafts/${draft}`)
    expect(ctx.store.drafts.insertions(draft)).toEqual([])
  })
})
