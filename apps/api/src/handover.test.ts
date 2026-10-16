import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
  allRows,
  createDraft,
  register,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

type State = {
  editorId: string
  editorName: string
  offer: { id: string; toId: string; toName: string } | null
  asks: { id: string; byId: string; byName: string }[]
  history: {
    kind: string
    status: string
    actorName: string | null
    memberName: string | null
    automatic: boolean
  }[]
}

describe('handing over a draft (#155)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient // the publication's owner and the draft's editor
  let bob: TestClient // a member
  let cy: TestClient // another member
  let publication: string
  let draftId: string
  let ids: Record<'ada' | 'bob' | 'cy', string>
  const url = (tail = '') => `/api/publications/${publication}/drafts/${draftId}/handover${tail}`
  const state = async (c: TestClient): Promise<State> => (await c.get(url())).json()
  const editor = async () => (await state(ada)).editorId
  const idOf = async (c: TestClient) => (await (await c.get('/api/auth/me')).json()).id as string
  const settle = () => new Promise((r) => setTimeout(r, 0))

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    cy = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    await register(cy, 'cy@example.com', 'Cy')
    verifyAccounts(ctx, 'ada@example.com')
    publication = (await (await ada.get('/api/publications')).json())[0].id
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    await sharePublication(ctx, ada, publication, cy, 'cy@example.com')
    draftId = (await createDraft(ada, publication, { title: 'Meanders', body: 'x' })).id
    ids = { ada: await idOf(ada), bob: await idOf(bob), cy: await idOf(cy) }
  })

  describe('offer, accept, decline, withdraw', () => {
    it('keeps the editor until the offer is accepted, then moves the role', async () => {
      const offered = await ada.post(url('/offer'), { userId: ids.bob })
      expect(offered.status).toBe(200)
      expect(await offered.json()).toMatchObject({
        editorId: ids.ada,
        offer: { toId: ids.bob, toName: 'Bob' },
      })
      // Ada keeps the pen until Bob accepts.
      const draftUrl = `/api/publications/${publication}/drafts/${draftId}`
      const saved = await ada.put(draftUrl, { title: 'T', body: 'Still mine', version: 1 })
      expect(saved.status).toBe(200)

      const accepted = await bob.post(url('/offer/accept'), {})
      expect(accepted.status).toBe(200)
      expect(await accepted.json()).toMatchObject({
        editorId: ids.bob,
        editorName: 'Bob',
        offer: null,
        history: [{ kind: 'offer', status: 'accepted', actorName: 'Ada', memberName: 'Bob' }],
      })
      expect((await ada.put(draftUrl, { title: 'T', body: 'x', version: 2 })).status).toBe(403)
      expect((await bob.put(draftUrl, { title: 'T', body: 'Bob', version: 2 })).status).toBe(200)
    })

    it('lets the member decline, and the editor withdraw, leaving the editor as it was', async () => {
      await ada.post(url('/offer'), { userId: ids.bob })
      expect((await bob.post(url('/offer/decline'), {})).status).toBe(200)
      expect(await editor()).toBe(ids.ada)
      expect((await state(ada)).history[0]).toMatchObject({ status: 'declined' })

      await ada.post(url('/offer'), { userId: ids.cy }) // a new offer is possible once the last one is closed
      const withdrawn = await ada.delete(url('/offer'))
      expect((await withdrawn.json()).offer).toBeNull()
      expect((await state(ada)).history[0]).toMatchObject({ status: 'withdrawn' })
      expect((await cy.post(url('/offer/accept'), {})).status).toBe(404) // nothing left to accept
    })

    it('allows one open offer per draft', async () => {
      await ada.post(url('/offer'), { userId: ids.bob })
      const second = await ada.post(url('/offer'), { userId: ids.cy })
      expect(second.status).toBe(409)
      expect((await state(ada)).offer?.toId).toBe(ids.bob)
    })

    it('lets only the editor offer or withdraw, and only the offered member answer', async () => {
      expect((await bob.post(url('/offer'), { userId: ids.cy })).status).toBe(403)
      await ada.post(url('/offer'), { userId: ids.bob })
      expect((await bob.delete(url('/offer'))).status).toBe(403)
      for (const answer of ['accept', 'decline']) {
        expect((await cy.post(url(`/offer/${answer}`), {})).status).toBe(404)
        expect((await ada.post(url(`/offer/${answer}`), {})).status).toBe(404)
      }
      expect(await editor()).toBe(ids.ada)
    })

    it('offers only to another member of the publication', async () => {
      expect((await ada.post(url('/offer'), { userId: ids.ada })).status).toBe(400)
      const eve = ctx.client()
      await register(eve, 'eve@example.com', 'Eve')
      expect((await ada.post(url('/offer'), { userId: await idOf(eve) })).status).toBe(400)
      expect((await ada.post(url('/offer'), {})).status).toBe(400)
    })

    it('is private to the publication', async () => {
      const eve = ctx.client()
      await register(eve, 'eve@example.com', 'Eve')
      expect((await eve.get(url())).status).toBe(404)
      expect((await eve.post(url('/asks'), {})).status).toBe(404)
    })

    it('emails the offered member a link to the draft, and nobody else', async () => {
      const before = ctx.mailer.outbox.length
      await ada.post(url('/offer'), { userId: ids.bob })
      await settle()
      const sent = ctx.mailer.outbox.slice(before)
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({
        to: 'bob@example.com',
        subject: 'Ada has offered you a draft',
      })
      expect(sent[0]!.text).toContain(`/p/${publication}/drafts/${draftId}`)

      await bob.post(url('/offer/decline'), {})
      await ada.post(url('/offer'), { userId: ids.cy })
      await ada.delete(url('/offer'))
      await cy.post(url('/asks'), {})
      await settle()
      expect(ctx.mailer.outbox.length).toBe(before + 2) // only the two offers: declining, withdrawing and asking send nothing
    })

    it('throttles offers', async () => {
      for (let i = 0; i < 20; i++) {
        expect((await ada.post(url('/offer'), { userId: ids.bob })).status).toBe(200)
        await ada.delete(url('/offer'))
      }
      expect((await ada.post(url('/offer'), { userId: ids.bob })).status).toBe(429)
    })
  })

  describe('asking', () => {
    it('only prompts the editor, and changes nothing', async () => {
      const asked = await bob.post(url('/asks'), {})
      expect(asked.status).toBe(200)
      expect(await asked.json()).toMatchObject({
        editorId: ids.ada,
        asks: [{ byId: ids.bob, byName: 'Bob' }],
      })
      expect(await editor()).toBe(ids.ada)
      expect((await bob.post(url('/asks'), {})).status).toBe(409) // once is enough
      expect((await ada.post(url('/asks'), {})).status).toBe(400) // the editor has it already
    })

    it('can be withdrawn by the asker or set aside by the editor, but not by anyone else', async () => {
      const first = (await (await bob.post(url('/asks'), {})).json()).asks[0].id
      expect((await cy.delete(url(`/asks/${first}`))).status).toBe(403)
      expect((await (await bob.delete(url(`/asks/${first}`))).json()).asks).toEqual([])
      expect((await state(ada)).history[0]).toMatchObject({ kind: 'ask', status: 'withdrawn' })

      const second = (await (await bob.post(url('/asks'), {})).json()).asks[0].id
      expect((await (await ada.delete(url(`/asks/${second}`))).json()).asks).toEqual([])
      expect((await state(ada)).history[0]).toMatchObject({ status: 'dismissed' })
      expect((await ada.delete(url(`/asks/${second}`))).status).toBe(404)
    })

    it('is answered when the editor offers the draft and the asker accepts', async () => {
      await bob.post(url('/asks'), {})
      await ada.post(url('/offer'), { userId: ids.bob })
      expect((await state(ada)).asks).toHaveLength(1) // still open until it is accepted
      await bob.post(url('/offer/accept'), {})
      const after = await state(bob)
      expect(after.asks).toEqual([])
      expect(after.history.find((h) => h.kind === 'ask')).toMatchObject({ status: 'fulfilled' })
    })
  })

  describe('reassigning', () => {
    it('lets an owner move the role without the editor, and records it', async () => {
      ctx.store.publications.setRole(publication, ids.bob, 'owner')
      ctx.store.drafts.setEditor(draftId, ids.cy) // Cy is the (absent) editor
      await cy.post(url('/offer'), { userId: ids.ada })
      const done = await bob.post(url('/reassign'), { userId: ids.bob })
      expect(done.status).toBe(200)
      expect(await done.json()).toMatchObject({
        editorId: ids.bob,
        offer: null, // the absent editor's offer lapses
        history: [
          { kind: 'reassign', status: 'done', actorName: 'Bob', memberName: 'Bob' },
          { kind: 'offer', status: 'withdrawn' },
        ],
      })
    })

    it('is for owners, and for another member', async () => {
      expect((await bob.post(url('/reassign'), { userId: ids.bob })).status).toBe(403)
      expect((await ada.post(url('/reassign'), { userId: ids.ada })).status).toBe(400)
      expect((await ada.post(url('/reassign'), { userId: 'nobody' })).status).toBe(400)
      expect(await editor()).toBe(ids.ada)
    })
  })

  describe('when people go', () => {
    async function bobEditsOfferAndLeaves(keepName?: boolean) {
      ctx.store.drafts.setEditor(draftId, ids.bob)
      await bob.post(url('/offer'), { userId: ids.cy })
      await cy.post(url('/asks'), {})
      const gone = await bob.delete('/api/account', {
        password: PASSWORD,
        ...(keepName === undefined ? {} : { keepName }),
      })
      expect(gone.status).toBe(204)
    }

    it('closes what they had open, passes the draft to an owner and logs that, keeping their name', async () => {
      await bobEditsOfferAndLeaves()
      expect(await state(ada)).toMatchObject({
        editorId: ids.ada,
        offer: null,
        history: [
          { kind: 'reassign', status: 'done', automatic: true, memberName: 'Ada', actorName: null },
          { kind: 'ask', status: 'pending', actorName: 'Cy', memberName: 'Bob' }, // Cy's ask goes to Ada now
          { kind: 'offer', status: 'withdrawn', actorName: 'Bob', memberName: 'Cy' },
        ],
      })
    })

    it('leaves no trace of their name in the log if they chose not to keep it', async () => {
      await bobEditsOfferAndLeaves(false)
      const history = (await state(ada)).history
      expect(history.find((h) => h.kind === 'offer')).toMatchObject({ actorName: null })
      expect(JSON.stringify(allRows(ctx))).not.toContain('"Bob"')
    })

    it('logs the hand-over when an editor is removed from the publication', async () => {
      ctx.store.drafts.setEditor(draftId, ids.bob)
      await ada.delete(`/api/publications/${publication}/members/${ids.bob}`)
      expect((await state(ada)).history[0]).toMatchObject({
        kind: 'reassign',
        automatic: true,
        memberName: 'Ada',
      })
    })

    it('declines an offer to someone who leaves', async () => {
      await ada.post(url('/offer'), { userId: ids.cy })
      expect((await cy.delete(`/api/publications/${publication}/members/${ids.cy}`)).status).toBe(
        204,
      )
      expect(await state(ada)).toMatchObject({
        offer: null,
        history: [{ kind: 'offer', status: 'declined' }],
      })
    })
  })
})
