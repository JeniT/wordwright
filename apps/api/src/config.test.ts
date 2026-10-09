import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toMatchObject({
      PORT: 8787,
      LLM_PROVIDER: 'fake',
      PUBLIC_URL: 'http://localhost:5173',
    })
  })

  it('requires an API key for the anthropic provider', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('insists on a real secret and https in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'x'.repeat(32),
        PUBLIC_URL: 'http://example.com',
      }),
    ).toThrow(/https/)
    expect(
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'x'.repeat(32),
        PUBLIC_URL: 'https://example.com',
      }),
    ).toBeTruthy()
  })

  it('needs both Google settings or neither', () => {
    expect(() => loadConfig({ GOOGLE_CLIENT_ID: 'id' })).toThrow(/GOOGLE_CLIENT/)
  })
})
