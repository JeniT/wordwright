import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rate-limit'

describe('RateLimiter', () => {
  const clock = () => {
    const c = { now: 0, read: () => c.now }
    return c
  }

  it('allows `max` attempts a window for each key, then starts again', () => {
    const c = clock()
    const limiter = new RateLimiter(2, 1000, c.read)
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a')]).toEqual([
      true,
      true,
      false,
    ])
    expect(limiter.allow('b')).toBe(true)
    c.now = 1000
    expect(limiter.allow('a')).toBe(true)
  })

  // Keys are often typed by strangers (the address on a sign-in attempt), so they must not pile up forever (#317).
  it('forgets keys whose window is over', () => {
    const c = clock()
    const limiter = new RateLimiter(1, 1000, c.read, 3)
    for (const key of ['a', 'b', 'c']) limiter.allow(key)
    c.now = 1000
    limiter.allow('d')
    expect(limiter.size).toBe(1)
  })

  it('keeps no more than its cap even while every window is open, dropping the oldest first', () => {
    const c = clock()
    const limiter = new RateLimiter(1, 1000, c.read, 3)
    for (const key of ['a', 'b', 'c', 'd']) limiter.allow(key)
    expect(limiter.size).toBe(3)
    // 'a' was dropped, so it starts again; 'd' is still counted.
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('d')).toBe(false)
  })
})
