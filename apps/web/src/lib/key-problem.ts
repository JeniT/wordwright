import { ApiError } from './api'

/** `missing-key`: none saved yet. `rejected-key`: the provider refused it. Either way the fix is the AI key page. */
export type KeyProblem = 'missing-key' | 'rejected-key'

/**
 * Whether a failed AI request was about the person's key. The server words these differently by route (409 or
 * 400), so this reads the message rather than the status alone.
 */
export function keyProblemOf(err: unknown): KeyProblem | null {
  if (!(err instanceof ApiError) || !/API key/i.test(err.message)) return null
  if (/rejected/i.test(err.message)) return 'rejected-key'
  return err.status === 409 ? 'missing-key' : null
}
