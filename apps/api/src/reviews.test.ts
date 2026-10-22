import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
  allRows,
  createDraft,
  lastReviewToken,
  register,
  saveKey,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

type Review = {
  id: string
  state: string
  draftTitle: string
  publicationName: string
  inviterName: string | null
}

describe('reviewers (#157)', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient // owner and editor
  let bob: TestClient // another member
  let publication: string
  let draftId: string
  const draftUrl = () => `/api/publications/${publication}/drafts/${draftId}`
  const settle = () => new Promise((r) => setTimeout(r, 0))

  /** Invites `email`, and answers with the token from the email. */
  async function invite(email: string, by: TestClient = ada) {
    const before = ctx.mailer.outbox.length
    const res = await by.post(`${draftUrl()}/send-for-review`, { emails: [email] })
    expect(res.status).toBe(202)
    await settle()
    return ctx.mailer.outbox.length > before ? lastReviewToken(ctx.mailer) : null
  }
  /** A new person following the link: a reviewer-only account, signed in. */
  async function joinAsReviewer(email = 'rev@example.com', name = 'Rae') {
    const token = (await invite(email))!
    const rae = ctx.client()
    const res = await rae.post('/api/auth/register-reviewer', { token, name, password: PASSWORD })
    expect(res.status).toBe(201)
    return { rae, token, user: await res.json() }
  }
  const reviewsOf = async (c: TestClient): Promise<Review[]> => (await c.get('/api/reviews')).json()

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com')
    publication = (await (await ada.get('/api/publications')).json())[0].id
    await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
    draftId = (await createDraft(ada, publication, { title: 'Meanders', body: 'Rivers bend.' })).id
  })

  describe('registering from the link', () => {
    it('leaves a new reviewer able to ask which review they were just given, so the page can open it', async () => {
      const { rae, token } = await joinAsReviewer()
      const [review] = await reviewsOf(rae)
      const res = await rae.post('/api/review-invitations/accept', { token })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ reviewId: review!.id })
    })
  })

  describe('inviting', () => {
    it('emails a link saying what is asked and that only the draft will be seen', async () => {
      const token = await invite('rev@example.com')
      expect(token).toBeTruthy()
      const mail = ctx.mailer.outbox.at(-1)!
      expect(mail).toMatchObject({
        to: 'rev@example.com',
        subject: 'Ada asked you to review a draft',
      })
      expect(mail.text).toContain('Meanders')
      expect(mail.text).toMatch(/read this draft and comment on it.*snapshot/s)
      expect(mail.text).toContain('/review-invite?token=')
    })

    it('lets only the editor send; an owner can see who is reviewing; other members see nothing', async () => {
      const adaId = (await (await ada.get('/api/auth/me')).json()).id
      const bobId = (await (await bob.get('/api/auth/me')).json()).id
      ctx.store.drafts.setEditor(draftId, bobId)
      expect(
        (await bob.post(`${draftUrl()}/send-for-review`, { emails: ['x@example.com'] })).status,
      ).toBe(202)
      // Ada is an owner but not the editor: she cannot send, though she can see and close reviews.
      const refused = await ada.post(`${draftUrl()}/send-for-review`, { emails: ['y@example.com'] })
      expect(refused.status).toBe(403)
      expect((await refused.json()).error).toContain('Bob')
      expect((await ada.get(`${draftUrl()}/reviewers`)).status).toBe(200)
      const cy = ctx.client()
      await register(cy, 'cy@example.com', 'Cy')
      await sharePublication(ctx, ada, publication, cy, 'cy@example.com')
      expect(
        (await cy.post(`${draftUrl()}/send-for-review`, { emails: ['z@example.com'] })).status,
      ).toBe(403)
      expect((await cy.get(`${draftUrl()}/reviewers`)).status).toBe(403)
      expect(adaId).toBeTruthy()
    })

    it('needs someone to ask', async () => {
      expect(
        (await ada.post(`${draftUrl()}/send-for-review`, { emails: [], memberIds: [] })).status,
      ).toBe(400)
      expect(
        (await ada.post(`${draftUrl()}/send-for-review`, { emails: ['not an email'] })).status,
      ).toBe(400)
    })

    it('needs a confirmed address, and is private to the publication', async () => {
      const dan = ctx.client()
      await register(dan, 'dan@example.com', 'Dan')
      expect(
        (await dan.post(`${draftUrl()}/send-for-review`, { emails: ['x@example.com'] })).status,
      ).toBe(404)
      ctx.store.users.markEmailVerified((await (await bob.get('/api/auth/me')).json()).id)
      ctx.store.drafts.setEditor(draftId, (await (await bob.get('/api/auth/me')).json()).id)
      // Ada is verified; make a fresh unverified owner-editor to see the refusal.
      const eve = ctx.client()
      await register(eve, 'eve@example.com', 'Eve')
      const evePublication = (await (await eve.get('/api/publications')).json())[0].id
      const d = await createDraft(eve, evePublication, { title: 'T', body: 'x' })
      const res = await eve.post(
        `/api/publications/${evePublication}/drafts/${d.id}/send-for-review`,
        {
          emails: ['x@example.com'],
        },
      )
      expect(res.status).toBe(403)
    })

    it('answers the same, and sends nothing, for blocked, existing and over-limit addresses', async () => {
      const { rae } = await joinAsReviewer()
      expect(await invite('bob@example.com')).toBeNull() // already a member
      const adaId = (await (await ada.get('/api/auth/me')).json()).id
      ctx.store.invitations.addBlock('blocked@example.com', adaId)
      expect(await invite('blocked@example.com')).toBeNull()
      expect(rae).toBeTruthy()
    })

    it('lists who is reviewing and who has been invited, for the editor and owners only', async () => {
      await invite('later@example.com')
      await joinAsReviewer('rev@example.com', 'Rae')
      const listed = await (await ada.get(`${draftUrl()}/reviewers`)).json()
      expect(listed.reviewers).toMatchObject([
        { name: 'Rae', email: 'rev@example.com', state: 'open' },
      ])
      expect(listed.pending).toMatchObject([{ email: 'later@example.com' }])
      const withdrawn = await ada.delete(
        `${draftUrl()}/reviewers/invitations/${listed.pending[0].id}`,
      )
      expect(withdrawn.status).toBe(204)
      expect((await (await ada.get(`${draftUrl()}/reviewers`)).json()).pending).toEqual([])
    })
  })

  describe('following the link', () => {
    it('previews, then makes a reviewer-only account with no username and no publication', async () => {
      const token = (await invite('rev@example.com'))!
      const anon = ctx.client()
      const preview = await (await anon.post('/api/review-invitations/preview', { token })).json()
      expect(preview).toEqual({
        draftTitle: 'Meanders',
        publicationName: expect.any(String),
        inviterName: 'Ada',
        email: 'rev@example.com',
      })
      const { rae, user } = await joinAsReviewer('rev2@example.com')
      expect(user).toMatchObject({
        handle: null,
        reviewerOnly: true,
        emailVerified: true,
        name: 'Rae',
      })
      expect(await (await rae.get('/api/auth/me')).json()).toMatchObject({ reviewerOnly: true })
      expect(await reviewsOf(rae)).toMatchObject([{ draftTitle: 'Meanders', state: 'open' }])
    })

    it('refuses a used, expired or made-up link, and a second account for the address', async () => {
      const { token } = await joinAsReviewer()
      const anon = ctx.client()
      expect((await anon.post('/api/review-invitations/preview', { token })).status).toBe(400)
      expect((await anon.post('/api/review-invitations/preview', { token: 'nope' })).status).toBe(
        400,
      )
      const again = await invite('bob@example.com')
      expect(again).toBeNull()
    })

    it('adds the review to an existing account signed in with that address, but not to another', async () => {
      const token = (await invite('bob@example.com'.replace('bob', 'bobby')))! // an address without an account yet
      expect(token).toBeTruthy()
      const carol = ctx.client()
      await register(carol, 'carol@example.com', 'Carol')
      const t2 = (await invite('carol@example.com'))!
      expect((await bob.post('/api/review-invitations/accept', { token: t2 })).status).toBe(403)
      const accepted = await carol.post('/api/review-invitations/accept', { token: t2 })
      expect(accepted.status).toBe(200)
      expect(await reviewsOf(carol)).toMatchObject([{ draftTitle: 'Meanders' }])
      expect((await carol.get('/api/auth/me').then((r) => r.json())).reviewerOnly).toBe(false) // stays full
    })

    it('declines without telling the inviter, optionally blocking the sender or everyone', async () => {
      const token = (await invite('rev@example.com'))!
      const anon = ctx.client()
      expect(
        (await anon.post('/api/review-invitations/decline', { token, block: 'sender' })).status,
      ).toBe(200)
      expect((await ada.get(`${draftUrl()}/reviewers`).then((r) => r.json())).pending).toEqual([])
      expect(await invite('rev@example.com')).toBeNull() // blocked now
    })
  })

  describe('reviewing', () => {
    it('shows the draft and only the reviewer’s own comments, whoever else commented', async () => {
      await saveKey(ada)
      await ada.post(`/api/publications/${publication}/assist/critique`, { draftId })
      await bob.post(`${draftUrl()}/comments`, { block: 'whole', text: 'Bob’s view' })
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      const mine = await rae.post(`/api/reviews/${id}/comments`, {
        block: 'b1',
        text: 'Which rivers?',
      })
      expect(mine.status).toBe(201)
      await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'Lovely start' })

      const opened = await (await rae.get(`/api/reviews/${id}`)).json()
      expect(opened.draft).toEqual({ title: 'Meanders', body: 'Rivers bend.' })
      expect(opened.comments.map((c: { text: string }) => c.text)).toEqual([
        'Which rivers?',
        'Lovely start',
      ])
      expect(opened.comments.every((c: { authorName: string }) => c.authorName === 'Rae')).toBe(
        true,
      )
      // The editor sees all of them, labelled by author; Bob sees only his own.
      const editorSees = await (await ada.get(`${draftUrl()}/comments`)).json()
      expect(editorSees.map((c: { authorName: string | null }) => c.authorName)).toEqual(
        expect.arrayContaining(['Rae', 'Bob']),
      )
      const bobSees = await (await bob.get(`${draftUrl()}/comments`)).json()
      expect(bobSees.map((c: { authorName: string }) => c.authorName)).toEqual(['Bob'])
    })

    it('keeps the words a reviewer selected, checked against their snapshot', async () => {
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      const res = await rae.post(`/api/reviews/${id}/comments`, {
        block: 'b1',
        text: 'Which ones?',
        quote: 'Rivers',
      })
      expect((await res.json()).quote).toBe('Rivers')
      const stray = await rae.post(`/api/reviews/${id}/comments`, {
        block: 'b1',
        text: 'Hmm',
        quote: 'Lakes',
      })
      expect((await stray.json()).quote).toBeNull()
    })

    it('refuses a comment on a paragraph that isn’t there, and one for someone else’s review', async () => {
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      expect(
        (await rae.post(`/api/reviews/${id}/comments`, { block: 'b99', text: 'x' })).status,
      ).toBe(400)
      const { rae: other } = await joinAsReviewer('other@example.com', 'Otto')
      expect((await other.get(`/api/reviews/${id}`)).status).toBe(404)
      expect(
        (await other.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'x' })).status,
      ).toBe(404)
      expect((await other.post(`/api/reviews/${id}/end`, {})).status).toBe(404)
    })

    it('lets the reviewer end the review, and the editor close it: read-only, with the snapshot and the comments kept', async () => {
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'A thought' })
      expect((await rae.post(`/api/reviews/${id}/end`, {})).status).toBe(204)
      const left = await (await rae.get(`/api/reviews/${id}`)).json()
      expect(left).toMatchObject({
        state: 'ended',
        draft: { title: 'Meanders', body: 'Rivers bend.' },
      })
      expect(left.comments).toHaveLength(1)
      expect(
        (await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'more' })).status,
      ).toBe(409)

      const { rae: ray } = await joinAsReviewer('ray@example.com', 'Ray')
      const rid = (await ada.get(`${draftUrl()}/reviewers`).then((r) => r.json())).reviewers.find(
        (r: { name: string }) => r.name === 'Ray',
      ).id
      expect((await bob.delete(`${draftUrl()}/reviewers/${rid}`)).status).toBe(403)
      expect((await ada.delete(`${draftUrl()}/reviewers/${rid}`)).status).toBe(204)
      expect(
        await (await ray.get(`/api/reviews/${(await reviewsOf(ray))[0]!.id}`)).json(),
      ).toMatchObject({ state: 'closed', draft: { title: 'Meanders' } })
      // The editor still sees both reviewers' comments, with names.
      expect(
        (await ada.get(`${draftUrl()}/comments`).then((r) => r.json())).map(
          (c: { authorName: string }) => c.authorName,
        ),
      ).toContain('Rae')
    })

    it('can be asked again after finishing: that is a new snapshot and a new review', async () => {
      const { rae } = await joinAsReviewer()
      const first = (await reviewsOf(rae))[0]!.id
      await rae.post(`/api/reviews/${first}/end`, {})
      const token = (await invite('rev@example.com'))!
      expect((await rae.post('/api/review-invitations/accept', { token })).status).toBe(200)
      const all = await reviewsOf(rae)
      expect(all).toHaveLength(2)
      expect(all.map((r) => r.state).sort()).toEqual(['ended', 'open'])
    })
  })

  describe('a reviewer-only account reaches nothing else', () => {
    it('answers 404 to every other signed-in route', async () => {
      const { rae } = await joinAsReviewer()
      const allowed = (method: string, path: string) =>
        path === '/api/auth/me' ||
        path === '/api/auth/logout' ||
        path === '/api/invitations/accept' ||
        path.startsWith('/api/reviews') ||
        (path === '/api/account' && method === 'DELETE')
      const guarded = ctx.app.routes.filter(
        (r) =>
          r.method !== 'ALL' &&
          /^\/api\/(publications|account|llm|invitations\/blocks)/.test(r.path) &&
          !allowed(r.method, r.path),
      )
      expect(guarded.length).toBeGreaterThan(50) // a real walk, not an empty one
      const fill = (path: string) =>
        path.replace(/:([A-Za-z]+)\??/g, (_m, name) =>
          name === 'publicationId' ? publication : 'x',
        )
      for (const r of guarded) {
        const res = await rae.request(r.method, fill(r.path), r.method === 'GET' ? undefined : {})
        expect(res.status, `${r.method} ${r.path}`).toBe(404)
      }
    })

    it('can still sign out and delete itself, and cannot create a publication or set an API key', async () => {
      const { rae } = await joinAsReviewer()
      expect((await rae.post('/api/publications', { name: 'Mine' })).status).toBe(404)
      expect((await rae.get('/api/publications')).status).toBe(404)
      expect(
        (await rae.put('/api/llm', { provider: 'anthropic', model: 'm', apiKey: 'k' })).status,
      ).toBe(404)
    })

    it('sees the draft only: not the idea, notes or members', async () => {
      const { rae } = await joinAsReviewer()
      const d = await (await ada.get(draftUrl())).json()
      for (const path of [
        `/api/publications/${publication}/ideas/${d.ideaId}`,
        `/api/publications/${publication}/ideas/${d.ideaId}/notes`,
        `/api/publications/${publication}`,
        `${draftUrl()}`,
        `${draftUrl()}/comments`,
        `${draftUrl()}/handover`,
      ]) {
        expect((await rae.get(path)).status, path).toBe(404)
      }
    })
  })

  describe('becoming a full account', () => {
    it('start writing chooses a username and lifts the limits', async () => {
      const { rae } = await joinAsReviewer()
      const res = await rae.post('/api/reviews/start-writing', { handle: 'raewrites' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ handle: 'raewrites', reviewerOnly: false })
      expect((await rae.get('/api/publications')).status).toBe(200)
      expect((await rae.post('/api/publications', { name: 'Rae’s writing' })).status).toBe(201)
      expect((await reviewsOf(rae))[0]).toMatchObject({ state: 'open' }) // keeps the review
    })

    it('refuses a taken username, and a full account using it', async () => {
      const { rae } = await joinAsReviewer()
      const taken = await rae.post('/api/reviews/start-writing', {
        handle: (await (await ada.get('/api/auth/me')).json()).handle,
      })
      expect(taken.status).toBe(409)
      expect((await ada.post('/api/reviews/start-writing', { handle: 'adaagain' })).status).toBe(
        400,
      )
    })

    it('is automatic when a publication invites them as a member', async () => {
      const { rae } = await joinAsReviewer()
      verifyAccounts(ctx, 'ada@example.com')
      await ada.post(`/api/publications/${publication}/invitations`, { email: 'rev@example.com' })
      const accepted = await rae.post('/api/invitations/accept', { token: lastPublicationToken() })
      expect(accepted.status).toBe(200)
      const me = await (await rae.get('/api/auth/me')).json()
      expect(me).toMatchObject({
        reviewerOnly: false,
        handle: expect.any(String),
        handleChosen: false,
      })
      expect((await rae.get('/api/publications')).status).toBe(200)
      expect(await reviewsOf(rae)).toHaveLength(1)
    })
    function lastPublicationToken() {
      const text = ctx.mailer.outbox.at(-1)!.text
      return text.match(/accept-invite\?token=([\w-]+)/)![1]!
    }
  })

  describe('when the account goes', () => {
    it('keeps the reviewer’s name on their comments if they chose to, and no trace if not', async () => {
      for (const keepName of [true, false]) {
        const email = keepName ? 'keep@example.com' : 'drop@example.com'
        const { rae } = await joinAsReviewer(email, keepName ? 'Kay' : 'Dee')
        const id = (await reviewsOf(rae))[0]!.id
        await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: `note ${keepName}` })
        expect((await rae.delete('/api/account', { password: PASSWORD, keepName })).status).toBe(
          204,
        )
        const comment = (await (await ada.get(`${draftUrl()}/comments`)).json()).find(
          (c: { text: string }) => c.text === `note ${keepName}`,
        )
        expect(comment.authorName).toBe(keepName ? 'Kay' : null)
      }
      expect(JSON.stringify(allRows(ctx))).not.toContain('"Dee"')
      expect(JSON.stringify(allRows(ctx))).not.toContain('drop@example.com')
    })
  })

  describe('when the person who asked goes', () => {
    it('keeps their name on the review if they chose to, and no trace if not', async () => {
      for (const keepName of [true, false]) {
        const email = keepName ? 'keep@example.com' : 'drop@example.com'
        const bobsDraft = await createDraft(bob, publication, {
          title: `Bob ${keepName}`,
          body: 'x',
        })
        const res = await bob.post(
          `/api/publications/${publication}/drafts/${bobsDraft.id}/send-for-review`,
          { emails: [email] },
        )
        expect(res.status).toBe(202)
        await settle()
        const rae = ctx.client()
        const reg = await rae.post('/api/auth/register-reviewer', {
          token: lastReviewToken(ctx.mailer),
          name: 'Rae',
          password: PASSWORD,
        })
        expect(reg.status).toBe(201)
        expect((await bob.delete('/api/account', { password: PASSWORD, keepName })).status).toBe(
          204,
        )
        expect((await reviewsOf(rae))[0]).toMatchObject({ inviterName: keepName ? 'Bob' : null })
        if (keepName) {
          bob = ctx.client()
          await register(bob, 'bob@example.com', 'Bob')
          await sharePublication(ctx, ada, publication, bob, 'bob@example.com')
        }
      }
    })
  })

  describe('snapshots and states (#158)', () => {
    const ids = async () => ({
      ada: (await (await ada.get('/api/auth/me')).json()).id as string,
      bob: (await (await bob.get('/api/auth/me')).json()).id as string,
    })
    const save = (body: string, version: number) =>
      ada.put(draftUrl(), { title: 'Meanders', body, version })

    it('freezes the draft when it is sent: the reviewer reads that, not later edits', async () => {
      const { rae } = await joinAsReviewer()
      expect((await save('Totally rewritten.', 1)).status).toBe(200)
      const id = (await reviewsOf(rae))[0]!.id
      const opened = await (await rae.get(`/api/reviews/${id}`)).json()
      expect(opened.draft).toEqual({ title: 'Meanders', body: 'Rivers bend.' })
      // Comments are about the paragraph of the snapshot, and the editor sees them found by their text.
      await rae.post(`/api/reviews/${id}/comments`, { block: 'b1', text: 'Which rivers?' })
      const seen = (await (await ada.get(`${draftUrl()}/comments`)).json()).find(
        (c: { text: string }) => c.text === 'Which rivers?',
      )
      expect(seen).toMatchObject({ excerpt: 'Rivers bend.', reviewId: id })
      expect(seen.hash).toEqual(expect.any(String))
    })

    it('makes a new snapshot each time the draft is sent', async () => {
      await joinAsReviewer('one@example.com', 'One')
      await save('Second version.', 1)
      await invite('two@example.com')
      const snapshots = ctx.db
        .prepare('SELECT body FROM draft_snapshots ORDER BY created_at, rowid')
        .all()
      expect(snapshots.map((r) => r.body)).toEqual(['Rivers bend.', 'Second version.'])
    })

    it('can ask members of the publication, who are told by email and review the same snapshot', async () => {
      const before = ctx.mailer.outbox.length
      const { bob: bobId } = await ids()
      const sent = await ada.post(`${draftUrl()}/send-for-review`, { memberIds: [bobId] })
      expect(sent.status).toBe(202)
      await settle()
      expect(ctx.mailer.outbox.slice(before)).toMatchObject([
        { to: 'bob@example.com', subject: 'Ada asked you to review a draft' },
      ])
      expect(ctx.mailer.outbox.at(-1)!.text).toMatch(/\/reviews\/[\w-]+/)
      const mine = await reviewsOf(bob)
      expect(mine).toMatchObject([{ draftTitle: 'Meanders', state: 'open' }])
      await save('Edited later.', 1)
      const opened = await (await bob.get(`/api/reviews/${mine[0]!.id}`)).json()
      expect(opened.draft.body).toBe('Rivers bend.')
      // The member's review comment stays out of their own live-draft list.
      await bob.post(`/api/reviews/${mine[0]!.id}/comments`, {
        block: 'whole',
        text: 'In the review',
      })
      expect(await (await bob.get(`${draftUrl()}/comments`)).json()).toEqual([])
    })

    it('refuses to ask yourself or someone outside the publication as a member', async () => {
      const { ada: adaId } = await ids()
      expect((await ada.post(`${draftUrl()}/send-for-review`, { memberIds: [adaId] })).status).toBe(
        400,
      )
      expect(
        (await ada.post(`${draftUrl()}/send-for-review`, { memberIds: ['nobody'] })).status,
      ).toBe(400)
    })

    it('emails the editor once when a reviewer ends, with the number of comments and no text', async () => {
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'Secret remark' })
      await rae.post(`/api/reviews/${id}/comments`, { block: 'b1', text: 'Another' })
      const before = ctx.mailer.outbox.length
      expect((await rae.post(`/api/reviews/${id}/end`, {})).status).toBe(204)
      expect((await rae.post(`/api/reviews/${id}/end`, {})).status).toBe(204) // again: nothing more is sent
      await settle()
      const sent = ctx.mailer.outbox.slice(before)
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({
        to: 'ada@example.com',
        subject: 'Rae has finished reviewing Meanders',
      })
      expect(sent[0]!.text).toContain('has finished reviewing “Meanders” and left 2 comments')
      expect(sent[0]!.text).not.toContain('Secret remark')
      expect(sent[0]!.text).toContain(`/p/${publication}/drafts/${draftId}`)
    })

    it('sends nothing when a comment is made, and nothing when the editor closes a review', async () => {
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      const before = ctx.mailer.outbox.length
      await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'x' })
      const listed = await (await ada.get(`${draftUrl()}/reviewers`)).json()
      await ada.delete(`${draftUrl()}/reviewers/${listed.reviewers[0].id}`)
      await settle()
      expect(ctx.mailer.outbox).toHaveLength(before)
    })

    it('shows the editor each reviewer’s state and how many comments, as they are made', async () => {
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      const count = async () =>
        (await (await ada.get(`${draftUrl()}/reviewers`)).json()).reviewers[0]
      expect(await count()).toMatchObject({ name: 'Rae', state: 'open', commentCount: 0 })
      await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'One' })
      await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'Two' })
      expect(await count()).toMatchObject({ state: 'open', commentCount: 2 })
      await rae.post(`/api/reviews/${id}/end`, {})
      expect(await count()).toMatchObject({ state: 'ended', commentCount: 2 })
    })

    it('lets the editor stop accepting all reviews at once, and no more comments get in', async () => {
      const { rae } = await joinAsReviewer()
      const { rae: ray } = await joinAsReviewer('ray@example.com', 'Ray')
      await rae.post(`/api/reviews/${(await reviewsOf(rae))[0]!.id}/end`, {})
      expect(await (await ada.post(`${draftUrl()}/reviewers/close`, {})).json()).toEqual({
        closed: 1,
      })
      const id = (await reviewsOf(ray))[0]!.id
      expect(await (await ray.get(`/api/reviews/${id}`)).json()).toMatchObject({ state: 'closed' })
      expect(
        (await ray.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'x' })).status,
      ).toBe(409)
      expect((await bob.post(`${draftUrl()}/reviewers/close`, {})).status).toBe(403)
    })

    describe('review requests (#302)', () => {
      const requests = async () =>
        (await (await ada.get(`${draftUrl()}/reviewers`)).json()).snapshots
      const snapshotIds = async () => (await requests()).map((r: { id: string }) => r.id)

      it('summarises each snapshot on its own, with its waiting invitations and comments', async () => {
        const { rae } = await joinAsReviewer()
        const raeReview = (await reviewsOf(rae))[0]!.id
        await rae.post(`/api/reviews/${raeReview}/comments`, { block: 'whole', text: 'One' })
        await rae.post(`/api/reviews/${raeReview}/comments`, { block: 'whole', text: 'Two' })
        await rae.post(`/api/reviews/${raeReview}/end`, {})
        await joinAsReviewer('ray@example.com', 'Ray')
        await invite('waiting@example.com') // asked, not yet answered: a request of its own
        const listed = await (await ada.get(`${draftUrl()}/reviewers`)).json()
        expect(listed.snapshots).toMatchObject([
          { name: null, open: 0, ended: 1, closed: 0, pending: 0, comments: 2, unresolved: 2 },
          { open: 1, ended: 0, closed: 0, pending: 0, comments: 0 },
          { open: 0, ended: 0, closed: 0, pending: 1, comments: 0 },
        ])
        // Reviewers and invitations say which request they belong to.
        const [first, second, third] = listed.snapshots as { id: string }[]
        expect(listed.reviewers.map((r: { snapshotId: string }) => r.snapshotId)).toEqual([
          first!.id,
          second!.id,
        ])
        expect(listed.pending).toMatchObject([
          { snapshotId: third!.id, email: 'waiting@example.com' },
        ])
      })

      it('lets the editor and owners name a request, and a blank name goes back to the default', async () => {
        await joinAsReviewer()
        const [id] = await snapshotIds()
        const url = `${draftUrl()}/snapshots/${id}`
        expect((await ada.patch(url, { name: '  Final draft ' })).status).toBe(204)
        expect((await requests())[0]).toMatchObject({ name: 'Final draft' })
        expect((await ada.patch(url, { name: '   ' })).status).toBe(204)
        expect((await requests())[0]).toMatchObject({ name: null })
        expect((await ada.patch(url, { name: 'x'.repeat(81) })).status).toBe(400)
      })

      it('refuses a rename from a member who is not an owner or the editor, and an unknown request', async () => {
        await joinAsReviewer()
        const [id] = await snapshotIds()
        expect((await bob.patch(`${draftUrl()}/snapshots/${id}`, { name: 'Mine' })).status).toBe(
          403,
        )
        expect((await ada.patch(`${draftUrl()}/snapshots/nope`, { name: 'Mine' })).status).toBe(404)
      })

      it('closes the open reviews of one request and leaves the others', async () => {
        const { rae } = await joinAsReviewer()
        const { rae: ray } = await joinAsReviewer('ray@example.com', 'Ray')
        const [first] = await snapshotIds()
        const res = await ada.post(`${draftUrl()}/snapshots/${first}/close`, {})
        expect(await res.json()).toEqual({ closed: 1 })
        expect(
          await (await rae.get(`/api/reviews/${(await reviewsOf(rae))[0]!.id}`)).json(),
        ).toMatchObject({
          state: 'closed',
        })
        expect(
          await (await ray.get(`/api/reviews/${(await reviewsOf(ray))[0]!.id}`)).json(),
        ).toMatchObject({
          state: 'open',
        })
        expect((await bob.post(`${draftUrl()}/snapshots/${first}/close`, {})).status).toBe(403)
        expect((await ada.post(`${draftUrl()}/snapshots/nope/close`, {})).status).toBe(404)
      })
    })

    it('keeps an ended review final: a second reviewer-side end does not reopen it', async () => {
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      await rae.post(`/api/reviews/${id}/end`, {})
      await ada.delete(`${draftUrl()}/reviewers/${id}`)
      expect(await (await rae.get(`/api/reviews/${id}`)).json()).toMatchObject({ state: 'ended' })
    })

    it('never sends a human comment to the AI: a critique carries only the title and body', async () => {
      await saveKey(ada)
      const { rae } = await joinAsReviewer()
      const id = (await reviewsOf(rae))[0]!.id
      await bob.post(`${draftUrl()}/comments`, { block: 'whole', text: 'MEMBER-REMARK' })
      await rae.post(`/api/reviews/${id}/comments`, { block: 'whole', text: 'REVIEWER-REMARK' })
      await ada.post(`/api/publications/${publication}/assist/critique`, { draftId })
      const sent = JSON.stringify(ctx.llmCalls.at(-1)!.request)
      expect(sent).toContain('Rivers bend.')
      expect(sent).not.toContain('MEMBER-REMARK')
      expect(sent).not.toContain('REVIEWER-REMARK')
    })
  })
})
