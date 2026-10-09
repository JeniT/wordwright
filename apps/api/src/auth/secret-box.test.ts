import { describe, expect, it } from 'vitest'
import { createSecretBox } from './secret-box'

const secret = 'a-long-enough-secret-for-testing-1234'

describe('SecretBox', () => {
  const box = createSecretBox(secret)

  it('round-trips, including unicode', () => {
    for (const text of ['sk-ant-abc123', '', 'påsswörd 🔑']) {
      expect(box.decrypt(box.encrypt(text, 'ctx'), 'ctx')).toBe(text)
    }
  })

  it('does not contain the plaintext and is different each time', () => {
    const a = box.encrypt('sk-ant-abc123', 'ctx')
    expect(a).not.toContain('sk-ant')
    expect(a).not.toBe(box.encrypt('sk-ant-abc123', 'ctx'))
  })

  it('refuses a different context (e.g. a ciphertext moved to another user)', () => {
    expect(() => box.decrypt(box.encrypt('secret', 'user-1'), 'user-2')).toThrow()
  })

  it('refuses a different secret', () => {
    const payload = box.encrypt('secret', 'ctx')
    expect(() =>
      createSecretBox('another-secret-another-secret-12345').decrypt(payload, 'ctx'),
    ).toThrow()
  })

  it('detects tampering and unknown formats', () => {
    const [v, iv, tag, ct] = box.encrypt('secret', 'ctx').split('.')
    const flipped = `${ct!.slice(0, -2)}${ct!.endsWith('A') ? 'B' : 'A'}A`
    expect(() => box.decrypt([v, iv, tag, flipped].join('.'), 'ctx')).toThrow()
    expect(() => box.decrypt('v2.a.b.c', 'ctx')).toThrow(/Unrecognised/)
    expect(() => box.decrypt('garbage', 'ctx')).toThrow()
  })
})
