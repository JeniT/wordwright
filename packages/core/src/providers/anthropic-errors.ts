import Anthropic from '@anthropic-ai/sdk'
import { LLMAuthError, LLMProviderError, LLMRateLimitError } from './llm'

/**
 * Turns the SDK's errors into ours. Messages say what happened, never what was sent: requests
 * hold people's writing and must not end up in logs.
 */
export function translate(err: unknown): unknown {
  if (err instanceof Anthropic.APIUserAbortError) return err // the caller aborted; not a failure to explain
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401 || err.status === 403) {
      return new LLMAuthError('Anthropic rejected the API key')
    }
    if (err instanceof Anthropic.RateLimitError) {
      const wait = Number(err.headers?.get('retry-after'))
      return new LLMRateLimitError(
        'Anthropic is limiting requests for this key',
        Number.isFinite(wait) && wait > 0 ? wait : undefined,
      )
    }
    return new LLMProviderError(
      err.status ? `Anthropic returned an error (${err.status})` : 'Anthropic could not be reached',
      { cause: err },
    )
  }
  return err
}
