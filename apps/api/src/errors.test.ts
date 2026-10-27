import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainError, describeError, fail, notFound } from './errors'
import { setup } from './test-helpers'
import { param } from './routes/params'

describe('errors', () => {
  it('fail carries the status and a message the person can read', () => {
    const err = fail(409, 'Already there.')
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({ status: 409, message: 'Already there.' })
    expect(notFound()).toMatchObject({ status: 404, message: 'Not found' })
  })

  it('param returns the path parameter, or answers a missing one with a 404 rather than a crash', () => {
    expect(param({ req: { param: () => 'abc' } }, 'id')).toBe('abc')
    expect(() => param({ req: { param: () => undefined } }, 'id')).toThrow(
      expect.objectContaining({ status: 404 }),
    )
  })

  it('keeps Hono out of the services: they throw DomainError, and app.ts maps it to HTTP', () => {
    const dir = join(__dirname, 'services')
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => readFileSync(join(dir, f), 'utf8').includes("from 'hono"))
    expect(offenders).toEqual([])
  })

  it('logs what an unexpected error was and where, never its message (which can quote a request or a key)', async () => {
    const logged: string[] = []
    const { app } = setup({
      logger: { error: (...args: unknown[]) => logged.push(args.join(' ')) },
    })
    app.get('/boom', () => {
      const err = Object.assign(
        new Error('Bearer sk-ant-api03-SECRET and {"password":"hunter2"}'),
        {
          code: 'ERR_TEST',
        },
      )
      throw err
    })
    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
    const line = logged.join('\n')
    expect(line).toContain('GET /boom failed')
    expect(line).toContain('Error code ERR_TEST')
    expect(line).not.toMatch(/sk-ant|hunter2|Bearer/)
  })
})

describe('describeError', () => {
  it('names a thrown non-error without printing it', () => {
    expect(describeError('a secret string')).toBe('non-error thrown (string)')
  })

  it('keeps the type and the first stack frames, and drops the message', () => {
    const text = describeError(new TypeError('quoted user text'))
    expect(text).toContain('TypeError')
    expect(text).toContain('at ')
    expect(text).not.toContain('quoted user text')
  })
})

describe('logging', () => {
  it('writes to the log only from places that have been reviewed for what they print', () => {
    // Production logs must hold no request bodies, keys, tokens, links or writing (#17, #322). Each file here was read
    // for that: errors are described by `describeError` or by name, and mail failures print an error code, never the
    // message. A new logging call in another file fails this test so that someone looks at it first.
    const reviewed = [
      'admin-cli.ts', // a command run by hand: prints fixed sentences and the address the operator typed
      'replay-deletions-cli.ts', // a command run by hand: prints counts and the time the operator typed
      'forget-kept-name-cli.ts', // a command run by hand: prints counts and the name the operator typed
      'forget-ai-keys-cli.ts', // a command run by hand: prints counts only
      'app.ts',
      'server.ts',
      'mail/background.ts',
      'mail/console-mailer.ts', // the console mailer, which production refuses to start with
      'routes/assist.ts',
      'services/deletion-journal.ts', // logs the error's name only, never a path or an id
      'services/brainstorm.ts',
      'services/icon-backfill.ts',
      'services/maintenance.ts',
    ]
    const root = __dirname
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (name.endsWith('.ts') && !name.includes('.test.') && name !== 'test-helpers.ts')
          files.push(path)
      }
    }
    walk(root)
    const logging =
      /(console\.(log|error|warn|info|debug)\(|logger\??\.(log|error|warn|info)\(|\?\? console\)\.(log|error|warn|info)\()/
    const found = files
      .filter((f) => logging.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1))
      .sort()
    expect(found).toEqual([...reviewed].sort())
  })
})
