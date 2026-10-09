import { describe, expect, it } from 'vitest'
import { diffLines, foldUnchanged } from './diff'

describe('diffLines', () => {
  it('marks added, removed and unchanged lines', () => {
    expect(diffLines('one\ntwo\nthree', 'one\n2\nthree\nfour')).toEqual([
      { kind: 'same', text: 'one' },
      { kind: 'removed', text: 'two' },
      { kind: 'added', text: '2' },
      { kind: 'same', text: 'three' },
      { kind: 'added', text: 'four' },
    ])
  })

  it('handles an empty side, and identical text', () => {
    expect(diffLines('', 'a\nb')).toEqual([
      { kind: 'added', text: 'a' },
      { kind: 'added', text: 'b' },
    ])
    expect(diffLines('a', '')).toEqual([{ kind: 'removed', text: 'a' }])
    expect(diffLines('same\ntext', 'same\ntext').every((l) => l.kind === 'same')).toBe(true)
    expect(diffLines('', '')).toEqual([])
  })

  it('reconstructs both texts from the result', () => {
    const before = 'a\nb\nc\nd\ne\nf'
    const after = 'a\nc\nx\nd\ne\ny\nf'
    const lines = diffLines(before, after)
    expect(
      lines
        .filter((l) => l.kind !== 'added')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(before)
    expect(
      lines
        .filter((l) => l.kind !== 'removed')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(after)
  })

  it('falls back to remove-all, add-all for texts too large to compare', () => {
    const big = Array.from({ length: 2100 }, (_, i) => `line ${i}`).join('\n')
    const other = Array.from({ length: 2100 }, (_, i) => `other ${i}`).join('\n')
    const lines = diffLines(big, other)
    expect(lines.filter((l) => l.kind === 'removed')).toHaveLength(2100)
    expect(lines.filter((l) => l.kind === 'added')).toHaveLength(2100)
  })
})

describe('foldUnchanged', () => {
  it('keeps lines beside a change and folds the long unchanged runs between', () => {
    const lines = diffLines(
      Array.from({ length: 12 }, (_, i) => `l${i}`).join('\n'),
      Array.from({ length: 12 }, (_, i) => (i === 6 ? 'CHANGED' : `l${i}`)).join('\n'),
    )
    const rows = foldUnchanged(lines, 1)
    expect(rows[0]).toEqual({ kind: 'skipped', count: 5 })
    expect(rows.map((r) => (r.kind === 'skipped' ? `…${r.count}` : r.text))).toEqual([
      '…5',
      'l5',
      'l6',
      'CHANGED',
      'l7',
      '…4',
    ])
  })

  it('shows everything when little is unchanged', () => {
    const rows = foldUnchanged(diffLines('a\nb', 'a\nc'), 2)
    expect(rows.every((r) => r.kind !== 'skipped')).toBe(true)
  })
})
