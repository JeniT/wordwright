import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
  createDraft,
  lastReviewToken,
  register,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

type Preview = {
  ideas: number
  drafts: number
  notes: number
  links: number
  losingAccess: string[]
  problem: string | null
}

describe('moving ideas to another publication (#194)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient // owner of both publications
  let bob: TestClient // a member of the source only
  let cy: TestClient // a member of both
  let source: string
  let dest: string
  let idea: string // an idea with a draft, a note and a link, in the source
  let draft: string
  const api = (p: string) => `/api/publications/${p}`
  const move = (c: TestClient, ids: string[], to = dest, from = source) =>
    c.post(`${api(from)}/move/ideas`, { ids, to: { publicationId: to } })
  const preview = (c: TestClient, ids: string[], to = dest) =>
    c.post(`${api(source)}/move/ideas/preview`, { ids, to: { publicationId: to } })
  const idOf = async (c: TestClient) => (await (await c.get('/api/auth/me')).json()).id as string
  const ideasIn = async (c: TestClient, p: string): Promise<{ id: string }[]> =>
    (await c.get(`${api(p)}/ideas`)).json()

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    cy = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    await register(cy, 'cy@example.com', 'Cy')
    verifyAccounts(ctx, 'ada@example.com')
    source = (await (await ada.get('/api/publications')).json())[0].id
    dest = (await (await ada.post('/api/publications', { name: 'Second' })).json()).id
    await sharePublication(ctx, ada, source, bob, 'bob@example.com')
    await sharePublication(ctx, ada, source, cy, 'cy@example.com')
    await sharePublication(ctx, ada, dest, cy, 'cy@example.com')
    const made = await createDraft(ada, source, { title: 'Meanders', body: 'Rivers bend.' })
    draft = made.id
    idea = (await (await ada.get(`${api(source)}/ideas`)).json())[0].id
    await ada.post(`${api(source)}/ideas/${idea}/notes`, { text: 'A note' })
    await ada.post(`${api(source)}/ideas/${idea}/links`, { url: 'https://a.example/' })
  })

  describe('what moves', () => {
    it('takes the idea whole: drafts, notes, links, comments and critique, and nothing stays behind', async () => {
      await bob.post(`${api(source)}/drafts/${draft}/comments`, { block: 'b1', text: 'Nice.' })
      ctx.store.critiques.add(draft, { summary: 'Fine', ready: false })
      const res = await move(ada, [idea])
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ publicationId: dest, ideaIds: [idea] })

      expect(await ideasIn(ada, source)).toEqual([])
      expect((await ideasIn(ada, dest)).map((i) => i.id)).toEqual([idea])
      const moved = await (await ada.get(`${api(dest)}/ideas/${idea}`)).json()
      expect(moved).toMatchObject({ publicationId: dest, drafts: [{ id: draft }] })
      expect(moved.links).toHaveLength(1)
      expect(await (await ada.get(`${api(dest)}/ideas/${idea}/notes`)).json()).toHaveLength(1)
      expect((await ada.get(`${api(dest)}/drafts/${draft}`)).status).toBe(200)
      // Comments keep their names and the critique keeps its look (the limit is not reset).
      const comments = await (await ada.get(`${api(dest)}/drafts/${draft}/comments`)).json()
      expect(comments.map((c: { text: string }) => c.text)).toContain('Nice.')
      expect(JSON.stringify(comments)).toContain('Bob')
      expect(ctx.store.critiques.count(draft)).toBe(1)
      // The old address no longer finds it.
      expect((await ada.get(`${api(source)}/ideas/${idea}`)).status).toBe(404)
      expect((await ada.get(`${api(source)}/drafts/${draft}`)).status).toBe(404)
    })

    it('moves several ideas, in one go or not at all', async () => {
      const other = (await (await ada.post(`${api(source)}/ideas`, { name: 'Lakes' })).json()).id
      expect((await move(ada, [idea, 'no-such-idea'])).status).toBe(404)
      expect(await ideasIn(ada, dest)).toEqual([])
      expect((await move(ada, [idea, other])).status).toBe(200)
      expect((await ideasIn(ada, dest)).map((i) => i.id).sort()).toEqual([idea, other].sort())
    })

    it('stops an article coming from a feed it no longer belongs to', async () => {
      const feed = ctx.store.sources.add(source, 'https://news.example/feed')
      const item = ctx.store.reading.add(
        source,
        idea,
        { url: 'https://b.example/', title: 'B', sourceId: feed.id },
        'feed',
      )
      await move(ada, [idea])
      const row = ctx.db
        .prepare('SELECT publication_id, source_id FROM idea_links WHERE id = ?')
        .get(item.id)
      expect(row).toEqual({ publication_id: dest, source_id: null })
    })

    it('goes with the publication it was moved to', async () => {
      await move(ada, [idea])
      await ada.delete(api(dest))
      expect(ctx.store.drafts.getById(draft)).toBeUndefined()
    })
  })

  describe('who may', () => {
    it('lets any member of both move an idea with no drafts', async () => {
      const bare = (await (await cy.post(`${api(source)}/ideas`, { name: 'Bare' })).json()).id
      expect((await move(cy, [bare])).status).toBe(200)
      expect((await ideasIn(cy, dest)).map((i) => i.id)).toEqual([bare])
    })

    it('lets only an owner of the source move an idea that has drafts', async () => {
      const res = await move(cy, [idea])
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe(
        'Only an owner of ' +
          (await (await ada.get(api(source))).json()).name +
          ' can move an idea that has drafts.',
      )
      expect((await ideasIn(ada, source)).map((i) => i.id)).toContain(idea)
    })

    it('refuses a destination the person does not belong to, as if it did not exist', async () => {
      const res = await move(bob, [idea])
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Not found' })
      expect((await move(ada, [idea], 'no-such-publication')).status).toBe(404)
      expect((await preview(bob, [idea])).status).toBe(404)
    })

    it('refuses the same publication, and ideas that are not in the source', async () => {
      expect((await move(ada, [idea], source)).status).toBe(400)
      const elsewhere = (await (await ada.post(`${api(dest)}/ideas`, { name: 'There' })).json()).id
      expect((await move(ada, [elsewhere])).status).toBe(404)
    })

    it('is for members of the source only, and not for reviewer-only accounts', async () => {
      const eve = ctx.client()
      await register(eve, 'eve@example.com', 'Eve')
      expect((await move(eve, [idea])).status).toBe(404)
      const sent = await ada.post(`${api(source)}/drafts/${draft}/send-for-review`, {
        emails: ['rae@example.com'],
      })
      expect(sent.status).toBe(202)
      await new Promise((r) => setTimeout(r, 0))
      const rae = ctx.client()
      const joined = await rae.post('/api/auth/register-reviewer', {
        token: lastReviewToken(ctx.mailer),
        name: 'Rae',
        password: PASSWORD,
      })
      expect(joined.status).toBe(201)
      expect((await move(rae, [idea])).status).toBe(404)
    })
  })

  describe('the draft’s editor', () => {
    it('must belong to the destination, or the move is refused whole, saying what to do', async () => {
      // Bob edits a draft in the source but is not a member of the destination.
      const bobs = await createDraft(bob, source, { title: 'Bob’s', body: 'x' })
      const bobsIdea = (await ideasIn(ada, source)).find((i) => i.id !== idea)!.id
      const res = await move(ada, [idea, bobsIdea])
      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(
        /^Ask Bob to join Second first, or hand the draft over\.$/,
      )
      expect(await ideasIn(ada, dest)).toEqual([])
      expect((await ada.get(`${api(source)}/drafts/${bobs.id}`)).status).toBe(200)
    })

    it('can be someone who does belong to it', async () => {
      const offered = await ada.post(`${api(source)}/drafts/${draft}/handover/offer`, {
        userId: await idOf(cy),
      })
      expect(offered.status).toBe(200)
      expect(
        (await cy.post(`${api(source)}/drafts/${draft}/handover/offer/accept`, {})).status,
      ).toBe(200)
      expect((await move(ada, [idea])).status).toBe(200)
      const state = await (await cy.get(`${api(dest)}/drafts/${draft}/handover`)).json()
      expect(state.editorId).toBe(await idOf(cy))
    })

    it('closes an open offer to someone who will not be able to see the draft', async () => {
      // Hand over to Cy (a member of both) first so the move is allowed, then offer back to Bob.
      await ada.post(`${api(source)}/drafts/${draft}/handover/offer`, { userId: await idOf(cy) })
      await cy.post(`${api(source)}/drafts/${draft}/handover/offer/accept`, {})
      await cy.post(`${api(source)}/drafts/${draft}/handover/offer`, { userId: await idOf(bob) })
      await move(ada, [idea])
      const state = await (await ada.get(`${api(dest)}/drafts/${draft}/handover`)).json()
      expect(state.offer).toBeNull()
    })
  })

  describe('people who lose sight of it', () => {
    it('cannot open it any more, and their past comments stay', async () => {
      await bob.post(`${api(source)}/drafts/${draft}/comments`, { block: 'b1', text: 'Mine.' })
      await move(ada, [idea])
      expect((await bob.get(`${api(dest)}/drafts/${draft}`)).status).toBe(404)
      expect((await bob.get(`${api(source)}/drafts/${draft}`)).status).toBe(404)
      const comments = await (await ada.get(`${api(dest)}/drafts/${draft}/comments`)).json()
      expect(comments).toMatchObject([{ text: 'Mine.', authorName: 'Bob' }])
      // They are not made members of the destination.
      expect((await bob.get(api(dest))).status).toBeGreaterThanOrEqual(403)
    })

    it('leaves a review that was opened for someone as it was', async () => {
      const sent = await ada.post(`${api(source)}/drafts/${draft}/send-for-review`, {
        emails: ['rae@example.com'],
      })
      expect(sent.status).toBe(202)
      await new Promise((r) => setTimeout(r, 0))
      const rae = ctx.client()
      await rae.post('/api/auth/register-reviewer', {
        token: lastReviewToken(ctx.mailer),
        name: 'Rae',
        password: PASSWORD,
      })
      const before = await (await rae.get('/api/reviews')).json()
      expect(before).toMatchObject([{ state: 'open' }])
      await move(ada, [idea]) // an open review does not block a move
      const after = await (await rae.get('/api/reviews')).json()
      expect(after).toMatchObject([{ state: 'open', publicationName: 'Second' }])
      expect((await rae.get(`/api/reviews/${after[0].id}`)).status).toBe(200)
    })
  })

  describe('the confirmation', () => {
    it('counts what moves and names the people who will lose access', async () => {
      const res = await preview(ada, [idea])
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual<Preview>({
        ideas: 1,
        drafts: 1,
        notes: 1,
        links: 1,
        losingAccess: ['Bob'],
        problem: null,
      })
      // Nothing moved.
      expect((await ideasIn(ada, source)).map((i) => i.id)).toEqual([idea])
    })

    it('says what is in the way instead of refusing', async () => {
      const refused = await (await preview(cy, [idea])).json()
      expect(refused.problem).toMatch(/^Only an owner of /)
      await createDraft(bob, source, { title: 'Bob’s', body: 'x' })
      const ids = (await ideasIn(ada, source)).map((i) => i.id)
      expect((await (await preview(ada, ids)).json()).problem).toBe(
        'Ask Bob to join Second first, or hand the draft over.',
      )
    })
  })
})
