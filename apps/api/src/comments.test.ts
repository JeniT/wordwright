import { beforeEach, describe, expect, it } from 'vitest'
import { COMMENT_MAX_LENGTH, blockHash } from '@wordwright/core'
import {
  PASSWORD,
  allRows,
  createDraft,
  register,
  saveKey,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

type Comment = {
  id: string
  byAi: boolean
  authorId: string | null
  authorName: string | null
  block: string
  excerpt: string
  hash: string | null
  text: string
  reason: string | null
  resolved: boolean
}

describe('comments on a draft (#156)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient // the draft's editor
  let bob: TestClient // a member
  let cat: TestClient // an owner who is not the editor
  let publication: string
  let draft: { id: string; version: number }
  const base = () => `/api/publications/${publication}/drafts/${draft.id}`
  const list = async (c: TestClient): Promise<Comment[]> =>
    (await c.get(`${base()}/comments`)).json()
  const say = (c: TestClient, text: string, block = 'b1') =>
    c.post(`${base()}/comments`, { block, text })
  const idOf = async (c: TestClient) => (await (await c.get('/api/auth/me')).json()).id as string

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    cat = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bobbin')
    await register(cat, 'cat@example.com', 'Cat')
    verifyAccounts(ctx, 'ada@example.com')
    await saveKey(ada)
    publication = (await (await ada.get('/api/publications')).json())[0].id
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    await sharePublication(ctx, ada, publication, cat, 'cat@example.com')
    ctx.store.publications.setRole(publication, await idOf(cat), 'owner')
    draft = await createDraft(ada, publication, {
      title: 'T',
      body: 'First paragraph.\n\nSecond paragraph.',
    })
  })

  describe('adding', () => {
    it('lets any member comment on a paragraph, keeping where it is and who wrote it', async () => {
      const res = await say(bob, 'This drags.', 'b2')
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({
        byAi: false,
        authorId: await idOf(bob),
        authorName: 'Bobbin',
        block: 'b2',
        excerpt: 'Second paragraph.',
        hash: blockHash('Second paragraph.'),
        text: 'This drags.',
        reason: null,
        resolved: false,
      })
    })

    it('lets a member comment on the whole draft', async () => {
      const res = await say(bob, 'Lovely, overall.', 'whole')
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ block: 'whole', excerpt: '', hash: null })
    })

    it('lets the editor comment too', async () => {
      expect((await say(ada, 'A note to self.')).status).toBe(201)
    })

    it('refuses nothing to say, too much to say, and a paragraph that is not there', async () => {
      expect((await say(bob, '   ')).status).toBe(400)
      expect((await say(bob, 'x'.repeat(COMMENT_MAX_LENGTH + 1))).status).toBe(400)
      expect((await say(bob, 'x'.repeat(COMMENT_MAX_LENGTH))).status).toBe(201)
      const missing = await say(bob, 'Hello?', 'b9')
      expect(missing.status).toBe(400)
      expect((await missing.json()).error).toMatch(/Reload the page/)
      expect((await say(bob, 'Hello?', '__proto__')).status).toBe(400)
      expect((await bob.post(`${base()}/comments`, { text: 'No anchor.' })).status).toBe(400)
    })

    it('carries no replacement text: only the words, as written, and nothing else is read', async () => {
      const res = await bob.post(`${base()}/comments`, {
        block: 'b1',
        text: 'Cut this.',
        replacement: 'Insert this instead.',
      })
      expect(JSON.stringify(await res.json())).not.toContain('Insert this instead.')
    })

    it('has no cap, and does not use up the critique looks', async () => {
      for (let i = 0; i < 25; i++) expect((await say(bob, `Remark ${i}`)).status).toBe(201)
      expect(await list(bob)).toHaveLength(25)
      expect(await (await ada.get(`${base()}/critique`)).json()).toMatchObject({ used: 0 })
      expect(
        (await ada.post(`/api/publications/${publication}/assist/critique`, { draftId: draft.id }))
          .status,
      ).toBe(200)
    })

    it('needs sign-in and membership, on a draft that exists', async () => {
      expect((await say(ctx.client(), 'Hi')).status).toBe(401)
      const eve = ctx.client()
      await register(eve, 'eve@example.com', 'Eve')
      expect((await say(eve, 'Hi')).status).toBeGreaterThanOrEqual(403)
      expect((await eve.get(`${base()}/comments`)).status).toBeGreaterThanOrEqual(403)
      expect(
        (
          await bob.post(`/api/publications/${publication}/drafts/nope/comments`, {
            block: 'b1',
            text: 'Hi',
          })
        ).status,
      ).toBe(404)
      expect((await bob.get(`/api/publications/${publication}/drafts/nope/comments`)).status).toBe(
        404,
      )
    })
  })

  describe('who sees what (independent review)', () => {
    beforeEach(async () => {
      await say(bob, 'Bob on the opening.')
      await say(cat, 'Cat on the opening.', 'b2')
      await say(ada, 'Ada to herself.', 'whole')
      expect(
        (await ada.post(`/api/publications/${publication}/assist/critique`, { draftId: draft.id }))
          .status,
      ).toBe(200)
    })

    it('shows the editor every comment, labelled by author, the AI’s marked', async () => {
      const all = await list(ada)
      expect(all.map((c) => [c.text, c.authorName, c.byAi])).toEqual(
        expect.arrayContaining([
          ['Bob on the opening.', 'Bobbin', false],
          ['Cat on the opening.', 'Cat', false],
          ['Ada to herself.', 'Ada', false],
          ['Needs a stronger opening.', null, true],
        ]),
      )
      expect(all).toHaveLength(4)
    })

    it('shows everyone else only their own, whatever their role', async () => {
      expect((await list(bob)).map((c) => c.text)).toEqual(['Bob on the opening.'])
      expect((await list(cat)).map((c) => c.text)).toEqual(['Cat on the opening.'])
    })

    it('leaks nothing about the others’ comments through any route, not even a count', async () => {
      for (const c of [bob, cat]) {
        const critique = await (await c.get(`${base()}/critique`)).json()
        expect(critique).toEqual({ round: null, used: 0, allowed: 3 })
        const everything = JSON.stringify([
          await list(c),
          critique,
          await (await c.get(base())).json(),
          await (await c.get(`${base()}/insertions`)).json(),
        ])
        expect(everything).not.toContain('Ada to herself.')
        expect(everything).not.toContain('stronger opening')
        expect(everything).not.toContain(c === bob ? 'Cat on' : 'Bob on')
      }
    })

    it('does not tell a commenter anything by their reply to someone else’s comment id', async () => {
      const theirs = (await list(ada)).find((c) => c.text === 'Cat on the opening.')!
      const res = await bob.put(`${base()}/comments/${theirs.id}`, { resolved: true })
      expect(res.status).toBe(403)
      expect(JSON.stringify(await res.json())).not.toContain('Cat on')
    })
  })

  describe('resolving', () => {
    let mine: Comment
    beforeEach(async () => {
      mine = await (await say(bob, 'Bob on the opening.')).json()
    })

    it('is for the editor alone, even over their own comment', async () => {
      for (const c of [bob, cat]) {
        const res = await c.put(`${base()}/comments/${mine.id}`, { resolved: true })
        expect(res.status).toBe(403)
        expect((await res.json()).error).toContain('Ada')
      }
      expect((await list(ada))[0]!.resolved).toBe(false)
    })

    it('hides the comment from its author, keeps it for the editor, and brings it back', async () => {
      const done = await ada.put(`${base()}/comments/${mine.id}`, { resolved: true })
      expect(done.status).toBe(200)
      expect(await done.json()).toMatchObject([{ id: mine.id, resolved: true }])
      expect(await list(bob)).toEqual([]) // hidden, for everyone but the editor
      expect(await list(ada)).toMatchObject([{ id: mine.id, resolved: true }]) // not deleted
      const back = await ada.put(`${base()}/comments/${mine.id}`, { resolved: false })
      expect(await back.json()).toMatchObject([{ id: mine.id, resolved: false }])
      expect(await list(bob)).toMatchObject([{ id: mine.id }])
    })

    it('resolves the AI’s comments the same way', async () => {
      await ada.post(`/api/publications/${publication}/assist/critique`, { draftId: draft.id })
      const ai = (await list(ada)).find((c) => c.byAi)!
      const done = await (await ada.put(`${base()}/comments/${ai.id}`, { resolved: true })).json()
      expect(done.find((c: Comment) => c.id === ai.id).resolved).toBe(true)
    })

    it('says no for a comment the draft does not have, or one from another draft, and for nonsense', async () => {
      const other = await createDraft(ada, publication, { title: 'U', body: 'Other.' })
      expect(
        (
          await ada.put(`/api/publications/${publication}/drafts/${other.id}/comments/${mine.id}`, {
            resolved: true,
          })
        ).status,
      ).toBe(404)
      expect((await ada.put(`${base()}/comments/nope`, { resolved: true })).status).toBe(404)
      expect((await ada.put(`${base()}/comments/${mine.id}`, { resolved: 'yes' })).status).toBe(400)
      expect((await list(ada))[0]!.resolved).toBe(false)
    })
  })

  describe('when the passage is rewritten', () => {
    it('keeps the comment open, never resolving it, with the words it was about', async () => {
      const mine: Comment = await (await say(bob, 'Tighten this.', 'b2')).json()
      const saved = await ada.put(base(), {
        title: 'T',
        body: 'First paragraph.\n\nSomething else entirely.',
        version: draft.version,
      })
      expect(saved.status).toBe(200)
      expect(await list(bob)).toMatchObject([
        {
          id: mine.id,
          excerpt: 'Second paragraph.',
          hash: blockHash('Second paragraph.'),
          resolved: false,
        },
      ])
    })
  })

  describe('the AI boundary', () => {
    it('never sends a person’s comment to the LLM: critique sends only the title and body', async () => {
      await say(bob, 'SECRET-HUMAN-REMARK on the opening.')
      await say(ada, 'SECRET-EDITOR-REMARK', 'whole')
      const before = ctx.llmCalls.length
      const res = await ada.post(`/api/publications/${publication}/assist/critique`, {
        draftId: draft.id,
      })
      expect(res.status).toBe(200)
      const requests = ctx.llmCalls.slice(before).map((c) => c.request)
      expect(requests).toHaveLength(1)
      const sent = JSON.stringify(requests)
      expect(sent).not.toContain('SECRET')
      expect(requests[0]!.messages).toEqual([
        { role: 'user', content: '# T\n\n[b1] First paragraph.\n\n[b2] Second paragraph.' },
      ])
    })

    it('does not send the AI’s earlier comments back to it either', async () => {
      await ada.post(`/api/publications/${publication}/assist/critique`, { draftId: draft.id })
      const before = ctx.llmCalls.length
      await ada.post(`/api/publications/${publication}/assist/critique`, { draftId: draft.id })
      expect(JSON.stringify(ctx.llmCalls.slice(before))).not.toContain('stronger opening')
    })
  })

  describe('names and account deletion', () => {
    it('keeps a commenter’s name after they leave the publication', async () => {
      await say(bob, 'Bob was here.')
      const left = await bob.delete(`/api/publications/${publication}/members/${await idOf(bob)}`)
      expect(left.status).toBe(204)
      expect(await list(ada)).toMatchObject([{ authorName: 'Bobbin', text: 'Bob was here.' }])
    })

    it('keeps their name when they delete their account and choose to', async () => {
      await say(bob, 'Bob was here.')
      const gone = await bob.delete('/api/account', {
        confirmEmail: 'bob@example.com',
        password: PASSWORD,
        keepName: true,
      })
      expect(gone.status).toBe(204)
      expect(await list(ada)).toMatchObject([
        { authorName: 'Bobbin', authorId: null, text: 'Bob was here.' },
      ])
    })

    it('keeps the comment but no trace of their name when they choose not to', async () => {
      await say(bob, 'Bob was here.')
      const gone = await bob.delete('/api/account', {
        confirmEmail: 'bob@example.com',
        password: PASSWORD,
        keepName: false,
      })
      expect(gone.status).toBe(204)
      expect(await list(ada)).toMatchObject([
        { authorName: null, authorId: null, text: 'Bob was here.' },
      ])
      expect(JSON.stringify(allRows(ctx))).not.toContain('Bobbin')
    })

    it('goes with the draft', async () => {
      const mine: Comment = await (await say(bob, 'Bob was here.')).json()
      await ada.delete(base())
      expect(ctx.store.comments.get(draft.id, mine.id)).toBeUndefined()
    })
  })
})
