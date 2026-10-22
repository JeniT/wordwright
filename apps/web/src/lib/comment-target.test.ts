import { splitBlocks } from '@wordwright/core'
import { describe, expect, it } from 'vitest'
import { blockFor } from './comment-target'

describe('blockFor', () => {
  const blocks = splitBlocks(
    [
      'Intro words here.',
      '- one apple',
      '- two pears',
      '> quoted\n>\n> more quoted',
      'Closing words, last of all.',
    ].join('\n\n'),
  )

  it('finds a paragraph by its words even when the editor counts differently', () => {
    // The editor counts the quote's two paragraphs separately, so the closing paragraph is its index 5, not 4.
    expect(blockFor({ index: 5, text: 'Closing words, last of all.' }, blocks)).toEqual({
      id: blocks.at(-1)!.id,
      number: blocks.length,
    })
  })

  it('finds a formatted paragraph by how it starts', () => {
    const marked = splitBlocks('Some **bold** words open this paragraph, and it goes on.')
    expect(
      blockFor({ index: 0, text: 'Some bold words open this paragraph, and it goes on.' }, marked),
    ).toEqual({
      id: 'b1',
      number: 1,
    })
  })

  it('says nothing when it cannot tell, so the comment is general rather than misplaced', () => {
    expect(blockFor({ index: 0, text: 'Words that are nowhere in the draft.' }, blocks)).toBeNull()
  })
})
