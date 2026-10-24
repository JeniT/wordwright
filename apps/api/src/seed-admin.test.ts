import { describe, expect, it } from 'vitest'
import { seedAdminAccount } from './services/admin'
import { PASSWORD, lastResetToken, setup, signUp } from './test-helpers'

const ADMIN = 'admin@wordwright.example'

describe('the seeded Admin account', () => {
  it('is created once, as an approved admin with a confirmed address and no password', () => {
    const ctx = setup({ approvalRequired: true })
    expect(seedAdminAccount(ctx.store, [ADMIN, 'other@example.com'])).toBe('created')
    expect(seedAdminAccount(ctx.store, [ADMIN, 'other@example.com'])).toBe('exists')

    const admin = ctx.store.users.findByEmail(ADMIN)!
    expect(admin).toMatchObject({
      handle: 'admin',
      name: 'Admin',
      emailVerified: true,
      approval: 'approved',
      isAdmin: true,
    })
    expect(ctx.store.users.getPasswordHash(admin.id)).toBeUndefined()
    // Only the first address gets an account.
    expect(ctx.store.users.findByEmail('other@example.com')).toBeUndefined()
  })

  it('does nothing without ADMIN_EMAILS', () => {
    const ctx = setup()
    expect(seedAdminAccount(ctx.store, [])).toBe('none')
    expect(ctx.store.users.handleTaken('admin')).toBe(false)
  })

  it('skips when the address already has an account', async () => {
    const ctx = setup()
    await signUp(ctx.client(), ADMIN, 'Someone Else')
    expect(seedAdminAccount(ctx.store, [ADMIN])).toBe('exists')
    expect(ctx.store.users.findByEmail(ADMIN)!.name).toBe('Someone Else')
  })

  it('cannot sign in with a password, and sign-up still blocks the name', async () => {
    const ctx = setup()
    seedAdminAccount(ctx.store, [ADMIN])
    const res = await ctx.client().post('/api/auth/login', { email: ADMIN, password: PASSWORD })
    expect(res.status).toBe(401)
    const signUpRes = await ctx.client().post('/api/auth/register', {
      name: 'Imposter',
      email: 'imposter@example.com',
      password: PASSWORD,
      handle: 'admin',
    })
    expect(signUpRes.status).toBe(400)
  })

  it('gets in through "Forgot password", and shows as an admin on the Accounts page', async () => {
    const ctx = setup({ approvalRequired: true, adminEmails: [ADMIN] })
    seedAdminAccount(ctx.store, [ADMIN])
    const forgot = await ctx.client().post('/api/auth/forgot-password', { email: ADMIN })
    expect(forgot.status).toBe(200)
    expect(ctx.mailer.outbox.at(-1)!.to).toBe(ADMIN)

    const token = lastResetToken(ctx.mailer)
    const newPassword = 'a brand new password'
    const reset = await ctx
      .client()
      .post('/api/auth/reset-password', { token, password: newPassword })
    expect(reset.status).toBe(200)

    const owner = ctx.client()
    expect(
      (await owner.post('/api/auth/login', { email: ADMIN, password: newPassword })).status,
    ).toBe(200)
    const accounts = await (await owner.get('/api/admin/accounts')).json()
    expect(accounts.all.find((a: { email: string }) => a.email === ADMIN)).toMatchObject({
      name: 'Admin',
      isAdmin: true,
    })
  })

  it('does not reveal whether the address has an account', async () => {
    const ctx = setup()
    seedAdminAccount(ctx.store, [ADMIN])
    const known = await ctx.client().post('/api/auth/forgot-password', { email: ADMIN })
    const unknown = await ctx
      .client()
      .post('/api/auth/forgot-password', { email: 'ghost@example.com' })
    expect(known.status).toBe(unknown.status)
    expect(await known.json()).toEqual(await unknown.json())
  })
})
