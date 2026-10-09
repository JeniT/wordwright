import { describe, expect, it, vi } from 'vitest'
import { hashToken } from './auth/secrets'
import type { Mailer } from './mail/mailer'
import {
  lastInvitationToken,
  PASSWORD,
  register,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

/** Ada (confirmed) owns a profile; anyone else is created per test. */
async function world() {
  const ctx = setup()
  const ada = ctx.client()
  await register(ada, 'ada@example.com', 'Ada Lovelace')
  verifyAccounts(ctx, 'ada@example.com')
  const profileId = (await (await ada.get('/api/profiles')).json())[0].id as string
  const invite = (email: string, client: TestClient = ada) =>
    client.post(`/api/profiles/${profileId}/invitations`, { email })
  const inviteesEmails = () => ctx.mailer.outbox.filter((m) => /invited you/.test(m.subject))
  return { ctx, ada, profileId, invite, inviteesEmails }
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
    const { ctx, ada, profileId } = await world()
    const renamed = await (
      await ada.patch(`/api/profiles/${profileId}`, { name: '<script>alert(1)</script>' })
    ).json()
    await ada.post(`/api/profiles/${renamed.id}/invitations`, { email: 'bob@example.com' })
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

  it('sends nothing to someone who is already in the profile', async () => {
    const { ctx, ada, profileId, invite, inviteesEmails } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await shareProfile(ctx, ada, profileId, bob, 'bob@example.com')
    const before = inviteesEmails().length
    expect((await invite('bob@example.com')).status).toBe(202)
    expect((await invite('ada@example.com')).status).toBe(202)
    expect(inviteesEmails()).toHaveLength(before)
  })

  it('requires the inviter to be confirmed, and to own the profile', async () => {
    const { ctx, ada, profileId } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob') // unconfirmed, and not a member
    expect(
      (await bob.post(`/api/profiles/${profileId}/invitations`, { email: 'x@example.com' })).status,
    ).toBe(404) // can't even tell the profile exists

    await shareProfile(ctx, ada, profileId, bob, 'bob@example.com') // accepting confirms Bob
    expect(
      (await bob.post(`/api/profiles/${profileId}/invitations`, { email: 'x@example.com' })).status,
    ).toBe(403) // an editor, not the owner

    const carol = ctx.client()
    await register(carol, 'carol@example.com', 'Carol') // unconfirmed owner of her own profile
    const carolProfile = (await (await carol.get('/api/profiles')).json())[0].id
    const res = await carol.post(`/api/profiles/${carolProfile}/invitations`, {
      email: 'x@example.com',
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/confirm your email/)
  })

  it('needs sign-in and a valid email', async () => {
    const { ctx, profileId, invite } = await world()
    expect(
      (await ctx.client().post(`/api/profiles/${profileId}/invitations`, { email: 'a@b.co' }))
        .status,
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
    const { ctx, ada, profileId, invite } = await world()
    await invite('bob@example.com')
    const first = lastInvitationToken(ctx.mailer)
    await invite('BOB@example.com')
    const second = lastInvitationToken(ctx.mailer)
    expect(second).not.toBe(first)
    expect(await (await ada.get(`/api/profiles/${profileId}/invitations`)).json()).toHaveLength(1)

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
    const pid = (await (await ada.get('/api/profiles')).json())[0].id
    const res = await ada.post(`/api/profiles/${pid}/invitations`, { email: 'bob@example.com' })
    expect(res.status).toBe(202)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    const logged = String(logger.error.mock.calls.at(-1)![0])
    expect(logged).toMatch(/invitation email/)
    expect(logged).not.toMatch(/token=|bob@example\.com/)
  })
})

describe('managing pending invitations', () => {
  it('lists them for the owner, only while pending', async () => {
    const { ctx, ada, profileId, invite } = await world()
    await invite('bob@example.com')
    await invite('carol@example.com')
    const list = await (await ada.get(`/api/profiles/${profileId}/invitations`)).json()
    expect(list.map((i: { email: string }) => i.email)).toEqual([
      'carol@example.com',
      'bob@example.com',
    ])
    expect(JSON.stringify(list)).not.toMatch(/token/)

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 8 * 24 * 3600 * 1000)
    expect(await (await ada.get(`/api/profiles/${profileId}/invitations`)).json()).toEqual([])
  })

  it('drops an invitation from the list once accepted', async () => {
    const { ctx, ada, profileId, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await bob.post('/api/invitations/accept', { token })
    expect(await (await ada.get(`/api/profiles/${profileId}/invitations`)).json()).toEqual([])
  })

  it('lets the owner revoke, after which the link stops working', async () => {
    const { ctx, ada, profileId, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const [pending] = await (await ada.get(`/api/profiles/${profileId}/invitations`)).json()
    expect((await ada.delete(`/api/profiles/${profileId}/invitations/${pending.id}`)).status).toBe(
      204,
    )
    expect((await ada.delete(`/api/profiles/${profileId}/invitations/${pending.id}`)).status).toBe(
      404,
    )

    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(400)
    expect((await ctx.client().post('/api/invitations/preview', { token })).status).toBe(400)
  })

  it("won't let one profile's owner revoke or see another profile's invitations", async () => {
    const { ctx, ada, profileId, invite } = await world()
    await invite('bob@example.com')
    const [pending] = await (await ada.get(`/api/profiles/${profileId}/invitations`)).json()

    const mallory = ctx.client()
    await register(mallory, 'mallory@example.com', 'Mallory')
    const malloryProfile = (await (await mallory.get('/api/profiles')).json())[0].id
    expect(
      (await mallory.delete(`/api/profiles/${malloryProfile}/invitations/${pending.id}`)).status,
    ).toBe(404)
    expect((await mallory.get(`/api/profiles/${profileId}/invitations`)).status).toBe(404)
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
      profileName: "Ada Lovelace's writing",
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
    const { ctx, ada, profileId, invite } = await world()
    await invite('newbie@example.com')
    const token = lastInvitationToken(ctx.mailer)

    const newbie = ctx.client()
    await register(newbie, 'newbie@example.com', 'Newbie')
    expect((await (await newbie.get('/api/auth/me')).json()).emailVerified).toBe(false)

    const res = await newbie.post('/api/invitations/accept', { token })
    expect(await res.json()).toEqual({ profileId })
    expect((await (await newbie.get('/api/auth/me')).json()).emailVerified).toBe(true)

    const profile = await (await newbie.get(`/api/profiles/${profileId}`)).json()
    expect(profile.role).toBe('editor')
    expect(profile.members.map((m: { name: string }) => m.name)).toEqual(['Ada Lovelace', 'Newbie'])
    const draft = await newbie.post(`/api/profiles/${profileId}/drafts`, {
      title: 'Joint',
      body: 'x',
    })
    expect(draft.status).toBe(201)
    expect((await ada.get(`/api/profiles/${profileId}/drafts`)).status).toBe(200)
  })

  it('works for an existing account, matching the address case-insensitively', async () => {
    const { ctx, invite, profileId } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await invite('Bob@Example.COM')
    expect(
      (await bob.post('/api/invitations/accept', { token: lastInvitationToken(ctx.mailer) }))
        .status,
    ).toBe(200)
    expect((await bob.get(`/api/profiles/${profileId}`)).status).toBe(200)
  })

  it('refuses a signed-in person whose address is different, and they do not join', async () => {
    const { ctx, invite, profileId } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const mallory = ctx.client()
    await register(mallory, 'mallory@example.com', 'Mallory') // e.g. the link was forwarded
    const res = await mallory.post('/api/invitations/accept', { token })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/different email address/)
    expect((await mallory.get(`/api/profiles/${profileId}`)).status).toBe(404)

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
    const { ctx, invite, profileId } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(200)
    const again = await bob.post('/api/invitations/accept', { token })
    expect(await again.json()).toEqual({ profileId })

    const mallory = ctx.client()
    await register(mallory, 'mallory@example.com', 'Mallory')
    expect((await mallory.post('/api/invitations/accept', { token })).status).toBe(400)
  })

  it('does not bring someone back after they were removed, unless invited again', async () => {
    const { ctx, ada, profileId, invite } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await bob.post('/api/invitations/accept', { token })
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    await ada.delete(`/api/profiles/${profileId}/members/${bobId}`)

    expect((await bob.post('/api/invitations/accept', { token })).status).toBe(400)
    expect((await bob.get(`/api/profiles/${profileId}`)).status).toBe(404)
  })

  it('stores only a hash of the token', async () => {
    const { ctx, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    expect(ctx.store.invitations.findByTokenHash(token)).toBeUndefined()
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeDefined()
  })
})

describe('cleanup', () => {
  it('removes invitations addressed to someone when they delete their account', async () => {
    const { ctx, invite } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await bob.delete('/api/account', { confirmEmail: 'bob@example.com', password: PASSWORD })
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeUndefined()
  })

  it('removes pending invitations the inviter sent when they delete their account', async () => {
    const { ctx, ada, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await ada.delete('/api/account', { confirmEmail: 'ada@example.com', password: PASSWORD })
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeUndefined()
  })

  it('removes invitations with their profile', async () => {
    const { ctx, ada, profileId, invite } = await world()
    await invite('bob@example.com')
    const token = lastInvitationToken(ctx.mailer)
    await ada.delete(`/api/profiles/${profileId}`)
    expect(ctx.store.invitations.findByTokenHash(hashToken(token))).toBeUndefined()
  })
})
