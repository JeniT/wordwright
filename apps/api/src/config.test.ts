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
      MAIL_TRANSPORT: 'smtp',
      SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
      MAIL_FROM: 'Writer <no-reply@example.com>',
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
    expect(() => loadConfig({ ...ok, MAIL_TRANSPORT: 'console' })).toThrow(/MAIL_TRANSPORT/)
    expect(() => loadConfig({ ...ok, MAIL_FROM: '' })).toThrow(/MAIL_FROM/)
  })

  it('needs no email provider by default: mail is printed to the console', () => {
    expect(loadConfig({})).toMatchObject({ MAIL_TRANSPORT: 'console' })
  })

  it('requires a valid SMTP_URL when sending for real', () => {
    expect(() => loadConfig({ MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/)
    expect(() => loadConfig({ MAIL_TRANSPORT: 'smtp', SMTP_URL: 'localhost:1025' })).toThrow(
      /SMTP_URL/,
    )
    expect(
      loadConfig({ MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://localhost:1025' }).MAIL_TRANSPORT,
    ).toBe('smtp')
  })

  it('has no server-wide LLM key setting', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-should-be-ignored' })).not.toHaveProperty(
      'ANTHROPIC_API_KEY',
    )
  })

  it('keeps unused unconfirmed accounts for 14 days by default; 0 disables; junk is rejected', () => {
    expect(loadConfig({}).UNCONFIRMED_ACCOUNT_TTL_DAYS).toBe(14)
    expect(loadConfig({ UNCONFIRMED_ACCOUNT_TTL_DAYS: '0' }).UNCONFIRMED_ACCOUNT_TTL_DAYS).toBe(0)
    expect(() => loadConfig({ UNCONFIRMED_ACCOUNT_TTL_DAYS: '-1' })).toThrow()
    expect(() => loadConfig({ UNCONFIRMED_ACCOUNT_TTL_DAYS: '2.5' })).toThrow()
  })

  it('needs both Google settings or neither', () => {
    expect(() => loadConfig({ GOOGLE_CLIENT_ID: 'id' })).toThrow(/GOOGLE_CLIENT/)
  })
})
