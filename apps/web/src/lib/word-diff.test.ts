import { describe, expect, it } from 'vitest'
import { diffWords, plainText } from './word-diff'

describe('diffWords', () => {
  it('marks words only the old text has as removed, and words only the new has as added', () => {
    const { then, now } = diffWords('The river bends slowly.', 'The river bends quickly now.')
    expect(then).toEqual([
      { text: 'The river bends', changed: false },
      { text: 'slowly.', changed: true },
    ])
    expect(now).toEqual([
      { text: 'The river bends', changed: false },
      { text: 'quickly now.', changed: true },
    ])
  })

  it('leaves identical text unmarked on both sides', () => {
    const { then, now } = diffWords('Same words.', 'Same words.')
    expect(then).toEqual([{ text: 'Same words.', changed: false }])
    expect(now).toEqual(then)
  })

  it('marks a deletion on the old side only', () => {
    const { then, now } = diffWords('one two three', 'one three')
    expect(then.filter((s) => s.changed)).toEqual([{ text: 'two', changed: true }])
    expect(now.some((s) => s.changed)).toBe(false)
  })

  it('copes with nothing on one side', () => {
    expect(diffWords('', 'new words').now).toEqual([{ text: 'new words', changed: true }])
    expect(diffWords('old words', '').then).toEqual([{ text: 'old words', changed: true }])
  })
})

describe('plainText', () => {
  it('drops the Markdown around words so Then reads like Now', () => {
    expect(plainText('## A **bold** claim with [a link](https://x.test) and `code`')).toBe(
      'A bold claim with a link and code',
    )
    expect(plainText('- one\n- two')).toBe('one two')
    expect(plainText('> quoted\n> text')).toBe('quoted text')
  })
})
