import { describe, expect, it } from 'vitest'
import { PasswordSchema } from './domain'

describe('PasswordSchema', () => {
  it('accepts 8 to 128 characters with no composition rules', () => {
    expect(PasswordSchema.safeParse('aaaaaaaa').success).toBe(true)
    expect(PasswordSchema.safeParse('a'.repeat(128)).success).toBe(true)
  })

  it('rejects 7 characters, saying what to do', () => {
    const result = PasswordSchema.safeParse('aaaaaaa')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Use at least 8 characters')
  })

  it('rejects more than 128 characters', () => {
    expect(PasswordSchema.safeParse('a'.repeat(129)).success).toBe(false)
  })
})
