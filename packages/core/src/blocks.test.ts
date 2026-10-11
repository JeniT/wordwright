import { describe, expect, it } from 'vitest'
import { blockHash, splitBlocks } from './blocks'

const texts = (md: string) => splitBlocks(md).map((b) => b.text)

describe('splitBlocks', () => {
  it('numbers paragraphs from b1', () => {
    expect(splitBlocks('One.\n\nTwo\ncontinues.\n\n\nThree.')).toMatchObject([
      { id: 'b1', text: 'One.' },
      { id: 'b2', text: 'Two\ncontinues.' },
      { id: 'b3', text: 'Three.' },
    ])
  })

  it('has no blocks for an empty or blank draft', () => {
    expect(splitBlocks('')).toEqual([])
    expect(splitBlocks(' \n\n  \n')).toEqual([])
  })

  it('makes a heading its own block even without a blank line after it', () => {
    expect(texts('# Title\nFirst paragraph.\n\n## Part two\nMore.')).toEqual([
      '# Title',
      'First paragraph.',
      '## Part two',
      'More.',
    ])
  })

  it('makes each top-level list item a block, with its indented lines and blank lines between items', () => {
    expect(texts('Intro:\n\n- one\n  more of one\n\n- two\n1. three\n\nAfter.')).toEqual([
      'Intro:',
      '- one\n  more of one',
      '- two',
      '1. three',
      'After.',
    ])
  })

  it('keeps a code fence together, blank lines and all', () => {
    expect(texts('Before.\n\n```js\nconst a = 1\n\n# not a heading\n```\n\nAfter.')).toEqual([
      'Before.',
      '```js\nconst a = 1\n\n# not a heading\n```',
      'After.',
    ])
  })

  it('keeps a quote together and separate from the paragraph before it', () => {
    expect(texts('Said:\n> a\n> b\n\nNext.')).toEqual(['Said:', '> a\n> b', 'Next.'])
  })

  it('gives the same ids and hashes for the same text, and treats Windows line ends alike', () => {
    expect(splitBlocks('A.\r\n\r\nB.')).toEqual(splitBlocks('A.\n\nB.'))
  })
})

describe('blockHash', () => {
  it('ignores case, spacing and Markdown punctuation, but not words', () => {
    expect(blockHash('A *light*  rewrite.')).toBe(blockHash('a light rewrite'))
    expect(blockHash('a light rewrite')).not.toBe(blockHash('a heavy rewrite'))
  })
})
