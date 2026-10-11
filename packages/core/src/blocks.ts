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

const FENCE = /^\s{0,3}(```|~~~)/
const HEADING = /^\s{0,3}#{1,6}(\s|$)/
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])\s/
const QUOTE = /^\s{0,3}>/

/** A short, stable fingerprint of a block's words (case, spacing and Markdown punctuation ignored). Not for security. */
export function blockHash(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  let h = 0x811c9dc5
  for (let i = 0; i < words.length; i++) {
    h ^= words.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
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
