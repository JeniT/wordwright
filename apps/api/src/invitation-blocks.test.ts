import { describe, expect, it } from 'vitest'
import {
  lastDeclineToken,
  lastEmailChangeToken,
  lastUndoToken,
  lastInvitationToken,
  PASSWORD,
  register,
  setup,
  signUp,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

/** Ada (confirmed) owns a profile and can invite; Bob is the invitee. */
async function world() {
  const ctx = setup()
  const ada = ctx.client()
  await register(ada, 'ada@example.com', 'Ada Lovelace')
  verifyAccounts(ctx, 'ada@example.com')
  const profileId = (await (await ada.get('/api/profiles')).json())[0].id as string
  const invite = (email = 'bob@example.com', client: TestClient = ada, id = profileId) =>
    client.post(`/api/profiles/${id}/invitations`, { email })
  const pending = async (client = ada, id = profileId) =>
    (await (await client.get(`/api/profiles/${id}/invitations`)).json()) as { email: string }[]
  const decline = (token: string, block?: 'none' | 'sender' | 'all') =>
    ctx.client().post('/api/invitations/decline', { token, block })
  const invitationsSent = () => ctx.mailer.outbox.filter((m) => /invited you/.test(m.subject))
  return { ctx, ada, profileId, invite, pending, decline, invitationsSent }
}

/** A second confirmed owner with their own profile. */
async function secondOwner(
  ctx: Awaited<ReturnType<typeof world>>['ctx'],
  email = 'cy@example.com',
  name = 'Cy Twombly',
) {
  const client = ctx.client()
  await register(client, email, name)
  verifyAccounts(ctx, email)
  const profileId = (await (await client.get('/api/profiles')).json())[0].id as string
  return { client, profileId }
}

describe('declining an invitation', () => {
  it('has a decline link in the invitation email', async () => {
    const { invite, invitationsSent } = await world()
    await invite()
    const [mail] = invitationsSent()
    expect(mail!.text).toMatch(/\/decline-invite\?token=[\w-]+/)
    expect(mail!.html).toContain('decline-invite')
  })

  it('withdraws the invitation, signed out, and the link then stops working', async () => {
    const { ctx, invite, pending, decline } = await world()
    await invite()
    const token = lastInvitationToken(ctx.mailer)
    expect((await decline(lastDeclineToken(ctx.mailer))).status).toBe(200)

    expect(await pending()).toEqual([])
    const preview = await ctx.client().post('/api/invitations/preview', { token })
    expect(preview.status).toBe(400)
    // Opening the decline page again says it is no longer open.
    expect((await decline(lastDeclineToken(ctx.mailer))).status).toBe(400)
  })

  it('does not block anything by itself: the owner can invite again', async () => {
    const { ctx, invite, pending, decline } = await world()
    await invite()
    await decline(lastDeclineToken(ctx.mailer))
    await invite()
    expect(await pending()).toHaveLength(1)
  })

  it('cannot be used after the invitation was accepted', async () => {
    const { ctx, invite, decline } = await world()
    await invite()
    const accept = lastInvitationToken(ctx.mailer)
    const declineToken = lastDeclineToken(ctx.mailer)
    const bob = ctx.client()
    await signUp(bob, 'bob@example.com', 'Bob Byte')
    await bob.post('/api/invitations/accept', { token: accept })
    expect((await decline(declineToken, 'all')).status).toBe(400)
    expect((await bob.get('/api/profiles')).status).toBe(200)
  })

  it('rejects a made-up token', async () => {
    const { decline } = await world()
    expect((await decline('nope')).status).toBe(400)
  })
})

describe('blocking a sender', () => {
  it('stops further invitations from them, silently, and withdraws their pending ones', async () => {
    const { ctx, ada, invite, pending, decline, invitationsSent } = await world()
    const second = await ada.post('/api/profiles', { name: 'Second' })
    const secondId = (await second.json()).id as string
    await invite()
    await invite('bob@example.com', ada, secondId)
    await decline(lastDeclineToken(ctx.mailer), 'sender')

    expect(await pending()).toEqual([])
    expect(await pending(ada, secondId)).toEqual([])
    const sent = invitationsSent().length
    const again = await invite()
    expect(again.status).toBe(202) // same answer as always
    expect(await pending()).toEqual([])
    expect(invitationsSent()).toHaveLength(sent)
  })

  it('still lets other people invite that address', async () => {
    const { ctx, invite, decline, invitationsSent } = await world()
    await invite()
    await decline(lastDeclineToken(ctx.mailer), 'sender')
    const cy = await secondOwner(ctx)
    const sent = invitationsSent().length
    await invite('bob@example.com', cy.client, cy.profileId)
    expect(invitationsSent()).toHaveLength(sent + 1)
  })

  it('does not tell the sender anything different from a normal invitation', async () => {
    const { ctx, invite, decline } = await world()
    await invite()
    await decline(lastDeclineToken(ctx.mailer), 'sender')
    const blocked = await invite('bob@example.com')
    const normal = await invite('fresh@example.com')
    expect([blocked.status, await blocked.json()]).toEqual([normal.status, await normal.json()])
  })
})

describe('blocking everyone', () => {
  it('stops invitations from anyone, and withdraws all pending ones', async () => {
    const { ctx, invite, pending, decline, invitationsSent } = await world()
    const cy = await secondOwner(ctx)
    await invite()
    await invite('bob@example.com', cy.client, cy.profileId)
    await decline(lastDeclineToken(ctx.mailer), 'all')

    expect(await pending()).toEqual([])
    expect(await pending(cy.client, cy.profileId)).toEqual([])
    const sent = invitationsSent().length
    await invite()
    await invite('bob@example.com', cy.client, cy.profileId)
    expect(invitationsSent()).toHaveLength(sent)
  })

  it('applies to the address even before the person has an account', async () => {
    const { ctx, invite, decline, invitationsSent } = await world()
    await invite('newbie@example.com')
    await decline(lastDeclineToken(ctx.mailer), 'all')
    const sent = invitationsSent().length
    await invite('newbie@example.com')
    expect(invitationsSent()).toHaveLength(sent)
  })
})

describe('managing blocks from the account', () => {
  async function blockedBob() {
    const w = await world()
    await w.invite()
    await w.decline(lastDeclineToken(w.ctx.mailer), 'sender')
    const bob = w.ctx.client()
    await signUp(bob, 'bob@example.com', 'Bob Byte')
    verifyAccounts(w.ctx, 'bob@example.com')
    return { ...w, bob }
  }

  it('lists blocked senders by name', async () => {
    const { bob } = await blockedBob()
    const res = await bob.get('/api/invitations/blocks')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.all).toBe(false)
    expect(body.senders).toEqual([{ id: expect.any(String), name: 'Ada Lovelace' }])
  })

  it('unblocking a sender lets their invitations through again', async () => {
    const { bob, invite, invitationsSent } = await blockedBob()
    const [{ id }] = (await (await bob.get('/api/invitations/blocks')).json()).senders
    expect((await bob.delete(`/api/invitations/blocks/senders/${id}`)).status).toBe(204)
    const sent = invitationsSent().length
    await invite()
    expect(invitationsSent()).toHaveLength(sent + 1)
  })

  it('blocks and unblocks everyone with a switch', async () => {
    const { bob, invite, invitationsSent } = await blockedBob()
    expect((await bob.put('/api/invitations/blocks/all', { blocked: true })).status).toBe(200)
    expect((await (await bob.get('/api/invitations/blocks')).json()).all).toBe(true)
    const sent = invitationsSent().length
    await invite('bob@example.com')
    expect(invitationsSent()).toHaveLength(sent)

    await bob.put('/api/invitations/blocks/all', { blocked: false })
    expect((await (await bob.get('/api/invitations/blocks')).json()).all).toBe(false)
  })

  it('needs sign-in and a confirmed address', async () => {
    const { ctx } = await blockedBob()
    expect((await ctx.client().get('/api/invitations/blocks')).status).toBe(401)
    // Someone who registers the address without proving it can neither see nor lift the blocks.
    const ctx2 = (await world()).ctx
    const eve = ctx2.client()
    await signUp(eve, 'eve@example.com', 'Eve', PASSWORD)
    expect((await eve.get('/api/invitations/blocks')).status).toBe(403)
    expect((await eve.put('/api/invitations/blocks/all', { blocked: true })).status).toBe(403)
  })

  it('goes away with the blocked sender’s account', async () => {
    const { ada, bob } = await blockedBob()
    await ada.delete('/api/account', { confirmEmail: 'ada@example.com', password: PASSWORD })
    expect((await (await bob.get('/api/invitations/blocks')).json()).senders).toEqual([])
  })
})

describe('the per-address cap', () => {
  it('stops piling on: after 5 a day, more are dropped quietly', async () => {
    const { ctx, invite, invitationsSent } = await world()
    const names = ['Beth Bale', 'Cara Cole', 'Dina Dunn', 'Edna Eyre', 'Fay Finch']
    for (const name of names) {
      const owner = await secondOwner(ctx, `${name.split(' ')[0]!.toLowerCase()}@example.com`, name)
      expect((await invite('bob@example.com', owner.client, owner.profileId)).status).toBe(202)
    }
    expect(invitationsSent()).toHaveLength(5)
    const res = await invite('bob@example.com')
    expect(res.status).toBe(202)
    expect(invitationsSent()).toHaveLength(5)
  })

  it('resets the next day', async () => {
    const { ctx, invite, invitationsSent } = await world()
    for (let i = 0; i < 6; i++) await invite('bob@example.com')
    expect(invitationsSent()).toHaveLength(5)
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600 * 1000)
    await invite('bob@example.com')
    expect(invitationsSent()).toHaveLength(6)
  })
})

describe('blocks and changing your email', () => {
  it('follow the person to their new address, and back if the change is undone', async () => {
    const w = await world()
    await w.invite()
    await w.decline(lastDeclineToken(w.ctx.mailer), 'all')
    const bob = w.ctx.client()
    await signUp(bob, 'bob@example.com', 'Bob Byte')
    verifyAccounts(w.ctx, 'bob@example.com')

    await bob.post('/api/account/email', { newEmail: 'bob@new.example.com', password: PASSWORD })
    await bob.post('/api/auth/logout')
    const token = lastEmailChangeToken(w.ctx.mailer)
    await w.ctx.client().post('/api/auth/confirm-email-change', { token })
    const moved = w.ctx.store.invitations
    expect(moved.isBlocked('bob@new.example.com', 'anyone')).toBe(true)
    expect(moved.isBlocked('bob@example.com', 'anyone')).toBe(false)

    await w.ctx.client().post('/api/auth/undo-email-change', { token: lastUndoToken(w.ctx.mailer) })
    expect(moved.isBlocked('bob@example.com', 'anyone')).toBe(true)
    expect(moved.isBlocked('bob@new.example.com', 'anyone')).toBe(false)
  })
})
