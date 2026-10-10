import { describe, expect, it } from 'vitest'
import { nameList, originPhrase } from './note-label'

const source = { title: 'A paper', url: 'https://example.org/paper' }

describe('what a note is, without saying who took it', () => {
  it('names the kind of note', () => {
    expect(originPhrase('entered', null)).toBe('Added')
    expect(originPhrase('brainstorm', null)).toBe('From brainstorming')
  })

  it('names the page a note from reading was taken from, by its address if it has no title', () => {
    expect(originPhrase('reading', source)).toBe('From reading “A paper”')
    expect(originPhrase('reading', { ...source, title: '' })).toBe(
      'From reading “https://example.org/paper”',
    )
  })

  it('says a quotation is quoted', () => {
    expect(originPhrase('reading', source, true)).toBe('Quoted from “A paper”')
  })

  it('still says reading when the page has been removed from the reading list', () => {
    expect(originPhrase('reading', null)).toBe('From reading')
    expect(originPhrase('reading', null, true)).toBe('Quoted while reading')
  })

  it('never uses "by", which would read as the author of the page', () => {
    for (const origin of ['entered', 'brainstorm', 'reading'] as const) {
      expect(originPhrase(origin, source, true)).not.toMatch(/\bby\b/)
    }
  })

  it('names the authors of the page after its title, so "by" is always the piece\'s author', () => {
    const by = (authors: string[]) => originPhrase('reading', { ...source, authors }, true)
    expect(by([])).toBe('Quoted from “A paper”')
    expect(by(['Ada Author'])).toBe('Quoted from “A paper”, by Ada Author')
    expect(by(['Ada Author', 'Bo Writer'])).toBe(
      'Quoted from “A paper”, by Ada Author and Bo Writer',
    )
    expect(originPhrase('reading', { ...source, authors: ['Ada Author'] })).toBe(
      'From reading “A paper”, by Ada Author',
    )
    expect(originPhrase('brainstorm', { ...source, authors: ['Ada Author'] })).toBe(
      'From brainstorming',
    )
  })
})

describe('a list of names', () => {
  it('reads like prose', () => {
    expect(nameList([])).toBe('')
    expect(nameList(['Ada'])).toBe('Ada')
    expect(nameList(['Ada', 'Bo'])).toBe('Ada and Bo')
    expect(nameList(['Ada', 'Bo', 'Cy'])).toBe('Ada, Bo and Cy')
  })
})
