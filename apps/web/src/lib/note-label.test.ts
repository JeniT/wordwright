import { describe, expect, it } from 'vitest'
import { noteOrigin, nameList, originPhrase } from './note-label'

const source = { title: 'A paper', url: 'https://example.org/paper' }

describe('what a note is, without saying who took it', () => {
  it('names the kind of note', () => {
    expect(originPhrase('entered', null)).toBe('Added')
    expect(originPhrase('brainstorm', null)).toBe('From conversation with their AI')
  })

  it('says whose AI a conversation was with: the viewer’s, or someone else’s', () => {
    expect(originPhrase('brainstorm', null, true)).toBe('From conversation with your AI')
    expect(originPhrase('brainstorm', null, false)).toBe('From conversation with their AI')
  })

  it('says only "From" when the page is there to link to', () => {
    expect(originPhrase('reading', source)).toBe('From')
  })

  it('still says reading when the page has been removed from the reading list', () => {
    expect(originPhrase('reading', null)).toBe('From reading')
  })
})

describe('the origin of a note', () => {
  const note = (over = {}) =>
    ({ origin: 'reading', readingItemId: 'l1', quote: false, ...over }) as never
  const list = [{ id: 'l1', ...source }] as never

  it('gives the page to link to, whether or not the note is a quotation', () => {
    expect(noteOrigin(note(), list, 'u1')).toEqual({ phrase: 'From', source: list[0] })
    expect(noteOrigin(note({ quote: true }), list, 'u1').phrase).toBe('From')
  })

  it('has no page to link to once its item is gone, or for a note that is not from reading', () => {
    expect(noteOrigin(note(), [], 'u1')).toEqual({ phrase: 'From reading', source: null })
    expect(noteOrigin(note({ origin: 'entered', readingItemId: null }), list, 'u1')).toEqual({
      phrase: 'Added',
      source: null,
    })
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

describe('whose AI a note from a conversation was with', () => {
  const chat = { origin: 'brainstorm', readingItemId: null, quote: false, authorId: 'u1' } as never

  it('is yours when you are the note’s author', () => {
    expect(noteOrigin(chat, [], 'u1').phrase).toBe('From conversation with your AI')
  })

  it('is theirs when someone else is, when the author has left, or when nobody is signed in', () => {
    expect(noteOrigin(chat, [], 'u2').phrase).toBe('From conversation with their AI')
    expect(noteOrigin({ ...(chat as object), authorId: null } as never, [], 'u2').phrase).toBe(
      'From conversation with their AI',
    )
    expect(noteOrigin(chat, [], null).phrase).toBe('From conversation with their AI')
  })
})
