import { describe, expect, it } from 'vitest'
import { blockHash, excerptOf, locateBlock, splitBlocks } from './blocks'

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

describe('blockHash and the editor', () => {
  it('reads Markdown and the words shown in the editor alike', () => {
    expect(blockHash('See [the report](https://example.org/r) for **more**.')).toBe(
      blockHash('See the report for more.'),
    )
    expect(blockHash('3. third item')).toBe(blockHash('third item'))
    expect(blockHash('## A heading')).toBe(blockHash('A heading'))
    expect(blockHash('> a\n> quote')).toBe(blockHash('a quote'))
  })
})

describe('locateBlock', () => {
  const text = (...texts: string[]) => texts.map((t) => ({ text: t }))
  const point = (draftText: string, index: number) => ({
    hash: blockHash(draftText),
    excerpt: draftText,
    index,
  })

  it('finds the same words wherever they have moved to', () => {
    const was = 'The river bends because the outer bank erodes faster.'
    expect(locateBlock(point(was, 1), text('Intro.', 'Another.', was))).toBe(2)
  })

  it('takes the nearest of two identical paragraphs', () => {
    const same = 'Repeated words in a paragraph.'
    expect(locateBlock(point(same, 4), text(same, 'x', 'y', 'z', 'w', same))).toBe(5)
    expect(locateBlock(point(same, 0), text(same, 'x', same))).toBe(0)
  })

  it('falls back to the start of the paragraph when it has been edited further on', () => {
    const was = 'The river bends because the outer bank erodes faster than the inner one.'
    const now = 'The river bends because the outer bank erodes faster, which is the whole story.'
    // The excerpt kept with a point is only the start of the paragraph, so a change after it does not matter.
    expect(
      locateBlock({ ...point(was, 0), excerpt: `${was.slice(0, 45)}…` }, text('Other.', now)),
    ).toBe(1)
  })

  it('does not guess when the passage has changed or gone', () => {
    const was = 'The river bends because the outer bank erodes faster than the inner one.'
    expect(locateBlock(point(was, 0), text('Something quite different now.'))).toBeNull()
    expect(locateBlock(point(was, 0), [])).toBeNull()
  })

  it('does not match on a short start', () => {
    expect(locateBlock(point('Rivers.', 0), text('Rivers run.'))).toBeNull()
  })
})

describe('excerptOf', () => {
  it('puts a block on one line and leaves a short one whole', () => {
    expect(excerptOf('  One\n\ntwo   three ')).toBe('One two three')
  })

  it('cuts a long block to the length given, ending with an ellipsis', () => {
    expect(excerptOf('a'.repeat(100))).toBe(`${'a'.repeat(89)}…`)
    expect(excerptOf('a'.repeat(100), 10)).toBe(`${'a'.repeat(9)}…`)
    expect(excerptOf('a'.repeat(10), 10)).toBe('a'.repeat(10))
  })
})
