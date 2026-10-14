import { describe, expect, it } from 'vitest'
import { readZip } from '../test-helpers'
import { zip } from './zip'

describe('zip', () => {
  it('round-trips text files, including non-ASCII names and content', () => {
    const files = [
      { path: 'a/readme.md', content: '# Hello\n\nWörld ✓\n' },
      { path: 'a/dräfts/one.md', content: '' },
      { path: 'big.md', content: 'repeat me. '.repeat(5000) },
    ]
    const read = readZip(zip(files, new Date('2026-10-14T12:00:00Z')))
    expect(read).toEqual(Object.fromEntries(files.map((f) => [f.path, f.content])))
  })

  it('writes a valid empty archive', () => {
    expect(readZip(zip([]))).toEqual({})
  })

  it('refuses paths that could escape the folder it is unpacked into', () => {
    for (const path of ['../x.md', '/abs.md', 'a/../../x.md', 'a\\b.md', '']) {
      expect(() => zip([{ path, content: 'x' }]), path).toThrow()
    }
  })
})
