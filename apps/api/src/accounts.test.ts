import { describe, expect, it, vi } from 'vitest'
import type { Mailer } from './mail/mailer'
import {
  lastResetToken,
  PASSWORD,
  PNG_BYTES,
  register,
  saveKey,
  setup,
  shareProfile,
  signUp,
  verifyAccounts,
  createDraft,
} from './test-helpers'

describe('registration', () => {
  it('creates an account with the chosen username and a session, but no profile yet', async () => {
    const { client } = setup()
    const c = client()
    const user = await signUp(c, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    expect(user).toMatchObject({
      name: 'Ada',
      handle: 'countess',
      email: 'ada@example.com',
      hasPassword: true,
    })
    expect(user).not.toHaveProperty('hash')

    const me = await c.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect((await me.json()).email).toBe('ada@example.com')

    // The person creates their first profile themselves, so they can set it up as they like.
    expect(await (await c.get('/api/profiles')).json()).toEqual([])
  })

  it('lowercases and trims the username', async () => {
    const { client } = setup()
    const user = await signUp(client(), 'ada@example.com', 'Ada', PASSWORD, '  CountessAda ')
    expect(user.handle).toBe('countessada')
  })

  it('refuses a username that is taken, however it is capitalised, and creates nothing', async () => {
    const { client, store } = setup()
    await signUp(client(), 'ada@example.com', 'Ada', PASSWORD, 'countess')
    const res = await client().post('/api/auth/register', {
      name: 'Imposter',
      email: 'bob@example.com',
      password: PASSWORD,
      handle: 'Countess',
    })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/username.*taken/i)
    expect(store.users.findByEmail('bob@example.com')).toBeUndefined()
  })

  it('explains what is wrong with a username in words', async () => {
    const res = await setup().client().post('/api/auth/register', {
      name: 'Ada',
      email: 'ada@example.com',
      password: PASSWORD,
      handle: 'ada lovelace',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Use only letters and numbers in your username')
  })

  it('says whether a username is available, without needing to sign in', async () => {
    const { client } = setup()
    await signUp(client(), 'ada@example.com', 'Ada', PASSWORD, 'countess')
    const check = async (handle: string) =>
      (await client().get(`/api/auth/handle-available?handle=${handle}`)).json()
    expect(await check('countess')).toEqual({ available: false })
    expect(await check('COUNTESS')).toEqual({ available: false })
    expect(await check('lovelace')).toEqual({ available: true })
    expect((await client().get('/api/auth/handle-available?handle=a!')).status).toBe(400)
    expect((await client().get('/api/auth/handle-available')).status).toBe(400)
  })

  it('sets an HttpOnly, SameSite session cookie', async () => {
    const { client } = setup()
    const res = await client().post('/api/auth/register', {
      name: 'A',
      email: 'a@example.com',
      password: PASSWORD,
      handle: 'aaa',
    })
    const cookie = res.setCookies.find((c) => c.startsWith('lfwa_session='))!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it('refuses a second account for the same email, ignoring case and whitespace', async () => {
    const { client, store } = setup()
    await register(client(), 'ada@example.com')
    const res = await client().post('/api/auth/register', {
      name: 'Imposter',
      email: '  ADA@Example.com ',
      password: PASSWORD,
      handle: 'imposter',
    })
    expect(res.status).toBe(409)
    expect(store.users.findByEmail('ada@example.com')?.name).toBe('Ada Lovelace')
  })

  it.each([
    ['short password', { name: 'A', email: 'a@example.com', password: 'short' }],
    ['bad email', { name: 'A', email: 'not-an-email', password: PASSWORD }],
    ['empty name', { name: '  ', email: 'a@example.com', password: PASSWORD, handle: 'aaa' }],
    [
      'huge password',
      { name: 'A', email: 'a@example.com', password: 'x'.repeat(5000), handle: 'aaa' },
    ],
    ['no username', { name: 'A', email: 'a@example.com', password: PASSWORD }],
    ['short username', { name: 'A', email: 'a@example.com', password: PASSWORD, handle: 'ab' }],
    [
      'username with punctuation',
      { name: 'A', email: 'a@example.com', password: PASSWORD, handle: 'a-b_c' },
    ],
  ])('rejects %s', async (_label, body) => {
    expect((await setup().client().post('/api/auth/register', body)).status).toBe(400)
  })

  it.each([
    ['a short password', { password: 'short' }, 'Use at least 10 characters'],
    ['a bad email', { email: 'not-an-email' }, 'Enter an email address, like name@example.com'],
    ['a blank name', { name: '  ' }, 'Enter a name'],
  ])('explains %s in plain words, not as a zod object', async (_label, change, message) => {
    const body = { name: 'A', email: 'a@example.com', password: PASSWORD, handle: 'aaa', ...change }
    const res = await setup().client().post('/api/auth/register', body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: message })
  })

  it('never stores the password in plain text', async () => {
    const { client, store } = setup()
    const user = await register(client())
    const hash = store.users.getPasswordHash(user.id)!
    expect(hash).toMatch(/^scrypt\$/)
    expect(hash).not.toContain(PASSWORD)
  })
})

describe('login and sessions', () => {
  it('logs in with the right password', async () => {
    const { client } = setup()
    await register(client())
    const c = client()
    const res = await c.post('/api/auth/login', { email: 'ADA@example.com', password: PASSWORD })
    expect(res.status).toBe(200)
    expect((await c.get('/api/auth/me')).status).toBe(200)
  })

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { client } = setup()
    await register(client())
    const wrong = await client().post('/api/auth/login', {
      email: 'ada@example.com',
      password: 'nope-nope-nope',
    })
    const unknown = await client().post('/api/auth/login', {
      email: 'who@example.com',
      password: PASSWORD,
    })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  it('throttles repeated failed attempts for an email', async () => {
    const { client } = setup()
    await register(client())
    const c = client()
    let last = 0
    for (let i = 0; i < 12; i++) {
      last = (
        await c.post('/api/auth/login', { email: 'ada@example.com', password: 'wrong-wrong' })
      ).status
    }
    expect(last).toBe(429)
  })

  it('requires a session for protected routes', async () => {
    expect((await setup().client().get('/api/profiles')).status).toBe(401)
  })

  it('logs out', async () => {
    const { client } = setup()
    const c = client()
    await register(c)
    const stolen = c.cookies.get('lfwa_session')!
    expect((await c.post('/api/auth/logout')).status).toBe(204)
    expect((await c.get('/api/auth/me')).status).toBe(401)

    // The old token is dead server-side too, not just removed from the browser.
    const other = client()
    other.cookies.set('lfwa_session', stolen)
    expect((await other.get('/api/auth/me')).status).toBe(401)
  })

  it('expires sessions after 30 days', async () => {
    const { client, clock } = setup()
    const c = client()
    await register(c)
    clock.now = new Date(clock.now.getTime() + 31 * 24 * 3600 * 1000)
    expect((await c.get('/api/auth/me')).status).toBe(401)
  })

  it('blocks cross-origin state-changing requests', async () => {
    const { client } = setup()
    const res = await client().request(
      'POST',
      '/api/auth/login',
      { email: 'a@example.com', password: PASSWORD },
      { origin: 'https://evil.example' },
    )
    expect(res.status).toBe(403)
  })
})

describe('password recovery', () => {
  async function accountWithResetEmail() {
    const ctx = setup()
    await register(ctx.client())
    await ctx.client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    return ctx
  }

  it('emails a reset link and lets the user choose a new password', async () => {
    const { client, mailer } = await accountWithResetEmail()
    expect(mailer.outbox).toHaveLength(2) // the welcome/verification email, then the reset
    expect(mailer.outbox.at(-1)!.to).toBe('ada@example.com')

    const reset = await client().post('/api/auth/reset-password', {
      token: lastResetToken(mailer),
      password: 'a brand new password',
    })
    expect(reset.status).toBe(200)

    expect(
      (await client().post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD }))
        .status,
    ).toBe(401)
    expect(
      (
        await client().post('/api/auth/login', {
          email: 'ada@example.com',
          password: 'a brand new password',
        })
      ).status,
    ).toBe(200)
  })

  it('answers identically for unknown emails and sends nothing', async () => {
    const { client, mailer } = setup()
    const res = await client().post('/api/auth/forgot-password', { email: 'ghost@example.com' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mailer.outbox).toHaveLength(0)
  })

  it('makes a link single-use', async () => {
    const { client, mailer } = await accountWithResetEmail()
    const token = lastResetToken(mailer)
    expect(
      (await client().post('/api/auth/reset-password', { token, password: 'another password 1' }))
        .status,
    ).toBe(200)
    expect(
      (await client().post('/api/auth/reset-password', { token, password: 'another password 2' }))
        .status,
    ).toBe(400)
  })

  it('expires links after an hour', async () => {
    const { client, mailer, clock } = await accountWithResetEmail()
    clock.now = new Date(clock.now.getTime() + 61 * 60 * 1000)
    const res = await client().post('/api/auth/reset-password', {
      token: lastResetToken(mailer),
      password: 'another password 1',
    })
    expect(res.status).toBe(400)
  })

  it('only honours the most recent link', async () => {
    const { client, mailer } = await accountWithResetEmail()
    const first = lastResetToken(mailer)
    await client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    expect(
      (
        await client().post('/api/auth/reset-password', {
          token: first,
          password: 'another password 1',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await client().post('/api/auth/reset-password', {
          token: lastResetToken(mailer),
          password: 'another password 1',
        })
      ).status,
    ).toBe(200)
  })

  it('rejects garbage tokens and weak new passwords', async () => {
    const { client, mailer } = await accountWithResetEmail()
    expect(
      (
        await client().post('/api/auth/reset-password', {
          token: 'garbage',
          password: 'another password 1',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await client().post('/api/auth/reset-password', {
          token: lastResetToken(mailer),
          password: 'short',
        })
      ).status,
    ).toBe(400)
  })

  it('signs out existing sessions when the password changes', async () => {
    const { client, mailer } = setup()
    const attacker = client()
    await register(attacker)
    await client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    await client().post('/api/auth/reset-password', {
      token: lastResetToken(mailer),
      password: 'another password 1',
    })
    expect((await attacker.get('/api/auth/me')).status).toBe(401)
  })

  it('does not store the reset token itself', async () => {
    const { mailer, store } = await accountWithResetEmail()
    const token = lastResetToken(mailer)
    expect(store.tokens.findValidReset(token, new Date('2026-01-01T00:00:01Z'))).toBeUndefined()
  })
})

describe('password recovery when email delivery fails', () => {
  const failing: Mailer = {
    send: async () => {
      throw new Error('SMTP 535 auth failed')
    },
  }
  const hanging: Mailer = { send: () => new Promise(() => {}) }

  it('still answers identically, and logs the failure without the reset link or address', async () => {
    const logger = { error: vi.fn() }
    const { client } = setup({ mailer: failing, logger })
    await register(client())

    const known = await client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    const unknown = await client().post('/api/auth/forgot-password', { email: 'ghost@example.com' })
    expect(known.status).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())

    const messages = () => logger.error.mock.calls.map((c) => String(c[0]))
    await vi.waitFor(() => expect(messages().some((m) => /password reset/.test(m))).toBe(true))
    const logged = messages().find((m) => /password reset/.test(m))!
    expect(logged).toMatch(/Failed to send password reset email for user/)
    expect(logged).toContain('SMTP 535')
    expect(logged).not.toMatch(/token=/)
    expect(logged).not.toContain('ada@example.com')
  })

  it('does not make the response wait for the mail server (so timing reveals nothing)', async () => {
    const { client } = setup({ mailer: hanging })
    await register(client())
    const res = await client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    expect(res.status).toBe(200)
  })

  it('sends a friendly email with both text and HTML versions', async () => {
    const { client, mailer } = setup()
    await register(client())
    await client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    const email = mailer.outbox.at(-1)!
    expect(email).toMatchObject({ to: 'ada@example.com', subject: 'Reset your password' })
    expect(email.text).toContain('Hi Ada Lovelace')
    expect(email.html).toContain('Choose a new password')
    expect(email.text).toContain('expires in 1 hour')
  })
})

describe('account deletion', () => {
  it('requires the right confirmation and password', async () => {
    const { client, store } = setup()
    const c = client()
    await register(c)
    expect(
      (await c.delete('/api/account', { confirmEmail: 'other@example.com', password: PASSWORD }))
        .status,
    ).toBe(403)
    expect(
      (await c.delete('/api/account', { confirmEmail: 'ada@example.com', password: 'wrong' }))
        .status,
    ).toBe(403)
    expect((await c.delete('/api/account', { confirmEmail: 'ada@example.com' })).status).toBe(403)
    expect(store.users.findByEmail('ada@example.com')).toBeDefined()
  })

  it('removes the user, their sessions, and profiles only they belonged to', async () => {
    const { client, store } = setup()
    const c = client()
    const user = await register(c)
    await saveKey(c)
    const profileId = (await (await c.get('/api/profiles')).json())[0].id
    await createDraft(c, profileId, { title: 'Mine', body: 'x' })
    const second = await (await c.post('/api/profiles', { name: 'Second' })).json()
    await createDraft(c, second.id, { title: 'Also mine', body: 'y' })
    const idea = await (
      await c.post(`/api/profiles/${second.id}/ideas`, { name: 'An idea' })
    ).json()
    await c.post(`/api/profiles/${second.id}/ideas/${idea.id}/links`, {
      url: 'https://example.org',
    })
    await c.post(`/api/profiles/${second.id}/ideas/${idea.id}/notes`, { text: 'A note' })
    const ideaDraft = await (
      await c.post(`/api/profiles/${second.id}/ideas/${idea.id}/drafts`, { title: 'Idea draft' })
    ).json()
    await c.putBytes(`/api/profiles/${second.id}/image`, PNG_BYTES)
    expect(store.profiles.getImage(second.id)).toBeDefined()

    const res = await c.delete('/api/account', {
      confirmEmail: 'ada@example.com',
      password: PASSWORD,
    })
    expect(res.status).toBe(204)
    expect(store.profiles.getImage(second.id)).toBeUndefined()

    expect(store.users.findById(user.id)).toBeUndefined()
    expect(store.profiles.listIdsForUser(user.id)).toEqual([])
    expect(store.profiles.members(profileId)).toEqual([])
    expect(store.drafts.list(profileId)).toEqual([])
    expect(store.drafts.list(second.id)).toEqual([])
    expect(store.ideas.list(second.id)).toEqual([])
    expect(store.ideas.countLinks(idea.id)).toBe(0)
    expect(store.notes.list(idea.id)).toEqual([])
    expect(store.drafts.get(second.id, ideaDraft.id)).toBeUndefined()
    expect(store.users.getPasswordHash(user.id)).toBeUndefined()
    expect(store.credentials.get(user.id)).toBeUndefined() // their API key goes too
    expect((await c.get('/api/auth/me')).status).toBe(401)
    expect(
      (await client().post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD }))
        .status,
    ).toBe(401)
  })

  it('leaves shared profiles intact for the others, passing ownership on', async () => {
    const { client, store, mailer } = setup()
    const ada = client()
    const bob = client()
    const carol = client()
    await register(ada, 'ada@example.com', 'Ada')
    const bobUser = await register(bob, 'bob@example.com', 'Bob')
    const carolUser = await register(carol, 'carol@example.com', 'Carol')
    verifyAccounts({ store }, 'ada@example.com', 'bob@example.com', 'carol@example.com')

    const shared = await (await ada.post('/api/profiles', { name: 'Joint piece' })).json()
    await shareProfile({ mailer }, ada, shared.id, bob, 'bob@example.com')
    await shareProfile({ mailer }, ada, shared.id, carol, 'carol@example.com')
    await createDraft(ada, shared.id, { title: 'Co-written', body: 'text' })

    await ada.delete('/api/account', { confirmEmail: 'ada@example.com', password: PASSWORD })

    const view = await (await bob.get(`/api/profiles/${shared.id}`)).json()
    expect(view.members.map((m: { userId: string }) => m.userId)).toEqual([
      bobUser.id,
      carolUser.id,
    ])
    expect(view.members.find((m: { userId: string }) => m.userId === bobUser.id).role).toBe('owner')
    expect(await (await bob.get(`/api/profiles/${shared.id}/ideas`)).json()).toHaveLength(1)
    expect(store.users.findByEmail('ada@example.com')).toBeUndefined()
  })

  it('lets the email be used to register again', async () => {
    const { client } = setup()
    const c = client()
    await register(c)
    await c.delete('/api/account', { confirmEmail: 'ada@example.com', password: PASSWORD })
    await register(client())
  })

  it('requires being signed in', async () => {
    expect(
      (await setup().client().delete('/api/account', { confirmEmail: 'a@example.com' })).status,
    ).toBe(401)
  })
})
