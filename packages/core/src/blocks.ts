/**
 * A draft's Markdown as numbered blocks, so something can be said about "the third paragraph" without putting
 * ids into the writer's text. A block is a heading, a paragraph, a quote, a code fence, or one top-level list item
 * (with its indented lines). The ids (`b1`, `b2`, ...) are positions in this split of the saved text, so they only
 * mean something for that text; the `hash` lets a block be found again after the draft has been edited.
 */
export interface Block {
  id: string
  /** The block as written (trimmed), including any list marker or `#`. */
  text: string
  hash: string
}

/** What a comment's `block` is when it is about the draft as a whole rather than one of its blocks. */
export const WHOLE_DRAFT = 'whole'

/** The start of a block, enough to tell which one it is: its words on one line, cut to `max` characters. */
export function excerptOf(text: string, max = 90): string {
  const plain = text.replace(/\s+/g, ' ').trim()
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain
}

const FENCE = /^\s{0,3}(```|~~~)/
const HEADING = /^\s{0,3}#{1,6}(\s|$)/
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])\s/
const QUOTE = /^\s{0,3}>/

/**
 * The words of a bit of Markdown, lower-cased and spaced evenly: link addresses, list markers, `#` and `>` and other
 * punctuation are dropped, so the same words read the same whether they came from the Markdown or from the editor.
 */
export function plainWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>+|[-*+]|\d{1,9}[.)])\s+/gm, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** A short, stable fingerprint of a block's words (see `plainWords`). Not for security. */
export function blockHash(text: string): string {
  const words = plainWords(text)
  let h = 0x811c9dc5
  for (let i = 0; i < words.length; i++) {
    h ^= words.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The shortest start of a block that is trusted to find it again when its words have changed. */
const MIN_SNIPPET = 12

/**
 * Finds, among the blocks a draft has now, the one a point was made about: the one with the same words, or failing
 * that the one that still starts with the quoted start (a light edit further on). Of several candidates it takes the
 * one nearest to where the block was (`index`, from 0). Returns its place in `candidates`, or null if the passage has
 * changed too much (or gone), when the point is shown without a marker rather than put on the wrong paragraph.
 */
export function locateBlock(
  point: { hash: string; excerpt: string; index: number },
  candidates: readonly { text: string }[],
): number | null {
  const nearest = (matches: number[]) =>
    matches.sort((a, b) => Math.abs(a - point.index) - Math.abs(b - point.index) || a - b)[0] ??
    null
  const plain = candidates.map((c) => plainWords(c.text))
  const same = candidates.flatMap((c, i) => (blockHash(c.text) === point.hash ? [i] : []))
  if (same.length) return nearest(same)
  const start = plainWords(point.excerpt.replace(/…$/, ''))
  if (start.length < MIN_SNIPPET) return null
  return nearest(plain.flatMap((words, i) => (words.startsWith(start) ? [i] : [])))
}

export function splitBlocks(markdown: string): Block[] {
  const blocks: string[] = []
  let current: string[] = []
  let fence: string | null = null
  const flush = () => {
    const text = current.join('\n').trim()
    if (text) blocks.push(text)
    current = []
  }

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      current.push(line)
      if (line.trim().startsWith(fence)) {
        fence = null
        flush()
      }
      continue
    }
    const opens = line.match(FENCE)
    if (opens) {
      flush()
      fence = opens[1]!
      current.push(line)
    } else if (!line.trim()) {
      // A blank line ends a paragraph or quote; inside a list it is just space between items.
      if (!current[0]?.match(LIST_ITEM)) flush()
      else current.push(line)
    } else if (HEADING.test(line)) {
      flush()
      current.push(line)
      flush()
    } else if (LIST_ITEM.test(line)) {
      flush()
      current.push(line)
    } else if (QUOTE.test(line) && !QUOTE.test(current[0] ?? '>')) {
      flush()
      current.push(line)
    } else {
      // After a blank line, text that isn't indented is no longer part of the list item above it.
      if (current[0]?.match(LIST_ITEM) && current.at(-1) === '' && !/^\s/.test(line)) flush()
      current.push(line) // a new paragraph, or the continuation of the paragraph, quote or list item
    }
  }
  flush()

  return blocks.map((text, i) => ({ id: `b${i + 1}`, text, hash: blockHash(text) }))
}
