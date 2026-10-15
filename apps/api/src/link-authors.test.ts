import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_AUTHORS } from '@lfwa/core'
import { parseNames } from './db/names'
import { register, setup, type TestClient } from './test-helpers'

// The fake page fetcher names two authors for any address containing "authored" (and none otherwise).
const AUTHORED = 'https://example.org/authored'
const PLAIN = 'https://example.org/plain'
const DETECTED = ['Ada Author', 'Bo Writer']

describe('who wrote a reading-list item', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let publication: string
  let idea: string
  const links = () => `/api/publications/${publication}/ideas/${idea}/links`
  const read = async () =>
    (await (await ada.get(`/api/publications/${publication}/ideas/${idea}`)).json()).links as {
      id: string
      url: string
      title: string
      authors: string[]
    }[]
  const add = (body: object) => ada.post(links(), body)
  const edit = (id: string, body: object) => ada.patch(`${links()}/${id}`, body)

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    publication = (await (await ada.get('/api/publications')).json())[0].id
    idea = (
      await (await ada.post(`/api/publications/${publication}/ideas`, { name: 'Rivers' })).json()
    ).id
  })

  describe('adding', () => {
    it('takes the authors the page names, along with its title', async () => {
      await add({ url: AUTHORED })
      expect(await read()).toMatchObject([{ title: expect.any(String), authors: DETECTED }])
    })

    it('has none for a page that names no one', async () => {
      await add({ url: PLAIN })
      expect((await read())[0]!.authors).toEqual([])
    })

    it('uses the authors the writer gives rather than the ones found', async () => {
      await add({ url: AUTHORED, authors: ['  Cy   Young '] })
      expect((await read())[0]!.authors).toEqual(['Cy Young'])
    })

    it('does not look the page up when the writer gave the title, so it knows no authors', async () => {
      await add({ url: AUTHORED, title: 'Mine' })
      expect((await read())[0]).toMatchObject({ title: 'Mine', authors: [] })
      expect(ctx.pageFetcher.calls).toEqual([])
    })

    it('refuses too many names, empty names and over-long names, in words', async () => {
      const many = Array.from({ length: MAX_AUTHORS + 1 }, (_, i) => `Person ${i}`)
      const tooMany = await add({ url: PLAIN, authors: many })
      expect(tooMany.status).toBe(400)
      expect((await tooMany.json()).error).toContain(`up to ${MAX_AUTHORS} authors`)
      expect((await add({ url: PLAIN, authors: ['  '] })).status).toBe(400)
      expect((await add({ url: PLAIN, authors: ['x'.repeat(101)] })).status).toBe(400)
      expect(await read()).toEqual([])
    })
  })

  describe('editing', () => {
    const only = async () => (await read())[0]!

    beforeEach(async () => {
      await add({ url: AUTHORED })
    })

    it('sets exactly the authors given, without looking the page up', async () => {
      const link = await only()
      ctx.pageFetcher.calls.length = 0
      await edit(link.id, { url: link.url, title: link.title, authors: ['Cy Young'] })
      expect((await only()).authors).toEqual(['Cy Young'])
      expect(ctx.pageFetcher.calls).toEqual([])
    })

    it('leaves them alone when only the title changes', async () => {
      const link = await only()
      await edit(link.id, { url: link.url, title: 'A better title' })
      expect(await only()).toMatchObject({ title: 'A better title', authors: DETECTED })
    })

    it('leaves a name the writer entered alone when the title is looked up again', async () => {
      const link = await only()
      await edit(link.id, { url: link.url, title: link.title, authors: ['Cy Young'] })
      await edit(link.id, { url: link.url, title: '' }) // "look the title up again", authors not mentioned
      expect(await only()).toMatchObject({ authors: ['Cy Young'] })
    })

    it('looks the authors up again when asked with an empty list and a blank title', async () => {
      const link = await only()
      await edit(link.id, { url: link.url, title: link.title, authors: ['Cy Young'] })
      await edit(link.id, { url: link.url, title: '', authors: [] })
      expect((await only()).authors).toEqual(DETECTED)
    })

    it('clears them when given an empty list and the title is kept', async () => {
      const link = await only()
      await edit(link.id, { url: link.url, title: link.title, authors: [] })
      expect((await only()).authors).toEqual([])
    })

    it("takes the new page's authors when the address changes, or none if it names no one", async () => {
      const link = await only()
      await edit(link.id, { url: 'https://example.org/also-authored', title: link.title })
      expect((await only()).authors).toEqual(DETECTED)
      await edit(link.id, { url: PLAIN, title: '' })
      expect((await only()).authors).toEqual([]) // the old page's authors do not follow the item to a new page
    })

    it("keeps the writer's authors when the address changes and they are given too", async () => {
      const link = await only()
      await edit(link.id, { url: PLAIN, title: 'Mine', authors: ['Cy Young'] })
      expect(await only()).toMatchObject({ url: PLAIN, authors: ['Cy Young'] })
    })

    it('keeps what a failed lookup could not find, rather than wiping the authors', async () => {
      const link = await only()
      await edit(link.id, { url: link.url, title: '' })
      expect((await only()).authors).toEqual(DETECTED) // the fake finds them again; nothing is lost either way
    })
  })

  describe('as they were when words went into a draft', () => {
    it('are recorded with the source, and do not change when the item later does', async () => {
      await add({ url: AUTHORED })
      const item = (await read())[0]!
      const note = await (
        await ada.post(`/api/publications/${publication}/ideas/${idea}/notes`, {
          text: 'A quote.',
          readingItemId: item.id,
          quote: true,
        })
      ).json()
      const draft = (
        await (
          await ada.post(`/api/publications/${publication}/ideas/${idea}/drafts`, {
            title: 'Part 1',
          })
        ).json()
      ).id
      const insertions = `/api/publications/${publication}/drafts/${draft}/insertions`
      const res = await ada.post(insertions, { noteId: note.id, text: '> A quote.' })
      expect((await res.json()).source).toMatchObject({ authors: DETECTED })

      await edit(item.id, { url: item.url, title: item.title, authors: ['Someone Else'] })
      expect((await (await ada.get(insertions)).json())[0].source.authors).toEqual(DETECTED)
    })
  })
})

describe('the stored list of authors', () => {
  it('reads as no one, not as an error, when it is not a list of names', () => {
    expect(parseNames('["Ada","Bo"]')).toEqual(['Ada', 'Bo'])
    expect(parseNames('not json')).toEqual([])
    expect(parseNames('{"a":1}')).toEqual([])
    expect(parseNames('["Ada", 3, null]')).toEqual(['Ada'])
    expect(parseNames(null)).toEqual([])
  })
})
