import type { IdeaLink, IdeaNote } from '@wordwright/core'

/**
 * The Markdown that goes into a draft for a note: its words, and, if it was taken from a reading-list item, a link
 * to that item, so the source travels with the words.
 */
export function noteMarkdown(note: IdeaNote, readingList: readonly IdeaLink[]): string {
  const item = readingList.find((l) => l.id === note.readingItemId)
  const text = note.text.trim()
  const source = item && linkMarkdown(item)
  // A direct quotation is a blockquote (every line starts with >), with its source as a last line inside it.
  if (note.quote) {
    const lines = text.split('\n').map((line) => (line.trim() ? `> ${line}` : '>'))
    return (source ? [...lines, '>', `> — ${source}`] : lines).join('\n')
  }
  return source ? `${text} (${source})` : text
}

/** A Markdown link to a reading-list item, by its title (or its address if it has none). */
export function linkMarkdown(item: IdeaLink): string {
  const title = (item.title || item.url).replace(/[[\]]/g, '')
  return `[${title}](${item.url})`
}

/** Case, spacing and Markdown punctuation ignored, so text can be found again after the editor rewrites it. */
const plain = (text: string) =>
  text
    .replace(/\\(.)/g, '$1')
    .replace(/[*_`#>[\]()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Whether words that were inserted can still be found, as they were, in the draft. */
export const stillInDraft = (body: string, inserted: string) =>
  plain(body).includes(plain(inserted))
