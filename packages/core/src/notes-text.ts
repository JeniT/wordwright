/**
 * The notes of an idea as one Markdown text, and back. Each note is a top-level bullet and the rest of its
 * lines are indented under it, so a line break inside a note (or bullets of its own) reads as part of that
 * note rather than as a new one. This is the transitional single-text view of the notes (`Idea.notes`).
 */

const INDENT = '  '

export function notesToMarkdown(notes: readonly string[]): string {
  return notes
    .map((note) =>
      note
        .trim()
        .split('\n')
        .map((line, i) => {
          const text = line.replace(/\s+$/, '')
          if (i === 0) return `- ${text}`
          return text ? INDENT + text : ''
        })
        .join('\n'),
    )
    .join('\n')
}

/**
 * The inverse of `notesToMarkdown`. Text made only of top-level `- ` bullets, each followed by lines
 * indented two spaces, becomes one note per bullet; any other text is a single note (none if blank).
 */
export function markdownToNotes(text: string): string[] {
  const whole = text.trim() ? [text.trim()] : []
  const notes: string[][] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('- ')) notes.push([line.slice(2)])
    else if (!line.trim()) notes.at(-1)?.push('')
    else if (line.startsWith(INDENT) && notes.length) notes.at(-1)!.push(line.slice(INDENT.length))
    else return whole
  }
  return notes.map((lines) => lines.join('\n').trim()).filter(Boolean)
}

/** A note's text with case, spacing and closing punctuation ignored, for spotting a point that is already there. */
export const noteKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?;:,]+$/, '')
    .trim()
