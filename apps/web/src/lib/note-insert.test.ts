import { describe, expect, it } from 'vitest'
import type { IdeaLink, IdeaNote } from '@wordwright/core'
import { linkMarkdown, noteMarkdown } from './note-insert'

const note = (extra: Partial<IdeaNote> = {}): IdeaNote => ({
  id: 'n1',
  text: 'Meanders grow.',
  origin: 'reading',
  authorId: 'u1',
  authorName: 'Ada',
  tags: [],
  readingItemId: 'l1',
  quote: false,
  addedAt: null,
  createdAt: 't',
  updatedAt: 't',
  ...extra,
})
const item = (extra: Partial<IdeaLink> = {}): IdeaLink => ({
  id: 'l1',
  url: 'https://example.org/paper',
  title: 'A paper',
  authors: [],
  tags: [],
  readAt: null,
  origin: 'entered',
  ...extra,
})

describe('the Markdown a note becomes in a draft', () => {
  it('is just the words for a note with no source', () => {
    expect(noteMarkdown(note({ readingItemId: null }), [])).toBe('Meanders grow.')
  })

  it('has a link to the source after the words of a note from reading', () => {
    expect(noteMarkdown(note(), [item()])).toBe(
      'Meanders grow. ([A paper](https://example.org/paper))',
    )
  })

  it('is a blockquote for a direct quotation, with the source as its last line', () => {
    expect(noteMarkdown(note({ quote: true }), [item()])).toBe(
      '> Meanders grow.\n>\n> — [A paper](https://example.org/paper)',
    )
  })

  it('quotes every line of a long quotation, keeping its paragraph breaks inside the quote', () => {
    const md = noteMarkdown(note({ quote: true, text: ' One.\nTwo.\n\nThree. ' }), [item()])
    expect(md.split('\n')).toEqual([
      '> One.',
      '> Two.',
      '>',
      '> Three.',
      '>',
      '> — [A paper](https://example.org/paper)',
    ])
    expect(md.split('\n').every((line) => line.startsWith('>'))).toBe(true)
  })

  it('is still a blockquote, without a source line, when the source has been removed', () => {
    expect(noteMarkdown(note({ quote: true, readingItemId: null }), [])).toBe('> Meanders grow.')
  })

  it('names the source by its address when it has no title, and keeps brackets from breaking the link', () => {
    expect(noteMarkdown(note({ quote: true }), [item({ title: '' })])).toContain(
      '[https://example.org/paper](https://example.org/paper)',
    )
    expect(noteMarkdown(note({ quote: true }), [item({ title: 'On [bends]' })])).toContain(
      '[On bends](',
    )
  })

  it('says who wrote the source after its link, in the draft’s own words', () => {
    const authors = ['Ada Lovelace', 'Bo Chen']
    expect(linkMarkdown(item({ authors }))).toBe(
      '[A paper](https://example.org/paper) by Ada Lovelace and Bo Chen',
    )
    expect(noteMarkdown(note(), [item({ authors })])).toBe(
      'Meanders grow. ([A paper](https://example.org/paper) by Ada Lovelace and Bo Chen)',
    )
    expect(noteMarkdown(note({ quote: true }), [item({ authors: ['Ada Lovelace'] })])).toBe(
      '> Meanders grow.\n>\n> — [A paper](https://example.org/paper) by Ada Lovelace',
    )
  })

  it('leaves out “by” when nobody is named', () => {
    expect(linkMarkdown(item({ authors: [] }))).toBe('[A paper](https://example.org/paper)')
  })
})
