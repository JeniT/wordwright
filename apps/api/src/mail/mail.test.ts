import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleParser } from 'mailparser'
import { SMTPServer } from 'smtp-server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMailer } from './factory'
import { FileMailer } from './file-mailer'
import { MailError, type Email } from '@wordwright/core'
import { mailerContract } from '@wordwright/core/testing'
import { ConsoleMailer } from './console-mailer'
import { SmtpMailer } from './smtp-mailer'
import { passwordResetEmail } from './templates'

const sample: Email = {
  to: 'ada@example.com',
  subject: 'Hello Ada',
  text: 'Plain text body with https://app.test/x?token=abc',
  html: '<p>HTML body</p>',
}

// ---- adapters under the contract ---------------------------------------
// The memory fake runs it in packages/core. ConsoleMailer is not one: see its comment.

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wordwright-mail-'))
  dirs.push(dir)
  return dir
}

mailerContract('file', async () => {
  const dir = tempDir()
  return {
    mailer: new FileMailer(dir),
    delivered: async () =>
      readdirSync(dir)
        .sort()
        .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Email),
  }
})

// A real SMTP server running in-process, so the SMTP adapter is tested over an actual connection.
interface TestSmtp {
  url: (auth?: string) => string
  messages: Email[]
  close: () => Promise<void>
}
async function startSmtp(credentials?: { user: string; pass: string }): Promise<TestSmtp> {
  const messages: Email[] = []
  const server = new SMTPServer({
    authOptional: !credentials,
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    onAuth(auth, _session, cb) {
      if (credentials && auth.username === credentials.user && auth.password === credentials.pass) {
        return cb(null, { user: auth.username })
      }
      cb(new Error('Invalid login'))
    },
    async onData(stream, _session, cb) {
      const parsed = await simpleParser(stream)
      messages.push({
        to: String((Array.isArray(parsed.to) ? parsed.to[0] : parsed.to)?.text),
        subject: parsed.subject ?? '',
        text: parsed.text ?? '',
        html: typeof parsed.html === 'string' ? parsed.html : undefined,
        // @ts-expect-error keep the From header for assertions
        from: parsed.from?.text,
      })
      cb()
    },
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.server.address() as { port: number }).port
  return {
    url: (auth = '') => `smtp://${auth}127.0.0.1:${port}`,
    messages,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

describe('SmtpMailer', () => {
  let smtp: TestSmtp
  beforeEach(async () => {
    smtp = await startSmtp({ user: 'apikey', pass: 's3cret-pass' })
  })
  afterEach(() => smtp.close())

  mailerContract('smtp', async () => {
    const server = await startSmtp()
    const mailer = new SmtpMailer({ url: server.url(), from: 'Writer <no-reply@example.com>' })
    return { mailer, delivered: async () => server.messages }
  })

  it('authenticates with credentials from the URL and sends from the configured address', async () => {
    const mailer = new SmtpMailer({
      url: smtp.url('apikey:s3cret-pass@'),
      from: 'Writer <no-reply@example.com>',
    })
    await mailer.verify()
    await mailer.send(sample)
    expect(smtp.messages).toHaveLength(1)
    expect((smtp.messages[0] as Email & { from?: string }).from).toContain('no-reply@example.com')
  })

  it('reports rejected credentials without leaking them', async () => {
    const mailer = new SmtpMailer({
      url: smtp.url('apikey:wrong-password@'),
      from: 'x@example.com',
    })
    const err = await mailer.send(sample).catch((e) => e)
    expect(err).toBeInstanceOf(MailError)
    expect(err.message).toMatch(/Email could not be sent/)
    expect(err.message).not.toContain('wrong-password')
    expect(err.message).not.toContain(sample.text)
    expect(smtp.messages).toHaveLength(0)
    await expect(mailer.verify()).rejects.toBeInstanceOf(MailError)
  })

  it('reports an unreachable server', async () => {
    const mailer = new SmtpMailer({ url: 'smtp://127.0.0.1:1', from: 'x@example.com' })
    await expect(mailer.send(sample)).rejects.toThrow(
      /Email could not be sent \(code ECONNECTION|ESOCKET/,
    )
  })
})

// ---- other behaviour -----------------------------------------------------

describe('ConsoleMailer', () => {
  it('prints the email, link included, so local development needs no provider', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await new ConsoleMailer().send(sample)
    const printed = String(log.mock.calls[0]![0])
    expect(printed).toContain('ada@example.com')
    expect(printed).toContain('https://app.test/x?token=abc')
    log.mockRestore()
  })
})

describe('createMailer', () => {
  const base = {
    MAIL_FROM: 'x@example.com',
    SMTP_URL: 'smtp://localhost:1025',
    MAIL_OUTBOX_DIR: '',
  }

  it('chooses the adapter named in config', () => {
    expect(createMailer({ ...base, MAIL_TRANSPORT: 'console' })).toBeInstanceOf(ConsoleMailer)
    expect(createMailer({ ...base, MAIL_TRANSPORT: 'smtp' })).toBeInstanceOf(SmtpMailer)
    expect(
      createMailer({ ...base, MAIL_TRANSPORT: 'file', MAIL_OUTBOX_DIR: tempDir() }),
    ).toBeInstanceOf(FileMailer)
  })
})

describe('passwordResetEmail', () => {
  const email = passwordResetEmail({
    name: 'Ada',
    link: 'https://app.test/reset-password?token=abc_-1',
    ttlMinutes: 60,
  })

  it('has the link in both the text and HTML versions, and says when it expires', () => {
    expect(email.text).toContain('https://app.test/reset-password?token=abc_-1')
    expect(email.html).toContain('href="https://app.test/reset-password?token=abc_-1"')
    expect(email.text).toContain('expires in 1 hour')
  })

  it('escapes user-supplied names in HTML (no markup injection) but not in plain text', () => {
    const evil = passwordResetEmail({
      name: '<img src=x onerror=alert(1)>"',
      link: 'https://app.test/r',
      ttlMinutes: 60,
    })
    expect(evil.html).not.toContain('<img')
    expect(evil.html).toContain('&lt;img')
    expect(evil.text).toContain('<img src=x')
  })

  it('escapes the link too', () => {
    const tricky = passwordResetEmail({
      name: 'A',
      link: 'https://app.test/r?a=1&b="2"',
      ttlMinutes: 30,
    })
    expect(tricky.html).toContain('a=1&amp;b=&quot;2&quot;')
    expect(tricky.text).toContain('30 minutes')
  })
})
