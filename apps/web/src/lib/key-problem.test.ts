import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { keyProblemOf } from './key-problem'

describe('keyProblemOf', () => {
  it('says a key is missing', () => {
    expect(keyProblemOf(new ApiError(409, 'Add your Anthropic API key to use this feature'))).toBe(
      'missing-key',
    )
  })

  it.each([409, 400])('says a key was rejected, whatever the status (%i)', (status) => {
    expect(keyProblemOf(new ApiError(status, 'Your API key was rejected by the provider.'))).toBe(
      'rejected-key',
    )
  })

  it('leaves other problems alone', () => {
    expect(keyProblemOf(new ApiError(502, 'The AI provider returned an error.'))).toBeNull()
    expect(keyProblemOf(new ApiError(409, 'This draft changed.'))).toBeNull()
    expect(keyProblemOf(new Error('API key'))).toBeNull()
  })
})
