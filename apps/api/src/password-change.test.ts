import { describe, expect, it, vi } from 'vitest'
import { FakeIdentityProvider } from './auth/identity'
import type { Mailer } from './mail/mailer'
import { lastResetToken, PASSWORD, register, setup, type TestClient } from './test-helpers'

const NEW_PASSWORD = 'a completely new password'

async function user(ctx = setup(), email = 'ada@example.com') {
  const client = ctx.client()
  await register(client, email, 'Ada Lovelace')
  return { ctx, client }
}
const change = (c: TestClient, currentPassword: string, newPassword: string) =>
  c.post('/api/account/password', { currentPassword, newPassword })
const signIn = (ctx: ReturnType<typeof setup>, password: string, email = 'ada@example.com') =>
  ctx.client().post('/api/auth/login', { email, password })

describe('changing your password while signed in', () => {
  it('replaces the password: the old one stops working, the new one works', async () => {
    const { ctx, client } = await user()
    expect((await change(client, PASSWORD, NEW_PASSWORD)).status).toBe(200)
    expect((await signIn(ctx, PASSWORD)).status).toBe(401)
    expect((await signIn(ctx, NEW_PASSWORD)).status).toBe(200)
  })

  it('keeps this device signed in but signs out all the others', async () => {
    const { ctx, client } = await user()
    const phone = ctx.client()
    await phone.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD })
    expect((await phone.get('/api/auth/me')).status).toBe(200)

    await change(client, PASSWORD, NEW_PASSWORD)
    expect((await client.get('/api/auth/me')).status).toBe(200)
    expect((await phone.get('/api/auth/me')).status).toBe(401)
  })

  it('cancels any password-reset link that was already out', async () => {
    const { ctx, client } = await user()
    await ctx.client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    const token = lastResetToken(ctx.mailer)
    await change(client, PASSWORD, NEW_PASSWORD)
    const res = await ctx.client().post('/api/auth/reset-password', {
      token,
      password: 'attacker chosen password',
    })
    expect(res.status).toBe(400)
    expect((await signIn(ctx, NEW_PASSWORD)).status).toBe(200)
  })

  it('emails a notice, without any token or link that acts on the account', async () => {
    const { ctx, client } = await user()
    await change(client, PASSWORD, NEW_PASSWORD)
    const email = ctx.mailer.outbox.at(-1)!
    expect(email).toMatchObject({ to: 'ada@example.com', subject: 'Your password was changed' })
    expect(email.text).toContain('Hi Ada Lovelace')
    expect(email.text).toContain('/forgot-password')
    expect(email.text).not.toMatch(/token=/)
    expect(email.text).not.toContain(NEW_PASSWORD)
  })

  it('needs the correct current password, and changes nothing otherwise', async () => {
    const { ctx, client } = await user()
    const before = ctx.mailer.outbox.length
    const res = await change(client, 'not my password', NEW_PASSWORD)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/current password is incorrect/)
    expect((await signIn(ctx, PASSWORD)).status).toBe(200)
    expect((await signIn(ctx, NEW_PASSWORD)).status).toBe(401)
    expect(ctx.mailer.outbox).toHaveLength(before)
  })

  it('refuses a new password that is the same, too short or absurdly long', async () => {
    const { client } = await user()
    expect((await change(client, PASSWORD, PASSWORD)).status).toBe(400)
    expect((await change(client, PASSWORD, 'short')).status).toBe(400)
    expect((await change(client, PASSWORD, 'x'.repeat(5000))).status).toBe(400)
  })

  it('throttles guesses at the current password', async () => {
    const { client } = await user()
    let last = 0
    for (let i = 0; i < 12; i++)
      last = (await change(client, `wrong guess ${i}`, NEW_PASSWORD)).status
    expect(last).toBe(429)
  })

  it('needs sign-in', async () => {
    const { ctx } = await user()
    expect((await change(ctx.client(), PASSWORD, NEW_PASSWORD)).status).toBe(401)
  })

  it('still changes the password if the notice cannot be emailed, and logs why (without the address)', async () => {
    const failing: Mailer = {
      send: async (m) => {
        if (/changed/.test(m.subject)) throw new Error('SMTP down')
      },
    }
    const logger = { error: vi.fn() }
    const ctx = setup({ mailer: failing, logger })
    const { client } = await user(ctx)
    expect((await change(client, PASSWORD, NEW_PASSWORD)).status).toBe(200)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    const logged = String(logger.error.mock.calls.at(-1)![0])
    expect(logged).toMatch(/password change notice/)
    expect(logged).not.toContain('ada@example.com')
  })
})

describe('adding a password to an account that signs in with Google', () => {
  const idp = () =>
    new FakeIdentityProvider(
      { subject: 'g-1', email: 'ada@example.com', emailVerified: true, name: 'Ada Lovelace' },
      'google',
      'Google',
    )
  async function googleUser() {
    const ctx = setup({ identityProviders: [idp()] })
    const client = ctx.client()
    const start = await client.get('/api/auth/oauth/google/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    await client.get(`/api/auth/oauth/google/callback?code=good-code&state=${state}`)
    return { ctx, client }
  }

  it('cannot change a password it does not have', async () => {
    const { client } = await googleUser()
    const res = await change(client, 'anything at all', NEW_PASSWORD)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Set a password/)
  })

  it('emails a link; using it sets the password, so email sign-in then works', async () => {
    const { ctx, client } = await googleUser()
    expect((await client.post('/api/account/password/setup-email')).status).toBe(200)
    const email = ctx.mailer.outbox.at(-1)!
    expect(email).toMatchObject({
      to: 'ada@example.com',
      subject: 'Set a password for your account',
    })

    expect((await signIn(ctx, NEW_PASSWORD)).status).toBe(401) // not yet
    const reset = await ctx.client().post('/api/auth/reset-password', {
      token: lastResetToken(ctx.mailer),
      password: NEW_PASSWORD,
    })
    expect(reset.status).toBe(200)
    expect((await signIn(ctx, NEW_PASSWORD)).status).toBe(200)

    const fresh = ctx.client()
    await fresh.post('/api/auth/login', { email: 'ada@example.com', password: NEW_PASSWORD })
    expect(await (await fresh.get('/api/auth/me')).json()).toMatchObject({
      hasPassword: true,
      linkedProviders: ['google'],
    })
  })

  it('a hijacked session alone cannot add a password: the link goes to the inbox, not the page', async () => {
    const { client } = await googleUser()
    const res = await client.post('/api/account/password/setup-email')
    expect(JSON.stringify(await res.json())).not.toMatch(/token/)
    expect(await (await client.get('/api/auth/me')).json()).toMatchObject({ hasPassword: false })
  })

  it('is refused for accounts that already have a password', async () => {
    const { client } = await user()
    expect((await client.post('/api/account/password/setup-email')).status).toBe(409)
  })

  it('needs sign-in', async () => {
    expect((await setup().client().post('/api/account/password/setup-email')).status).toBe(401)
  })
})
