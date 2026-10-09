import { describe, expect, it } from 'vitest'
import { FakeIdentityProvider, type IdentityClaims } from './auth/identity'
import {
  lastResetToken,
  PASSWORD,
  PUBLIC_URL,
  register,
  setup,
  type TestClient,
} from './test-helpers'

const claims: IdentityClaims = {
  subject: 'google-123',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
}

function withIdp(overrides: Partial<IdentityClaims> = {}) {
  const idp = new FakeIdentityProvider({ ...claims, ...overrides }, 'google', 'Google')
  return { idp, ...setup({ identityProviders: [idp] }) }
}

/** Runs the redirect → callback round trip like a browser would. */
async function signInWithIdp(c: TestClient, options: { code?: string; state?: string } = {}) {
  const start = await c.get('/api/auth/oauth/google/start')
  expect(start.status).toBe(302)
  const location = new URL(start.headers.get('location')!)
  const state = location.searchParams.get('state')!
  return c.get(
    `/api/auth/oauth/google/callback?code=${options.code ?? 'good-code'}&state=${options.state ?? state}`,
  )
}

describe('login with an external identity provider', () => {
  it('lists the configured providers', async () => {
    const { client } = withIdp()
    expect(await (await client().get('/api/auth/config')).json()).toEqual({
      providers: [{ id: 'google', label: 'Google' }],
    })
    expect(await (await setup().client().get('/api/auth/config')).json()).toEqual({ providers: [] })
  })

  it('creates a verified account (with a suggested username, and no profile yet) on first login, then reuses it', async () => {
    const { client, store } = withIdp()
    const c = client()
    const res = await signInWithIdp(c)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(PUBLIC_URL)

    const me = await (await c.get('/api/auth/me')).json()
    expect(me).toMatchObject({
      email: 'ada@example.com',
      emailVerified: true,
      hasPassword: false,
      linkedProviders: ['google'],
    })
    expect(me.handle).toBe('adalovelace')
    expect(await (await c.get('/api/profiles')).json()).toEqual([])

    const again = client()
    await signInWithIdp(again)
    expect((await (await again.get('/api/auth/me')).json()).id).toBe(me.id)
    expect(store.profiles.listIdsForUser(me.id)).toHaveLength(0)
  })

  it('sends a PKCE challenge and uses the matching verifier on exchange', async () => {
    const { client, idp } = withIdp()
    const start = await client().get('/api/auth/oauth/google/start')
    expect(start.headers.get('location')).toMatch(/cc=/)
    await signInWithIdp(client())
    expect(idp.exchanged[0]!.codeVerifier.length).toBeGreaterThan(20)
  })

  it('rejects a callback with the wrong state, with no cookie, or with a bad code', async () => {
    const { client } = withIdp()
    const wrongState = client()
    expect(
      (await signInWithIdp(wrongState, { state: 'forged' })).headers.get('location'),
    ).toContain('error=oauth_failed')
    expect((await wrongState.get('/api/auth/me')).status).toBe(401)

    const noCookie = await client().get('/api/auth/oauth/google/callback?code=good-code&state=x')
    expect(noCookie.headers.get('location')).toContain('error=oauth_failed')

    const badCode = client()
    expect((await signInWithIdp(badCode, { code: 'bad' })).headers.get('location')).toContain(
      'error=oauth_failed',
    )
    expect((await badCode.get('/api/auth/me')).status).toBe(401)
  })

  it('refuses identities whose email the provider has not verified', async () => {
    const { client, store } = withIdp({ emailVerified: false })
    const c = client()
    const res = await signInWithIdp(c)
    expect(res.headers.get('location')).toContain('error=email_not_verified')
    expect(store.users.findByEmail('ada@example.com')).toBeUndefined()
  })

  it('sends people back to where they were going (e.g. an invitation link) after signing in', async () => {
    const { client } = withIdp()
    const c = client()
    const start = await c.get('/api/auth/oauth/google/start?next=/accept-invite%3Ftoken%3Dabc')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const res = await c.get(`/api/auth/oauth/google/callback?code=good-code&state=${state}`)
    expect(res.headers.get('location')).toBe(`${PUBLIC_URL}/accept-invite?token=abc`)
  })

  it.each([
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/ok\nfoo',
  ])('ignores a "next" that could leave the site (%s)', async (next) => {
    const { client } = withIdp()
    const c = client()
    const start = await c.get(`/api/auth/oauth/google/start?next=${encodeURIComponent(next)}`)
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const res = await c.get(`/api/auth/oauth/google/callback?code=good-code&state=${state}`)
    expect(res.headers.get('location')).toBe(PUBLIC_URL)
  })

  it('404s for unknown providers', async () => {
    expect((await setup().client().get('/api/auth/oauth/nope/start')).status).toBe(404)
  })

  it('links to an existing email-verified local account and keeps its password', async () => {
    const { client, mailer } = withIdp()
    const local = client()
    const created = await register(local)
    // Verify the address via the reset flow.
    await client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    await client().post('/api/auth/reset-password', {
      token: lastResetToken(mailer),
      password: 'fresh password 123',
    })

    const c = client()
    await signInWithIdp(c)
    const me = await (await c.get('/api/auth/me')).json()
    expect(me).toMatchObject({ id: created.id, hasPassword: true, linkedProviders: ['google'] })
    expect(
      (
        await client().post('/api/auth/login', {
          email: 'ada@example.com',
          password: 'fresh password 123',
        })
      ).status,
    ).toBe(200)
  })

  it('discards the password of an unverified local account when the real owner signs in (pre-registration attack)', async () => {
    const { client } = withIdp()
    const attacker = client()
    await register(attacker, 'ada@example.com', 'Not Ada', 'attackers password')

    const owner = client()
    await signInWithIdp(owner)
    const me = await (await owner.get('/api/auth/me')).json()
    expect(me).toMatchObject({ hasPassword: false, emailVerified: true })

    // The attacker's password and existing session no longer work.
    expect(
      (
        await client().post('/api/auth/login', {
          email: 'ada@example.com',
          password: 'attackers password',
        })
      ).status,
    ).toBe(401)
    expect((await attacker.get('/api/auth/me')).status).toBe(401)
  })

  it('lets an identity-only user delete their account with just the email', async () => {
    const { client, store } = withIdp()
    const c = client()
    await signInWithIdp(c)
    expect((await c.delete('/api/account', { confirmEmail: 'ada@example.com' })).status).toBe(204)
    expect(store.users.findByIdentity('google', 'google-123')).toBeUndefined()
  })

  it('does not email reset links to identity-only accounts', async () => {
    const { client, mailer } = withIdp()
    await signInWithIdp(client())
    await client().post('/api/auth/forgot-password', { email: 'ada@example.com' })
    expect(mailer.outbox).toHaveLength(0)
  })
})

describe('password policy sanity', () => {
  it('has a usable test password', () => {
    expect(PASSWORD.length).toBeGreaterThanOrEqual(10)
  })
})
