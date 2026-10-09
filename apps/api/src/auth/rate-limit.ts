/**
 * Fixed-window, in-memory limiter. Good enough for one process; use a shared store
 * (Redis, the database) once the API runs as more than one instance.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt; returns false once the key has exceeded the limit. */
  allow(key: string): boolean {
    const now = this.now()
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    entry.count++
    return entry.count <= this.max
  }
}
