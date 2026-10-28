import { describe, expect, it } from 'vitest'
import { jsonObjectsIn } from './services/model-json'

describe('jsonObjectsIn', () => {
  it('finds every top-level object, in order, whatever surrounds them', () => {
    expect(jsonObjectsIn('Here: {"a": 1}\n```json\n{"b": {"c": 2}}\n```\nDone.')).toEqual([
      { a: 1 },
      { b: { c: 2 } },
    ])
  })

  it('does not count braces inside strings, escaped quotes included', () => {
    expect(jsonObjectsIn('{"a": "} { \\" }"}')).toEqual([{ a: '} { " }' }])
  })

  it('skips braces that are not JSON, and finds nothing in plain text', () => {
    expect(jsonObjectsIn('{not json} then {"ok": true}')).toEqual([{ ok: true }])
    expect(jsonObjectsIn('Tighten the opening.')).toEqual([])
    expect(jsonObjectsIn('{"unterminated": ')).toEqual([])
  })
})
