import { describe, expect, it } from 'vitest'
import { hashToken } from './auth/secrets'
import { VERIFY_TTL_MS } from './services/accounts'
import { UNDO_EMAIL_CHANGE_TTL_DAYS } from './services/email-change'
import {
  lastEmailChangeToken,
  lastResetToken,
  lastUndoToken,
  lastVerificationToken,
  PASSWORD,
  register,
  setup,
  signUp,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

const NEW = 'ada@new.example.com'

async function world() {
  const ctx = setup()
  const client = ctx.client()
  await register(client, 'ada@example.com', 'Ada Lovelace')
  const request = (newEmail = NEW, password = PASSWORD, c: TestClient = client) =>
    c.post('/api/account/email', { newEmail, password })
  const confirm = (token: string, c: TestClient = ctx.client()) =>
    c.post('/api/auth/confirm-email-change', { token })
  const me = async (c: TestClient = client) => (await c.get('/api/auth/me')).json()
  return { ctx, client, request, confirm, me }
}

describe('changing your email address', () => {
  it('emails a link to the new address and changes nothing until it is opened', async () => {
    const { ctx, request, me } = await world()
    expect((await request()).status).toBe(200)

    const email = ctx.mailer.outbox.at(-1)!
    expect(email).toMatchObject({ to: NEW, subject: 'Confirm your new email address' })
    expect(email.text).toMatch(/\/confirm-email-change\?token=[\w-]+/)
    expect((await me()).email).toBe('ada@example.com')
    expect(
      (await ctx.client().post('/api/auth/login', { email: NEW, password: PASSWORD })).status,
    ).toBe(401)
  })

  it('switches to the confirmed new address, which then signs in and counts as verified', async () => {
    const { ctx, request, confirm, me } = await world()
    await request()
    // Even signed-out, e.g. opened on a phone.
    expect((await confirm(lastEmailChangeToken(ctx.mailer))).status).toBe(200)

    expect(await me()).toMatchObject({ email: NEW, emailVerified: true })
    const old = await ctx
      .client()
      .post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD })
    expect(old.status).toBe(401)
    expect(
      (await ctx.client().post('/api/auth/login', { email: NEW, password: PASSWORD })).status,
    ).toBe(200)
  })

  it('tells the old address, with a way to undo it', async () => {
    const { ctx, request, confirm } = await world()
    await request()
    await confirm(lastEmailChangeToken(ctx.mailer))
    const notice = ctx.mailer.outbox.at(-1)!
    expect(notice).toMatchObject({
      to: 'ada@example.com',
      subject: 'Your email address was changed',
    })
    expect(notice.text).toContain(NEW)
    expect(notice.text).toMatch(/\/undo-email-change\?token=[\w-]+/)
    expect(notice.text).not.toContain('confirm-email-change')
  })

  it('needs the correct password, and sends nothing otherwise', async () => {
    const { ctx, request } = await world()
    const before = ctx.mailer.outbox.length
    const res = await request(NEW, 'not my password')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/password is incorrect/)
    expect(ctx.mailer.outbox).toHaveLength(before)
  })

  it('refuses an address that already has an account, or is already yours', async () => {
    const { ctx, request } = await world()
    await signUp(ctx.client(), 'bob@example.com', 'Bob Byte')
    const before = ctx.mailer.outbox.length
    const taken = await request('bob@example.com')
    expect(taken.status).toBe(409)
    const same = await request('ADA@example.com ')
    expect(same.status).toBe(400)
    expect((await same.json()).error).toMatch(/already your email/)
    expect(ctx.mailer.outbox).toHaveLength(before)
  })

  it('rejects a malformed address', async () => {
    const { request } = await world()
    expect((await request('not-an-email')).status).toBe(400)
  })

  it('refuses if someone else took the address while the link was waiting', async () => {
    const { ctx, request, confirm, me } = await world()
    await request()
    const token = lastEmailChangeToken(ctx.mailer)
    await signUp(ctx.client(), NEW, 'Bob Byte')
    expect((await confirm(token)).status).toBe(409)
    expect((await me()).email).toBe('ada@example.com')
  })

  it('only honours the newest request', async () => {
    const { ctx, request, confirm, me } = await world()
    await request('first@example.com')
    const first = lastEmailChangeToken(ctx.mailer)
    await request('second@example.com')
    expect((await confirm(first)).status).toBe(400)
    expect((await confirm(lastEmailChangeToken(ctx.mailer))).status).toBe(200)
    expect((await me()).email).toBe('second@example.com')
  })

  it('treats opening the link twice as success, but not once something else has changed', async () => {
    const { ctx, request, confirm, client } = await world()
    await request()
    const token = lastEmailChangeToken(ctx.mailer)
    expect((await confirm(token)).status).toBe(200)
    expect((await confirm(token)).status).toBe(200)
    expect(
      ctx.mailer.outbox.filter((m) => m.subject === 'Your email address was changed'),
    ).toHaveLength(1)

    await client.post('/api/account/email', { newEmail: 'third@example.com', password: PASSWORD })
    await confirm(lastEmailChangeToken(ctx.mailer))
    expect((await confirm(token)).status).toBe(400) // the old link must not resurrect an older address
  })

  it('expires after a day', async () => {
    const { ctx, request, confirm, me } = await world()
    await request()
    ctx.clock.now = new Date(ctx.clock.now.getTime() + VERIFY_TTL_MS + 1000)
    const res = await confirm(lastEmailChangeToken(ctx.mailer))
    expect(res.status).toBe(400)
    expect((await me()).email).toBe('ada@example.com')
  })

  it('rejects a made-up token', async () => {
    const { confirm } = await world()
    expect((await confirm('nope')).status).toBe(400)
  })

  it('needs sign-in to ask', async () => {
    const { ctx } = await world()
    expect(
      (await ctx.client().post('/api/account/email', { newEmail: NEW, password: PASSWORD })).status,
    ).toBe(401)
  })

  it('is throttled', async () => {
    const { request } = await world()
    for (let i = 0; i < 10; i++) await request(NEW, 'wrong password')
    expect((await request()).status).toBe(429)
  })

  it('is not available to accounts with no password: a session alone is not enough proof', async () => {
    const { ctx } = await world()
    const google = ctx.client()
    await signUp(google, 'grace@example.com', 'Grace Hopper')
    ctx.store.users.removePassword(ctx.store.users.findByEmail('grace@example.com')!.id)
    const res = await google.post('/api/account/email', {
      newEmail: 'g@new.example.com',
      password: 'x',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Add a password/)
  })
})

describe('after the address changes', () => {
  it('links sent to the old address stop working', async () => {
    const { ctx, client, request, confirm } = await world()
    // A confirmation link and a reset link, both emailed to the old address.
    await client.post('/api/auth/resend-verification')
    const verify = lastVerificationToken(ctx.mailer)
    await ctx.client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    const reset = lastResetToken(ctx.mailer)

    await request()
    await confirm(lastEmailChangeToken(ctx.mailer))

    expect((await ctx.client().post('/api/auth/verify-email', { token: verify })).status).toBe(400)
    const res = await ctx
      .client()
      .post('/api/auth/reset-password', { token: reset, password: 'attacker chosen password' })
    expect(res.status).toBe(400)
  })

  it('invitations other people sent to the old address no longer work', async () => {
    const { ctx, request, confirm } = await world()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob Byte')
    verifyAccounts(ctx, 'bob@example.com')
    const publicationId = (await (await bob.get('/api/publications')).json())[0].id as string
    await bob.post(`/api/publications/${publicationId}/invitations`, { email: 'ada@example.com' })
    expect(ctx.store.invitations.listPending(publicationId, ctx.clock.now)).toHaveLength(1)

    await request()
    await confirm(lastEmailChangeToken(ctx.mailer))
    expect(ctx.store.invitations.listPending(publicationId, ctx.clock.now)).toHaveLength(0)
  })

  it('keeps publications and memberships', async () => {
    const { ctx, request, confirm } = await world()
    await request()
    await confirm(lastEmailChangeToken(ctx.mailer))
    const signedIn = ctx.client()
    await signedIn.post('/api/auth/login', { email: NEW, password: PASSWORD })
    expect(await (await signedIn.get('/api/publications')).json()).toHaveLength(1)
  })
})

describe('a pending change is cancelled when the password changes', () => {
  it('on change, so a redirect started with a stolen session cannot complete', async () => {
    const { ctx, client, request, confirm, me } = await world()
    await request()
    const token = lastEmailChangeToken(ctx.mailer)
    await client.post('/api/account/password', {
      currentPassword: PASSWORD,
      newPassword: 'a completely new password',
    })
    expect((await confirm(token)).status).toBe(400)
    expect((await me()).email).toBe('ada@example.com')
  })

  it('on reset, which is how the real owner takes the account back', async () => {
    const { ctx, request, confirm } = await world()
    await request()
    const token = lastEmailChangeToken(ctx.mailer)
    await ctx.client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    await ctx.client().post('/api/auth/reset-password', {
      token: lastResetToken(ctx.mailer),
      password: 'a completely new password',
    })
    expect((await confirm(token)).status).toBe(400)
  })
})

describe('deleting an account with a pending change', () => {
  it('removes the pending change too', async () => {
    const { ctx, client, request } = await world()
    await request()
    const token = lastEmailChangeToken(ctx.mailer)
    expect(ctx.store.tokens.findEmailChange(hashToken(token))).toBeDefined()
    await client.delete('/api/account', { password: PASSWORD })
    expect(ctx.store.tokens.findEmailChange(hashToken(token))).toBeUndefined()
  })
})

describe('"this wasn\'t me" after an email change', () => {
  async function changed() {
    const w = await world()
    await w.request()
    await w.confirm(lastEmailChangeToken(w.ctx.mailer))
    const undoToken = lastUndoToken(w.ctx.mailer)
    const undo = (token = undoToken, c: TestClient = w.ctx.client()) =>
      c.post('/api/auth/undo-email-change', { token })
    return { ...w, undoToken, undo }
  }

  it('puts the old address back, signs everyone out and emails a reset link there', async () => {
    const { ctx, client, undo } = await changed()
    expect((await undo()).status).toBe(200)

    expect((await client.get('/api/auth/me')).status).toBe(401) // signed out everywhere
    const mail = ctx.mailer.outbox.at(-1)!
    expect(mail).toMatchObject({ to: 'ada@example.com', subject: 'Reset your password' })
    // The password the intruder knew is replaced via the emailed link.
    const reset = await ctx.client().post('/api/auth/reset-password', {
      token: lastResetToken(ctx.mailer),
      password: 'a completely new password',
    })
    expect(reset.status).toBe(200)
    const login = await ctx
      .client()
      .post('/api/auth/login', { email: 'ada@example.com', password: 'a completely new password' })
    expect(login.status).toBe(200)
    expect((await login.json()).emailVerified).toBe(true)
    expect(
      (
        await ctx
          .client()
          .post('/api/auth/login', { email: NEW, password: 'a completely new password' })
      ).status,
    ).toBe(401)
  })

  it('treats opening the link twice as success', async () => {
    const { ctx, undo } = await changed()
    await undo()
    const sent = ctx.mailer.outbox.length
    expect((await undo()).status).toBe(200)
    expect(ctx.mailer.outbox).toHaveLength(sent) // but no second reset email
  })

  it('expires after a week', async () => {
    const { ctx, undo } = await changed()
    ctx.clock.now = new Date(
      ctx.clock.now.getTime() + (UNDO_EMAIL_CHANGE_TTL_DAYS * 24 * 3600 + 1) * 1000,
    )
    expect((await undo()).status).toBe(400)
    expect(ctx.store.users.findByEmail(NEW)).toBeDefined()
  })

  it('does nothing once the address has been changed again', async () => {
    const { ctx, client, undo } = await changed()
    await client.post('/api/account/email', { newEmail: 'third@example.com', password: PASSWORD })
    const token = lastEmailChangeToken(ctx.mailer)
    await ctx.client().post('/api/auth/confirm-email-change', { token })
    expect((await undo()).status).toBe(400)
    expect(ctx.store.users.findByEmail('third@example.com')).toBeDefined()
  })

  it('refuses if someone has registered the old address meanwhile', async () => {
    const { ctx, undo } = await changed()
    await signUp(ctx.client(), 'ada@example.com', 'Imposter')
    expect((await undo()).status).toBe(409)
    expect(ctx.store.users.findByEmail(NEW)).toBeDefined()
  })

  it('rejects a made-up token', async () => {
    const { undo } = await changed()
    expect((await undo('nope')).status).toBe(400)
  })

  it('goes away with the account', async () => {
    const { ctx, undoToken } = await changed()
    const c = ctx.client()
    await c.post('/api/auth/login', { email: NEW, password: PASSWORD })
    await c.delete('/api/account', { password: PASSWORD })
    expect(ctx.store.tokens.findEmailChangeUndo(hashToken(undoToken))).toBeUndefined()
  })
})
