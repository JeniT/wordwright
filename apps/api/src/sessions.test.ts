import { describe, expect, it } from 'vitest'
import { lastResetToken, PASSWORD, register, setup, type TestClient } from './test-helpers'

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'
const HOUR = 60 * 60 * 1000

const signIn = (client: TestClient, userAgent: string, email = 'ada@example.com') =>
  client.request(
    'POST',
    '/api/auth/login',
    { email, password: PASSWORD },
    { 'user-agent': userAgent },
  )

async function twoDevices() {
  const ctx = setup()
  const laptop = ctx.client()
  await register(laptop, 'ada@example.com', 'Ada')
  const phone = ctx.client()
  await signIn(phone, FIREFOX)
  return { ctx, laptop, phone }
}

const list = async (c: TestClient) => (await c.get('/api/account/sessions')).json()

describe('where you are signed in', () => {
  it('lists your own sessions with a coarse label, marking the one asking', async () => {
    const { laptop, phone } = await twoDevices()
    const seen = await list(phone)
    expect(seen).toHaveLength(2)
    expect(seen[0]).toMatchObject({ current: true, deviceLabel: 'Firefox on Linux' })
    expect(seen[1]).toMatchObject({ current: false })
    expect(Object.keys(seen[0]).sort()).toEqual(['current', 'deviceLabel', 'id', 'lastUsedAt'])
    expect((await list(laptop))[0].current).toBe(true)
  })

  it('labels a session by its sign-in, and never keeps the raw user-agent', async () => {
    const ctx = setup()
    const c = ctx.client()
    await register(c, 'ada@example.com', 'Ada')
    const mac = ctx.client()
    await signIn(mac, SAFARI)
    expect((await list(mac))[0].deviceLabel).toBe('Safari on macOS')
    const raw = ctx.db
      .prepare('SELECT * FROM sessions')
      .all()
      .map((r) => JSON.stringify(r))
      .join()
    expect(raw).not.toContain('Mozilla')
  })

  it('never shows the cookie or its hash', async () => {
    const { phone } = await twoDevices()
    const token = phone.cookies.get('wordwright_session')!
    const text = JSON.stringify(await list(phone))
    expect(text).not.toContain(token)
  })

  it("lists only your own sessions, and won't end anyone else's", async () => {
    const { ctx, phone } = await twoDevices()
    const grace = ctx.client()
    await register(grace, 'grace@example.com', 'Grace')
    const graceSession = (await list(grace))[0]
    expect(await list(grace)).toHaveLength(1)
    expect((await phone.delete(`/api/account/sessions/${graceSession.id}`)).status).toBe(404)
    expect((await grace.get('/api/auth/me')).status).toBe(200)
    expect((await phone.delete('/api/account/sessions/nope')).status).toBe(404)
  })

  it('ends one other session, which then stops working', async () => {
    const { laptop, phone } = await twoDevices()
    const other = (await list(phone)).find((s: { current: boolean }) => !s.current)
    expect((await phone.delete(`/api/account/sessions/${other.id}`)).status).toBe(204)
    expect((await laptop.get('/api/auth/me')).status).toBe(401)
    expect((await phone.get('/api/auth/me')).status).toBe(200)
    expect(await list(phone)).toHaveLength(1)
  })

  it('refuses to end the current session this way', async () => {
    const { phone } = await twoDevices()
    const mine = (await list(phone))[0]
    const res = await phone.delete(`/api/account/sessions/${mine.id}`)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Sign out/)
    expect((await phone.get('/api/auth/me')).status).toBe(200)
  })

  it('signs out everywhere else but keeps this one, and says how many', async () => {
    const { ctx, laptop, phone } = await twoDevices()
    const tablet = ctx.client()
    await signIn(tablet, SAFARI)
    const res = await phone.delete('/api/account/sessions')
    expect(await res.json()).toEqual({ count: 2 })
    expect((await phone.get('/api/auth/me')).status).toBe(200)
    expect((await laptop.get('/api/auth/me')).status).toBe(401)
    expect((await tablet.get('/api/auth/me')).status).toBe(401)
    expect(await (await phone.delete('/api/account/sessions')).json()).toEqual({ count: 0 })
  })

  it("doesn't touch another person's sessions when signing out everywhere else", async () => {
    const { ctx, phone } = await twoDevices()
    const grace = ctx.client()
    await register(grace, 'grace@example.com', 'Grace')
    await phone.delete('/api/account/sessions')
    expect((await grace.get('/api/auth/me')).status).toBe(200)
  })

  it('needs sign-in', async () => {
    const { ctx } = await twoDevices()
    expect((await ctx.client().get('/api/account/sessions')).status).toBe(401)
    expect((await ctx.client().delete('/api/account/sessions')).status).toBe(401)
  })

  it('shows sessions from before this existed as an unknown device, and they can be ended', async () => {
    const { ctx, phone } = await twoDevices()
    ctx.db
      .prepare('UPDATE sessions SET device_label = NULL WHERE id <> ?')
      .run((await list(phone))[0].id)
    const other = (await list(phone)).find((s: { current: boolean }) => !s.current)
    expect(other.deviceLabel).toBe('Unknown device')
    expect((await phone.delete(`/api/account/sessions/${other.id}`)).status).toBe(204)
  })

  it('does not list expired sessions', async () => {
    const { ctx, phone } = await twoDevices()
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 31 * 24 * HOUR)
    expect((await phone.get('/api/account/sessions')).status).toBe(401)
  })

  it('moves "last used" on at most once an hour', async () => {
    const ctx = setup()
    ctx.clock.now = new Date()
    const c = ctx.client()
    await register(c, 'ada@example.com', 'Ada')
    const first = (await list(c))[0].lastUsedAt
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 30 * 60 * 1000)
    expect((await list(c))[0].lastUsedAt).toBe(first)
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 40 * 60 * 1000)
    const later = (await list(c))[0].lastUsedAt
    expect(later).toBe(ctx.clock.now.toISOString())
    // ...and then it holds again.
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 5 * 60 * 1000)
    expect((await list(c))[0].lastUsedAt).toBe(later)
  })

  it('ends other sessions when the password is changed, but not when the email is', async () => {
    const { laptop, phone } = await twoDevices()
    await laptop.post('/api/account/email', { newEmail: 'ada2@example.com', password: PASSWORD })
    expect((await phone.get('/api/auth/me')).status).toBe(200)
    await laptop.post('/api/account/password', {
      currentPassword: PASSWORD,
      newPassword: 'a completely new password',
    })
    expect((await phone.get('/api/auth/me')).status).toBe(401)
    expect((await laptop.get('/api/auth/me')).status).toBe(200)
  })

  it('ends every session, this device included, when the password is reset', async () => {
    const { ctx, laptop, phone } = await twoDevices()
    await ctx.client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    const res = await ctx.client().post('/api/auth/reset-password', {
      token: lastResetToken(ctx.mailer),
      password: 'a completely new password',
    })
    expect(res.status).toBe(200)
    expect((await laptop.get('/api/auth/me')).status).toBe(401)
    expect((await phone.get('/api/auth/me')).status).toBe(401)
  })

  it('removes the sessions when the account is deleted', async () => {
    const { ctx, laptop } = await twoDevices()
    const res = await laptop.delete('/api/account', {
      password: PASSWORD,
      keepName: true,
    })
    expect(res.status).toBe(204)
    expect(ctx.db.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 })
  })
})
