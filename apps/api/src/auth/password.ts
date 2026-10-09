import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, stored: string): Promise<boolean>
}

const KEY_LENGTH = 64

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

/**
 * scrypt via node:crypto (no native dependency). Stored as
 * `scrypt$N$r$p$salt$hash`, so the cost can be raised later and old hashes still verify.
 * Tests pass a small `cost` to stay fast.
 */
export function createScryptHasher({ cost = 2 ** 15, r = 8, p = 1 } = {}): PasswordHasher {
  const maxmem = 256 * cost * r
  return {
    async hash(password) {
      const salt = randomBytes(16)
      const key = await derive(password, salt, { N: cost, r, p, maxmem })
      return ['scrypt', cost, r, p, salt.toString('base64'), key.toString('base64')].join('$')
    },
    async verify(password, stored) {
      const [scheme, N, rr, pp, salt, hash] = stored.split('$')
      if (scheme !== 'scrypt' || !N || !rr || !pp || !salt || !hash) return false
      const expected = Buffer.from(hash, 'base64')
      const options = {
        N: Number(N),
        r: Number(rr),
        p: Number(pp),
        maxmem: 256 * Number(N) * Number(rr),
      }
      const actual = await derive(password, Buffer.from(salt, 'base64'), options)
      return actual.length === expected.length && timingSafeEqual(actual, expected)
    },
  }
}
