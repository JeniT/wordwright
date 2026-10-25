/**
 * Fixed-window, in-memory limiter. Good enough for one process; use a shared store
 * (Redis, the database) once the API runs as more than one instance.
 *
 * Keys are often chosen by strangers (the address typed into a sign-in form), so it keeps at most `maxKeys`: past that it
 * forgets the keys whose window is over, then the oldest. Dropping a key early only resets that key's count, and it
 * takes `maxKeys` other keys to push one out, which is far more work than the guesses it would win back.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 100_000,
  ) {}

  /** Records an attempt; returns false once the key has exceeded the limit. */
  allow(key: string): boolean {
    const now = this.now()
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      // Deleted first, so the map stays in order of when each window started.
      this.hits.delete(key)
      this.makeRoom(now)
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    entry.count++
    return entry.count <= this.max
  }

  /** How many keys it is keeping (for tests). */
  get size(): number {
    return this.hits.size
  }

  /** Every window is as long, so the ones that are over are all at the front: this stops at the first still open. */
  private makeRoom(now: number) {
    if (this.hits.size < this.maxKeys) return
    for (const [key, entry] of this.hits) {
      if (entry.resetAt > now && this.hits.size < this.maxKeys) break
      this.hits.delete(key)
    }
  }
}
