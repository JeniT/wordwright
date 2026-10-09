import { describe, expect, it } from 'vitest'
import { safeNextPath } from './redirect'

describe('safeNextPath', () => {
  it('keeps same-site paths, including query strings', () => {
    expect(safeNextPath('/p/abc')).toBe('/p/abc')
    expect(safeNextPath('/accept-invite?token=abc_-1')).toBe('/accept-invite?token=abc_-1')
  })

  it.each([
    undefined,
    '',
    42,
    ['/a'],
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/with\nnewline',
    `/${'a'.repeat(600)}`,
  ])('drops %j', (value) => {
    expect(safeNextPath(value)).toBeUndefined()
  })
})
