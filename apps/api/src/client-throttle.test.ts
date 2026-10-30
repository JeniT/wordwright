import { describe, expect, it } from 'vitest'
import { setup, type TestClient } from './test-helpers'

/**
 * Throttling by where requests come from (#390), on top of throttling by account. Behind Caddy (`trustProxy`), the
 * client's address is the last entry of X-Forwarded-For, the one Caddy itself writes.
 */
const from = (address: string) => ({ 'x-forwarded-for': address })

const login = (c: TestClient, email: string, address: string) =>
  c.request('POST', '/api/auth/login', { email, password: 'wrong-guess' }, from(address))

describe('signing in from one address', () => {
  it('stops one person trying a password against many accounts, and says when to try again', async () => {
    const ctx = setup({ trustProxy: true })
    const c = ctx.client()
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) {
      statuses.push((await login(c, `person${i}@example.com`, '203.0.113.7')).status)
    }
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true)
    const refused = await login(c, 'another@example.com', '203.0.113.7')
    expect(refused.status).toBe(429)
    expect((await refused.json()).error).toMatch(/15 minutes/)

    // Someone else, somewhere else, is not held up.
    expect((await login(ctx.client(), 'ada@example.com', '198.51.100.2')).status).toBe(401)
  })

  it('counts the last address in the header, the one nearest the API', async () => {
    const ctx = setup({ trustProxy: true })
    const c = ctx.client()
    for (let i = 0; i < 30; i++) {
      // Caddy replaces the header, but if anything in front of it appended, the last entry is still the one it saw.
      await login(c, `person${i}@example.com`, `10.0.0.${i}, 203.0.113.7`)
    }
    expect((await login(c, 'another@example.com', '10.9.9.9, 203.0.113.7')).status).toBe(429)
  })

  // One connection is usually handed a whole /64 of IPv6 addresses, so a new address each time must not reset the count.
  it('counts an IPv6 /64 as one address', async () => {
    const ctx = setup({ trustProxy: true })
    const c = ctx.client()
    for (let i = 0; i < 30; i++) {
      await login(c, `person${i}@example.com`, `2001:db8:1:2::${(i + 1).toString(16)}`)
    }
    expect((await login(c, 'another@example.com', '2001:0db8:0001:0002:ffff::9')).status).toBe(429)
    expect((await login(c, 'another@example.com', '2001:db8:1:3::1')).status).toBe(401)
  })

  it('stops one person asking for reset emails to many addresses', async () => {
    const ctx = setup({ trustProxy: true })
    const c = ctx.client()
    const ask = (email: string, address: string) =>
      c.request('POST', '/api/auth/forgot-password', { email }, from(address))
    for (let i = 0; i < 10; i++) {
      expect((await ask(`person${i}@example.com`, '203.0.113.7')).status).toBe(200)
    }
    const refused = await ask('another@example.com', '203.0.113.7')
    expect(refused.status).toBe(429)
    expect((await refused.json()).error).toMatch(/15 minutes/)
    expect((await ask('another@example.com', '198.51.100.2')).status).toBe(200)
  })

  it('lets a household sign up a few accounts, but not one person a crowd', async () => {
    const ctx = setup({ trustProxy: true })
    const signUp = (i: number, address: string) =>
      ctx.client().request(
        'POST',
        '/api/auth/register',
        {
          name: `Person ${i}`,
          email: `p${i}@example.com`,
          password: 'correct horse battery',
          handle: `person${i}`,
        },
        from(address),
      )
    for (let i = 0; i < 5; i++) expect((await signUp(i, '203.0.113.7')).status).toBe(201)
    const refused = await signUp(5, '203.0.113.7')
    expect(refused.status).toBe(429)
    expect((await refused.json()).error).toMatch(/an hour/)
    expect((await signUp(6, '198.51.100.2')).status).toBe(201)
  })

  // The check is one shared allowance for everyone; one person must not be able to use it all up.
  it('stops one person using up the username check, leaving it working for others', async () => {
    const ctx = setup({ trustProxy: true })
    const c = ctx.client()
    const check = (address: string) =>
      c.request('GET', '/api/auth/handle-available?handle=countess', undefined, from(address))
    for (let i = 0; i < 60; i++) expect((await check('203.0.113.7')).status).toBe(200)
    const refused = await check('203.0.113.7')
    expect(refused.status).toBe(429)
    expect((await refused.json()).error).toMatch(/a minute/)
    expect((await check('198.51.100.2')).status).toBe(200)
  })

  it('ignores the header when the API is not behind the proxy, since anyone could have written it', async () => {
    const ctx = setup()
    const c = ctx.client()
    const statuses: number[] = []
    for (let i = 0; i < 40; i++) {
      statuses.push((await login(c, `person${i}@example.com`, '203.0.113.7')).status)
    }
    expect(statuses.every((s) => s === 401)).toBe(true)
  })
})
