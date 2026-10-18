import { describe, expect, it, vi } from 'vitest'
import { hashToken } from './auth/secrets'
import type { Mailer } from './mail/mailer'
import {
  lastInvitationToken,
  PASSWORD,
  register,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
  createDraft,
} from './test-helpers'

/** Ada (confirmed) owns a publication; anyone else is created per test. */
async function world() {
  const ctx = setup()
  const ada = ctx.client()
  await register(ada, 'ada@example.com', 'Ada Lovelace')
  verifyAccounts(ctx, 'ada@example.com')
  const publicationId = (await (await ada.get('/api/publications')).json())[0].id as string
  const invite = (email: string, client: TestClient = ada) =>
    client.post(`/api/publications/${publicationId}/invitations`, { email })
  const inviteesEmails = () => ctx.mailer.outbox.filter((m) => /invited you/.test(m.subject))
  return { ctx, ada, publicationId, invite, inviteesEmails }
}

describe('inviting', () => {
  it('emails the address a link, naming who invited them and to what', async () => {
    const { invite, inviteesEmails } = await world()
    const res = await invite('bob@example.com')
    expect(res.status).toBe(202)

    const [email] = inviteesEmails()
    expect(email).toMatchObject({
      to: 'bob@example.com',
      subject: 'Ada Lovelace invited you to write together',
    })
    expect(email!.text).toContain('Ada Lovelace')
    expect(email!.text).toMatch(/Ada Lovelace's writing/)
    expect(email!.text).toMatch(/\/accept-invite\?token=[\w-]+/)
    expect(email!.text).toContain('expires in 7 days')
    expect(email!.html).toContain('Accept the invitation')
  })

  it('escapes names in the HTML email', async () => {
    const { ctx, ada, publicationId } = await world()
    const renamed = await (
      await ada.patch(`/api/publications/${publicationId}`, { name: '<script>alert(1)</script>' })
    ).json()
    await ada.post(`/api/publications/${renamed.id}/invitations`, { email: 'bob@example.com' })
    const html = ctx.mailer.outbox.at(-1)!.html!
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('gives the same answer whether or not the address has an account, or is already a member', async () => {
    const { ctx, invite } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob') // an existing (even unconfirmed) account

    const unknown = await invite('nobody@example.com')
    const unknownBody = await unknown.json()
    const existing = await invite('bob@example.com')
    const self = await invite('ada@example.com') // already a member: the owner
    for (const res of [existing, self]) {
      expect(res.status).toBe(unknown.status)
      expect(await res.json()).toEqual(unknownBody)
    }
  })

  it('sends nothing to someone who is already in the publication', async () => {
    const { ctx, ada, publicationId, invite, inviteesEmails } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await sharePublication(ctx, ada, publicationId, bob, 'bob@example.com')
    const before = inviteesEmails().length
    expect((await invite('bob@example.com')).status).toBe(202)
    expect((await invite('ada@example.com')).status).toBe(202)
    expect(inviteesEmails()).toHaveLength(before)
  })

  it('requires the inviter to be confirmed, and to own the publication', async () => {
    const { ctx, ada, publicationId } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob') // unconfirmed, and not a member
    expect(
      (await bob.post(`/api/publications/${publicationId}/invitations`, { email: 'x@example.com' }))
        .status,
    ).toBe(404) // can't even tell the publication exists

    await sharePublication(ctx, ada, publicationId, bob, 'bob@example.com') // accepting confirms Bob
    expect(
      (await bob.post(`/api/publications/${publicationId}/invitations`, { email: 'x@example.com' }))
        .status,
    ).toBe(403) // an editor, not the owner

    const carol = ctx.client()
    await register(carol, 'carol@example.com', 'Carol') // unconfirmed owner of her own publication
    const carolPublication = (await (await carol.get('/api/publications')).json())[0].id
    const res = await carol.post(`/api/publications/${carolPublication}/invitations`, {
      email: 'x@example.com',
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/confirm your email/)
  })

  it('needs sign-in and a valid email', async () => {
    const { ctx, publicationId, invite } = await world()
    expect(
      (
        await ctx
          .client()
          .post(`/api/publications/${publicationId}/invitations`, { email: 'a@b.co' })
      ).status,
    ).toBe(401)
    expect((await invite('not-an-email')).status).toBe(400)
  })

  it('limits how many invitations one person can send (each emails a stranger)', async () => {
    const { ctx, invite } = await world()
    const statuses: number[] = []
    for (let i = 0; i < 22; i++) statuses.push((await invite(`person${i}@example.com`)).status)
    expect(statuses.filter((s) => s === 202)).toHaveLength(20)
    expect(statuses.at(-1)).toBe(429)

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600 * 1000)
    expect((await invite('later@example.com')).status).toBe(202)
  })

  it('inviting the same address again replaces the earlier link', async () => {
    const { ctx, ada, publicationId, invite } = await world()
    await invite('bob@example.com')
    const first = lastInvitationToken(ctx.mailer)
    await invite('BOB@example.com')
    const second = lastInvitationToken(ctx.mailer)
    expect(second).not.toBe(first)
    expect(
      await (await ada.get(`/api/publications/${publicationId}/invitations`)).json(),
    ).toHaveLength(1)

    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.post('/api/invitations/accept', { token: first })).status).toBe(400)
    expect((await bob.post('/api/invitations/accept', { token: second })).status).toBe(200)
  })

  it('still answers, and logs why, when the email cannot be sent (without the link)', async () => {
    const failing: Mailer = {
      send: async (m) => {
        if (/invited you/.test(m.subject)) throw new Error('SMTP down')
      },
    }
    const logger = { error: vi.fn() }
    const ctx = setup({ mailer: failing, logger })
    const ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    const pid = (await (await ada.get('/api/publications')).json())[0].id
    const res = await ada.post(`/api/publications/${pid}/invitations`, { email: 'bob@example.com' })
    expect(res.status).toBe(202)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    const logged = String(logger.error.mock.calls.at(-1)![0])
    expect(logged).toMatch(/invitation email/)
    expect(logged).not.toMatch(/token=|bob@example\.com/)
  })
})

describe('managing pending invitations', () => {
  it('lists them for the owner, only while pending', async () => {
    const { ctx, ada, publicationId, invite } = await world()
    await invite('bob@example.com')
    await invite('carol@example.com')
    const list = await (await ada.get(`/api/publications/${publicationId}/invitations`)).json()
    expect(list.map((i: { email: string }) => i.email)).toEqual([
      'carol@example.com',
      'bob@example.com',
    ])
    expect(JSON.stringify(list)).not.toMatch(/token/)

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 8 * 24 * 3600 * 1000)
    expect(await (await ada.get(`/api/publications/${publicationId}/invitations`)).json()).toEqual(
      [],
    )
  })

  it('drops an invitation from the list once accepted', async () => {
    const { ctx, ada, publicationId, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await bob.post('/api/invitations/accept', { token })
    expect(await (await ada.get(`/api/publications/${publicationId}/invitations`)).json()).toEqual(
      [],
    )
  })

  it('lets the owner revoke, after which the link stops working', async () => {
    const { ctx, ada, publicationId, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const [pending] = await (await ada.get(`/api/publications/${publicationId}/invitations`)).json()
    expect(
      (await ada.delete(`/api/publications/${publicationId}/invitations/${pending.id}`)).status,
    ).toBe(204)
    expect(
      (await ada.delete(`/api/publications/${publicationId}/invitations/${pending.id}`)).status,
    ).toBe(404)

    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(400)
    expect((await ctx.client().post('/api/invitations/preview', { token })).status).toBe(400)
  })

  it("won't let one publication's owner revoke or see another publication's invitations", async () => {
    const { ctx, ada, publicationId, invite } = await world()
    await invite('bob@example.com')
    const [pending] = await (await ada.get(`/api/publications/${publicationId}/invitations`)).json()

    const mallory = ctx.client()
    await register(mallory, 'mallory@example.com', 'Mallory')
    const malloryPublication = (await (await mallory.get('/api/publications')).json())[0].id
    expect(
      (await mallory.delete(`/api/publications/${malloryPublication}/invitations/${pending.id}`))
        .status,
    ).toBe(404)
    expect((await mallory.get(`/api/publications/${publicationId}/invitations`)).status).toBe(404)
  })
})

describe('previewing a link', () => {
  it('shows who invited you, to what, and which address it is for, without signing in', async () => {
    const { ctx, invite } = await world()
    await invite('bob@example.com')
    const res = await ctx
      .client()
      .post('/api/invitations/preview', { token: lastInvitationToken(ctx.mailer) })
    expect(await res.json()).toEqual({
      publicationName: "Ada Lovelace's writing",
      inviterName: 'Ada Lovelace',
      email: 'bob@example.com',
    })
  })

  it('rejects unknown, expired and already-used links alike', async () => {
    const { ctx, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const anon = ctx.client()
    const unknown = await anon.post('/api/invitations/preview', { token: 'garbage' })
    expect(unknown.status).toBe(400)

    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await bob.post('/api/invitations/accept', { token })
    const used = await anon.post('/api/invitations/preview', { token })
    expect(used.status).toBe(400)
    expect(await used.json()).toEqual(await unknown.json())
  })

  it('expires after 7 days', async () => {
    const { ctx, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 7 * 24 * 3600 * 1000 + 1000)
    expect((await ctx.client().post('/api/invitations/preview', { token })).status).toBe(400)
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(400)
  })
})

describe('accepting', () => {
  it('lets someone with no account yet register and join, which also confirms their email', async () => {
    const { ctx, ada, publicationId, invite } = await world()
    await invite('newbie@example.com')
    const token = lastInvitationToken(ctx.mailer)

    const newbie = ctx.client()
    await register(newbie, 'newbie@example.com', 'Newbie')
    expect((await (await newbie.get('/api/auth/me')).json()).emailVerified).toBe(false)

    const res = await newbie.post('/api/invitations/accept', { token })
    expect(await res.json()).toEqual({ publicationId })
    expect((await (await newbie.get('/api/auth/me')).json()).emailVerified).toBe(true)

    const publication = await (await newbie.get(`/api/publications/${publicationId}`)).json()
    expect(publication.role).toBe('member')
    expect(publication.members.map((m: { name: string }) => m.name)).toEqual([
      'Ada Lovelace',
      'Newbie',
    ])
    const draft = await createDraft(newbie, publicationId, {
      title: 'Joint',
      body: 'x',
    })
    expect((await ada.get(`/api/publications/${publicationId}/drafts/${draft.id}`)).status).toBe(
      200,
    )
  })

  it('works for an existing account, matching the address case-insensitively', async () => {
    const { ctx, invite, publicationId } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await invite('Bob@Example.COM')
    expect(
      (await bob.post('/api/invitations/accept', { token: lastInvitationToken(ctx.mailer) }))
        .status,
    ).toBe(200)
    expect((await bob.get(`/api/publications/${publicationId}`)).status).toBe(200)
  })

  it('refuses a signed-in person whose address is different, and they do not join', async () => {
    const { ctx, invite, publicationId } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const mallory = ctx.client()
    await register(mallory, 'mallory@example.com', 'Mallory') // e.g. the link was forwarded
    const res = await mallory.post('/api/invitations/accept', { token })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/different email address/)
    expect((await mallory.get(`/api/publications/${publicationId}`)).status).toBe(404)

    // ...and the invitation is still there for the real Bob.
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(200)
  })

  it('needs sign-in', async () => {
    const { ctx, invite } = await world()
    await invite('bob@example.com')
    expect(
      (
        await ctx
          .client()
          .post('/api/invitations/accept', { token: lastInvitationToken(ctx.mailer) })
      ).status,
    ).toBe(401)
  })

  it('is safe to repeat for the same person, but not usable by anyone else afterwards', async () => {
    const { ctx, invite, publicationId } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(200)
    const again = await bob.post('/api/invitations/accept', { token })
    expect(await again.json()).toEqual({ publicationId })

    const mallory = ctx.client()
    await register(mallory, 'mallory@example.com', 'Mallory')
    expect((await mallory.post('/api/invitations/accept', { token })).status).toBe(400)
  })

  it('does not bring someone back after they were removed, unless invited again', async () => {
    const { ctx, ada, publicationId, invite } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await bob.post('/api/invitations/accept', { token })
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    await ada.delete(`/api/publications/${publicationId}/members/${bobId}`)

    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(400)
    expect((await bob.get(`/api/publications/${publicationId}`)).status).toBe(404)
  })

  it('stores only a hash of the token', async () => {
    const { ctx, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    expect(ctx.store.invitations.findByTokenHash(token)).toBeUndefined()
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeDefined()
  })
})

describe('invitations waiting for the signed-in person', () => {
  /** Bob has an account whose address is confirmed, and Ada has invited him. */
  async function invitedBob(confirmed = true) {
    const w = await world()
    const bob = w.ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    if (confirmed) verifyAccounts(w.ctx, 'bob@example.com')
    await w.invite('bob@example.com')
    return { ...w, bob }
  }
  const mine = async (c: TestClient) => (await c.get('/api/invitations/mine')).json()

  it('lists what is waiting for their confirmed address, without the link', async () => {
    const { bob } = await invitedBob()
    expect(await mine(bob)).toEqual([
      expect.objectContaining({
        publicationName: "Ada Lovelace's writing",
        inviterName: 'Ada Lovelace',
      }),
    ])
  })

  it('shows an unconfirmed account the same empty list as one with nothing waiting, and no way in', async () => {
    const { bob, ctx, publicationId, ada } = await invitedBob(false)
    expect(await mine(bob)).toEqual([])
    const [pending] = await (await ada.get(`/api/publications/${publicationId}/invitations`)).json()
    expect((await bob.post(`/api/invitations/mine/${pending.id}/accept`, {})).status).toBe(404)
    expect((await bob.get(`/api/publications/${publicationId}`)).status).toBe(404)
    const stranger = ctx.client()
    await register(stranger, 'carol@example.com', 'Carol')
    expect(await mine(stranger)).toEqual([])
  })

  it('needs sign-in', async () => {
    const { ctx } = await invitedBob()
    expect((await ctx.client().get('/api/invitations/mine')).status).toBe(401)
  })

  it('accepting joins them as a member and takes it off the list', async () => {
    const { bob, publicationId } = await invitedBob()
    const [{ id }] = await mine(bob)
    const res = await bob.post(`/api/invitations/mine/${id}/accept`, {})
    expect(await res.json()).toEqual({ publicationId })
    expect((await (await bob.get(`/api/publications/${publicationId}`)).json()).role).toBe('member')
    expect(await mine(bob)).toEqual([])
    expect((await bob.post(`/api/invitations/mine/${id}/accept`, {})).status).toBe(404)
  })

  it("won't let someone else accept or decline it", async () => {
    const { ctx, bob } = await invitedBob()
    const [{ id }] = await mine(bob)
    const carol = ctx.client()
    await register(carol, 'carol@example.com', 'Carol')
    verifyAccounts(ctx, 'carol@example.com')
    expect((await carol.post(`/api/invitations/mine/${id}/accept`, {})).status).toBe(404)
    expect((await carol.post(`/api/invitations/mine/${id}/decline`, {})).status).toBe(404)
    expect(await mine(bob)).toHaveLength(1)
  })

  it('declining removes it, tells the inviter nothing, and can stop future ones from that person', async () => {
    const { bob, ada, publicationId, invite } = await invitedBob()
    const [{ id }] = await mine(bob)
    expect(
      (await bob.post(`/api/invitations/mine/${id}/decline`, { block: 'sender' })).status,
    ).toBe(200)
    expect(await mine(bob)).toEqual([])
    expect(await (await ada.get(`/api/publications/${publicationId}/invitations`)).json()).toEqual(
      [],
    )
    await invite('bob@example.com') // a blocked sender: same quiet answer, nothing arrives
    expect(await mine(bob)).toEqual([])
  })

  it('leaves out expired invitations', async () => {
    const { ctx, bob } = await invitedBob()
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 7 * 24 * 3600 * 1000 + 1000)
    expect(await mine(bob)).toEqual([])
  })
})

describe('cleanup', () => {
  it('removes invitations addressed to someone when they delete their account', async () => {
    const { ctx, invite } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await bob.delete('/api/account', { password: PASSWORD })
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeUndefined()
  })

  it('removes pending invitations the inviter sent when they delete their account', async () => {
    const { ctx, ada, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await ada.delete('/api/account', { password: PASSWORD })
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeUndefined()
  })

  it('removes invitations with their publication', async () => {
    const { ctx, ada, publicationId, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await ada.delete(`/api/publications/${publicationId}`)
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeUndefined()
  })
})
