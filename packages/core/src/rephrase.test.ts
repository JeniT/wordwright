import { describe, expect, it } from 'vitest'
import {
  REPHRASE,
  countWords,
  maxOptionWords,
  normalizeAim,
  rephraseSize,
  wordingProblem,
} from './rephrase'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

describe('rephrase sizes', () => {
  it('counts words as runs of non-space', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  one   two\nthree ')).toBe(3)
  })

  it('treats a title as short however long, and a passage as short up to the limit', () => {
    expect(rephraseSize('title', words(40))).toBe('short')
    expect(rephraseSize('passage', words(REPHRASE.shortMaxWords))).toBe('short')
    expect(rephraseSize('passage', words(REPHRASE.shortMaxWords + 1))).toBe('long')
  })

  it('lets an option be the larger of 1.5 times the wording or the wording plus 15 words', () => {
    expect(maxOptionWords('passage', words(6))).toBe(21) // 6 + 15 beats 9
    expect(maxOptionWords('passage', words(100))).toBe(150) // 1.5 times beats 115
    expect(maxOptionWords('title', words(3))).toBe(REPHRASE.titleOptionMaxWords)
  })

  it('compares aims ignoring case and spacing', () => {
    expect(normalizeAim('  Make it   PUNCHIER ')).toBe(normalizeAim('make it punchier'))
  })
})

describe('what can be rephrased', () => {
  it('accepts a passage inside one block, within the limits', () => {
    expect(wordingProblem('passage', words(REPHRASE.selection.minWords))).toBeNull()
    expect(wordingProblem('passage', words(REPHRASE.selection.maxWords))).toBeNull()
  })

  it('refuses a passage that is too small, too big or crosses blocks, saying what to do', () => {
    expect(wordingProblem('passage', words(REPHRASE.selection.minWords - 1))).toMatch(/at least 5/)
    expect(wordingProblem('passage', words(REPHRASE.selection.maxWords + 1))).toMatch(
      /single paragraph/,
    )
    expect(
      wordingProblem('passage', 'One two three four five.\n\nSix seven eight nine ten.'),
    ).toMatch(/single paragraph/)
  })

  it('needs a title to have words, and has no other limit on one', () => {
    expect(wordingProblem('title', '  ')).toMatch(/title first/)
    expect(wordingProblem('title', 'Rivers')).toBeNull()
  })
})
