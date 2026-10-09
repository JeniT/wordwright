import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toMatchObject({
      PORT: 8787,
      FAKE_LLM: false,
      PUBLIC_URL: 'http://localhost:5173',
    })
  })

  it('insists on real secrets, https and no fake LLM in production', () => {
    const ok = {
      NODE_ENV: 'production',
      SESSION_SECRET: 'x'.repeat(32),
      KEY_ENCRYPTION_SECRET: 'y'.repeat(32),
      PUBLIC_URL: 'https://example.com',
    }
    expect(loadConfig(ok)).toBeTruthy()
    expect(() => loadConfig({ ...ok, SESSION_SECRET: '' })).toThrow(/SESSION_SECRET/)
    expect(() => loadConfig({ ...ok, KEY_ENCRYPTION_SECRET: 'short' })).toThrow(
      /KEY_ENCRYPTION_SECRET/,
    )
    expect(() => loadConfig({ ...ok, PUBLIC_URL: 'http://example.com' })).toThrow(/https/)
    expect(() => loadConfig({ ...ok, FAKE_LLM: 'true' })).toThrow(/FAKE_LLM/)
  })

  it('has no server-wide LLM key setting', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-should-be-ignored' })).not.toHaveProperty(
      'ANTHROPIC_API_KEY',
    )
  })

  it('needs both Google settings or neither', () => {
    expect(() => loadConfig({ GOOGLE_CLIENT_ID: 'id' })).toThrow(/GOOGLE_CLIENT/)
  })
})
