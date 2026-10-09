import { describe, expect, it } from 'vitest'
import { createScryptHasher } from './password'
import { RateLimiter } from './rate-limit'

describe('scrypt hasher', () => {
  const hasher = createScryptHasher({ cost: 16 })

  it('verifies the right password only', async () => {
    const hash = await hasher.hash('hunter2-hunter2')
    expect(await hasher.verify('hunter2-hunter2', hash)).toBe(true)
    expect(await hasher.verify('hunter3-hunter3', hash)).toBe(false)
  })

  it('salts, so equal passwords hash differently', async () => {
    expect(await hasher.hash('same-password')).not.toBe(await hasher.hash('same-password'))
  })

  it('verifies hashes made with a different cost (so cost can be raised later)', async () => {
    const old = await createScryptHasher({ cost: 32 }).hash('pw-pw-pw-pw')
    expect(await hasher.verify('pw-pw-pw-pw', old)).toBe(true)
  })

  it('treats malformed stored values as a failed match', async () => {
    expect(await hasher.verify('x', 'garbage')).toBe(false)
    expect(await hasher.verify('x', 'bcrypt$1$2$3$4$5')).toBe(false)
  })
})

describe('RateLimiter', () => {
  it('allows up to the max per window, then resets', () => {
    let now = 0
    const limiter = new RateLimiter(2, 1000, () => now)
    expect([limiter.allow('k'), limiter.allow('k'), limiter.allow('k')]).toEqual([
      true,
      true,
      false,
    ])
    expect(limiter.allow('other')).toBe(true)
    now = 1001
    expect(limiter.allow('k')).toBe(true)
  })
})
