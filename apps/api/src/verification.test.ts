import { describe, expect, it, vi } from 'vitest'
import { hashToken } from './auth/secrets'
import type { Mailer } from './mail/mailer'
import {
  lastResetToken,
  lastVerificationToken,
  PASSWORD,
  register,
  setup,
  verifyAccounts,
  type TestClient,
  createDraft,
} from './test-helpers'

async function newUser(ctx = setup(), email = 'ada@example.com') {
  const client = ctx.client()
  const user = await register(client, email, 'Ada Lovelace')
  return { ctx, client, user, token: lastVerificationToken(ctx.mailer) }
}
const me = async (c: TestClient) => (await c.get('/api/auth/me')).json()

describe('email verification', () => {
  it('starts unverified and emails a link to the address given at signup', async () => {
    const { ctx, client, user } = await newUser()
    expect(user.emailVerified).toBe(false)
    expect((await me(client)).emailVerified).toBe(false)

    const email = ctx.mailer.outbox.at(-1)!
    expect(email).toMatchObject({ to: 'ada@example.com', subject: 'Confirm your email address' })
    expect(email.text).toContain('Hi Ada Lovelace')
    expect(email.text).toContain('expires in 24 hours')
    expect(email.html).toContain('Confirm my email')
  })

  it('verifies when the link is used, whether or not the person is signed in', async () => {
    const { ctx, client, token } = await newUser()
    const elsewhere = ctx.client() // e.g. they open the link on their phone
    const res = await elsewhere.post('/api/auth/verify-email', { token })
    expect(res.status).toBe(200)
    expect((await me(client)).emailVerified).toBe(true)
    expect((await elsewhere.get('/api/auth/me')).status).toBe(401) // verifying doesn't sign anyone in
  })

  it('is harmless to use twice (mail scanners and double clicks)', async () => {
    const { ctx, token } = await newUser()
    expect((await ctx.client().post('/api/auth/verify-email', { token })).status).toBe(200)
    expect((await ctx.client().post('/api/auth/verify-email', { token })).status).toBe(200)
  })

  it('rejects unknown tokens', async () => {
    const { ctx } = await newUser()
    const res = await ctx.client().post('/api/auth/verify-email', { token: 'nonsense' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/invalid or has expired/)
  })

  it('expires links after 24 hours, and a resend gives a working one', async () => {
    const { ctx, client, token } = await newUser()
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600 * 1000)
    expect((await ctx.client().post('/api/auth/verify-email', { token })).status).toBe(400)
    expect((await me(client)).emailVerified).toBe(false)

    await client.post('/api/auth/resend-verification')
    const fresh = lastVerificationToken(ctx.mailer)
    expect((await ctx.client().post('/api/auth/verify-email', { token: fresh })).status).toBe(200)
    expect((await me(client)).emailVerified).toBe(true)
  })

  it('only honours the newest link', async () => {
    const { ctx, client, token: first } = await newUser()
    await client.post('/api/auth/resend-verification')
    const second = lastVerificationToken(ctx.mailer)
    expect(second).not.toBe(first)
    expect((await ctx.client().post('/api/auth/verify-email', { token: first })).status).toBe(400)
    expect((await ctx.client().post('/api/auth/verify-email', { token: second })).status).toBe(200)
  })

  it('only ever confirms the address the link was sent to', async () => {
    const { ctx, user } = await newUser()
    // A token issued for a different address (as if the account's email changed afterwards).
    ctx.store.tokens.createVerification(
      hashToken('stale-token'),
      user.id,
      'old-address@example.com',
      new Date(ctx.clock.now.getTime() + 3600_000),
    )
    expect(
      (await ctx.client().post('/api/auth/verify-email', { token: 'stale-token' })).status,
    ).toBe(400)
    expect(ctx.store.users.findById(user.id)!.emailVerified).toBe(false)
  })

  it('stores only a hash of the token', async () => {
    const { ctx, token } = await newUser()
    expect(ctx.store.tokens.findVerification(token)).toBeUndefined()
    expect(ctx.store.tokens.findVerification(hashToken(token))).toBeDefined()
  })
  it('is also satisfied by resetting the password via the emailed link (which proves the same thing)', async () => {
    const { ctx } = await newUser()
    await ctx.client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    await ctx.client().post('/api/auth/reset-password', {
      token: lastResetToken(ctx.mailer),
      password: 'a brand new password',
    })
    expect(ctx.store.users.findByEmail('ada@example.com')!.emailVerified).toBe(true)
  })
})

describe('resending the verification email', () => {
  it('needs sign-in', async () => {
    expect((await setup().client().post('/api/auth/resend-verification')).status).toBe(401)
  })

  it('does nothing for an address that is already verified', async () => {
    const { ctx, client } = await newUser()
    verifyAccounts(ctx, 'ada@example.com')
    const before = ctx.mailer.outbox.length
    expect((await client.post('/api/auth/resend-verification')).status).toBe(200)
    expect(ctx.mailer.outbox).toHaveLength(before)
  })

  it('is limited to 3 per hour per person', async () => {
    const { ctx, client } = await newUser()
    const statuses: number[] = []
    for (let i = 0; i < 4; i++)
      statuses.push((await client.post('/api/auth/resend-verification')).status)
    expect(statuses).toEqual([200, 200, 200, 429])

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 61 * 60 * 1000)
    expect((await client.post('/api/auth/resend-verification')).status).toBe(200)
  })
})

describe('what verification gates', () => {
  async function twoUsers() {
    const ctx = setup()
    const ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    const publicationId = (await (await ada.get('/api/publications')).json())[0].id as string
    return { ctx, ada, publicationId }
  }

  it('lets unverified people write but not invite others', async () => {
    const { ada, publicationId } = await twoUsers()
    expect(await createDraft(ada, publicationId, { title: 'T', body: 'B' })).toMatchObject({
      title: 'T',
    })
    const res = await ada.post(`/api/publications/${publicationId}/invitations`, {
      email: 'bob@example.com',
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/confirm your email/)
  })

  it('unlocks inviting once the owner follows the emailed link', async () => {
    const { ctx, ada, publicationId } = await twoUsers()
    const ownerLink = ctx.mailer.outbox
      .find((m) => m.to === 'ada@example.com')!
      .text.match(/token=([\w-]+)/)![1]
    expect((await ctx.client().post('/api/auth/verify-email', { token: ownerLink })).status).toBe(
      200,
    )
    expect(
      (
        await ada.post(`/api/publications/${publicationId}/invitations`, {
          email: 'bob@example.com',
        })
      ).status,
    ).toBe(202)
  })
})

describe('failure and cleanup', () => {
  it('still creates the account if the verification email cannot be sent, and logs why (without the link)', async () => {
    const failing: Mailer = {
      send: async () => {
        throw new Error('SMTP down')
      },
    }
    const logger = { error: vi.fn() }
    const ctx = setup({ mailer: failing, logger })
    const res = await ctx.client().post('/api/auth/register', {
      name: 'Ada',
      email: 'ada@example.com',
      password: PASSWORD,
      handle: 'ada',
    })
    expect(res.status).toBe(201)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    const logged = String(logger.error.mock.calls[0]![0])
    expect(logged).toMatch(/email verification/)
    expect(logged).not.toMatch(/token=/)
  })

  it('removes outstanding verification links when the account is deleted', async () => {
    const { ctx, client, token } = await newUser()
    await client.delete('/api/account', { confirmEmail: 'ada@example.com', password: PASSWORD })
    expect(ctx.store.tokens.findVerification(hashToken(token))).toBeUndefined()
  })
})
