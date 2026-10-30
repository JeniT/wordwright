import type { Article, IdeaNote } from '@wordwright/core'
import { nameList } from './note-label'

/**
 * The Markdown that goes into a draft for a note: its words, and, if it was taken from an article, a link
 * to that item, so the source travels with the words.
 */
export function noteMarkdown(note: IdeaNote, articleList: readonly Article[]): string {
  const item = articleList.find((l) => l.id === note.articleId)
  const text = note.text.trim()
  const source = item && linkMarkdown(item)
  // A direct quotation is a blockquote (every line starts with >), with its source as a last line inside it.
  if (note.quote) {
    const lines = text.split('\n').map((line) => (line.trim() ? `> ${line}` : '>'))
    return (source ? [...lines, '>', `> — ${source}`] : lines).join('\n')
  }
  return source ? `${text} (${source})` : text
}

/**
 * A Markdown link to an article, by its title (or its address if it has none), followed by “by …” when we
 * know who wrote it. In running text and in a quotation's last line alike: no separator that only reads as a citation.
 */
export function linkMarkdown(item: Article): string {
  const title = (item.title || item.url).replace(/[[\]]/g, '')
  const link = `[${title}](${item.url})`
  return item.authors.length ? `${link} by ${nameList(item.authors)}` : link
}
