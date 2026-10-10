import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { FakeIdentityProvider } from './auth/identity'
import { MIGRATIONS, migrate } from './db/database'
import { PASSWORD, register, setup, signUp, type TestClient } from './test-helpers'

const put = (c: TestClient, handle: string) => c.put('/api/account/handle', { handle })

describe('changing your username', () => {
  it('changes it, and the new one is what the account and new profiles use', async () => {
    const { client } = setup()
    const c = client()
    await signUp(c, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    const res = await put(c, '  Lovelace ')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ handle: 'lovelace', handleChosen: true })
    expect((await (await c.get('/api/auth/me')).json()).handle).toBe('lovelace')
    const profile = await (await c.post('/api/profiles', { name: 'Substack' })).json()
    expect(profile.id).toBe('lovelace-substack')
  })

  it('leaves existing profile addresses alone, and a later rename moves them to the new username', async () => {
    const { client } = setup()
    const c = client()
    await signUp(c, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    const first = await (await c.post('/api/profiles', { name: 'Substack' })).json()
    expect(first.id).toBe('countess-substack')

    await put(c, 'lovelace')
    expect((await c.get('/api/profiles/countess-substack')).status).toBe(200)
    expect((await (await c.get('/api/profiles')).json()).map((p: { id: string }) => p.id)).toEqual([
      'countess-substack',
    ])

    // Renaming re-derives the address; the old one keeps leading to it.
    const renamed = await (
      await c.patch('/api/profiles/countess-substack', { name: 'Letters' })
    ).json()
    expect(renamed.id).toBe('lovelace-letters')
    expect((await c.get('/api/profiles/countess-substack')).status).toBeLessThan(400)
  })

  it('refuses a username that is taken, however it is capitalised', async () => {
    const { client } = setup()
    await signUp(client(), 'bob@example.com', 'Bob', PASSWORD, 'bobby')
    const c = client()
    await signUp(c, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    const res = await put(c, 'BOBBY')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('That username is already taken. Try another.')
    expect((await (await c.get('/api/auth/me')).json()).handle).toBe('countess')
  })

  it('refuses badly formed and reserved usernames, here and at sign-up', async () => {
    const { client } = setup()
    const c = client()
    await signUp(c, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    const message = async (handle: unknown) => (await (await put(c, handle as string)).json()).error
    expect(await message('ab')).toBe('Use at least 3 characters for your username')
    expect(await message('has space')).toBe('Use only letters and numbers in your username')
    expect(await message('Admin')).toBe('That username is reserved. Try another.')
    const signup = await client().post('/api/auth/register', {
      name: 'Eve',
      email: 'eve@example.com',
      password: PASSWORD,
      handle: 'support',
    })
    expect(signup.status).toBe(400)
  })

  it('keeps the old username for its owner: nobody else can take it, but they can come back', async () => {
    const { client, store } = setup()
    const ada = client()
    await signUp(ada, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    await put(ada, 'lovelace')

    const bob = client()
    await signUp(bob, 'bob@example.com', 'Bob', PASSWORD, 'bobby')
    expect((await put(bob, 'countess')).status).toBe(409)
    expect(await (await client().get('/api/auth/handle-available?handle=countess')).json()).toEqual(
      { available: false },
    )
    expect(
      (
        await client().post('/api/auth/register', {
          name: 'Eve',
          email: 'eve@example.com',
          password: PASSWORD,
          handle: 'countess',
        })
      ).status,
    ).toBe(409)

    expect((await put(ada, 'countess')).status).toBe(200) // back again
    expect((await put(bob, 'lovelace')).status).toBe(409) // and now lovelace is the one kept
    expect(store.users.handleTaken('lovelace')).toBe(true)
  })

  it('frees the kept usernames when the account is deleted', async () => {
    const { client, store } = setup()
    const ada = client()
    await register(ada, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    await put(ada, 'lovelace')
    const res = await ada.delete('/api/account', {
      confirmEmail: 'ada@example.com',
      password: PASSWORD,
    })
    expect(res.status).toBe(204)
    expect(store.users.handleTaken('countess')).toBe(false)
    expect(store.users.handleTaken('lovelace')).toBe(false)
  })

  it('allows five changes a day, but saying "keep this one" costs nothing', async () => {
    const { client } = setup()
    const c = client()
    await signUp(c, 'ada@example.com', 'Ada', PASSWORD, 'countess')
    for (const handle of ['one1', 'two2', 'three', 'four4', 'five5']) {
      expect((await put(c, handle)).status, handle).toBe(200)
    }
    expect((await put(c, 'six666')).status).toBe(429)
    expect((await put(c, 'five5')).status).toBe(200) // the one they have
  })

  it('needs sign-in', async () => {
    expect((await put(setup().client(), 'whatever')).status).toBe(401)
  })
})

describe('existing accounts', () => {
  it('count as having chosen their username, and start with none kept', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    const at = MIGRATIONS.findIndex(
      (m) => typeof m === 'string' && m.includes('CREATE TABLE retired_handles'),
    )
    expect(at).toBeGreaterThan(0)
    migrate(db, 'test', MIGRATIONS.slice(0, at))
    db.exec(
      "INSERT INTO users (id, handle, name, email, email_verified, created_at) VALUES ('u', 'ada', 'Ada', 'a@example.com', 1, 'then')",
    )
    migrate(db, 'test')
    expect(db.prepare("SELECT handle_chosen FROM users WHERE id = 'u'").get()).toEqual({
      handle_chosen: 1,
    })
    expect(db.prepare('SELECT count(*) AS n FROM retired_handles').get()).toEqual({ n: 0 })
  })
})

describe('a username we generated', () => {
  it('is flagged until the person answers, once, by choosing or keeping it', async () => {
    const idp = new FakeIdentityProvider(
      { subject: 'g1', email: 'grace@example.com', emailVerified: true, name: 'Grace Hopper' },
      'google',
      'Google',
    )
    const { client } = setup({ identityProviders: [idp] })
    const c = client()
    const start = await c.get('/api/auth/oauth/google/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    await c.get(`/api/auth/oauth/google/callback?code=good-code&state=${state}`)
    const me = await (await c.get('/api/auth/me')).json()
    expect(me).toMatchObject({ handle: 'gracehopper', handleChosen: false })

    const kept = await put(c, 'gracehopper')
    expect(kept.status).toBe(200)
    expect(await kept.json()).toMatchObject({ handle: 'gracehopper', handleChosen: true })
    expect((await (await c.get('/api/auth/me')).json()).handleChosen).toBe(true)
  })

  it('is not flagged for people who chose theirs at sign-up', async () => {
    const c = setup().client()
    expect(await signUp(c, 'ada@example.com', 'Ada', PASSWORD, 'countess')).toMatchObject({
      handleChosen: true,
    })
  })
})
