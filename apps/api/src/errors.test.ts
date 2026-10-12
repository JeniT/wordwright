import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainError, fail, notFound } from './errors'
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
})
