import { describe, expect, it } from 'vitest'
import { markdownToNotes, notesToMarkdown } from './notes-text'

describe('notesToMarkdown', () => {
  it('makes each note a bullet', () => {
    expect(notesToMarkdown(['One', 'Two'])).toBe('- One\n- Two')
    expect(notesToMarkdown([])).toBe('')
  })

  it('indents the rest of a note so its line breaks stay inside it', () => {
    expect(notesToMarkdown(['First line\nsecond line', 'Next'])).toBe(
      '- First line\n  second line\n- Next',
    )
  })

  it('nests bullets a note already has, and keeps paragraphs inside the note', () => {
    expect(notesToMarkdown(['Points:\n- a\n  - b'])).toBe('- Points:\n  - a\n    - b')
    expect(notesToMarkdown(['Para one\n\nPara two'])).toBe('- Para one\n\n  Para two')
  })

  it('does not leave trailing spaces', () => {
    expect(notesToMarkdown(['  a   \n  \nb  '])).toBe('- a\n\n  b')
  })
})

describe('markdownToNotes', () => {
  it('splits top-level bullets into notes', () => {
    expect(markdownToNotes('- One\n- Two')).toEqual(['One', 'Two'])
  })

  it('treats indented lines, including nested bullets and blank lines, as part of the note', () => {
    expect(markdownToNotes('- Points:\n  - a\n    - b\n\n  more\n- Next')).toEqual([
      'Points:\n- a\n  - b\n\nmore',
      'Next',
    ])
  })

  it('treats any other text as a single note, or none if blank', () => {
    expect(markdownToNotes('Just a paragraph.\n\nAnd another.')).toEqual([
      'Just a paragraph.\n\nAnd another.',
    ])
    expect(markdownToNotes('- a\nstray line')).toEqual(['- a\nstray line'])
    expect(markdownToNotes('intro\n- a')).toEqual(['intro\n- a'])
    expect(markdownToNotes('   \n ')).toEqual([])
  })

  it('round-trips', () => {
    for (const notes of [
      ['One'],
      ['a\nb', 'c'],
      ['- starts with a dash'],
      ['List:\n- x\n  - y\n\nafter'],
      ['one', 'two', 'three'],
    ]) {
      expect(markdownToNotes(notesToMarkdown(notes))).toEqual(notes)
    }
  })
})
