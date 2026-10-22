/** A run of words, and whether it is one of the changes between the old text and the new. */
export interface Run {
  text: string
  changed: boolean
}

/**
 * The words of two texts side by side: what only the old one has (`then`) and what only the new one has (`now`),
 * found as the longest run of words they share, in order. Small enough to need no library; paragraphs are short.
 */
export function diffWords(was: string, is: string): { then: Run[]; now: Run[] } {
  const a = was.split(/\s+/).filter(Boolean)
  const b = is.split(/\s+/).filter(Boolean)
  // lengths[i][j]: how many words the tails a[i..] and b[j..] share.
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const then: { word: string; changed: boolean }[] = []
  const now: { word: string; changed: boolean }[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      then.push({ word: a[i++]!, changed: false })
      now.push({ word: b[j++]!, changed: false })
    } else if (j >= b.length || (i < a.length && lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) {
      then.push({ word: a[i++]!, changed: true })
    } else {
      now.push({ word: b[j++]!, changed: true })
    }
  }
  return { then: runs(then), now: runs(now) }
}

/** Neighbouring words that are alike (all changed or all not) become one run, so the marks are not word by word. */
function runs(words: { word: string; changed: boolean }[]): Run[] {
  const out: Run[] = []
  for (const w of words) {
    const last = out.at(-1)
    if (last && last.changed === w.changed) last.text += ` ${w.word}`
    else out.push({ text: w.word, changed: w.changed })
  }
  return out
}

/**
 * A paragraph's Markdown as the words a reader sees, which is how the editor holds it now: so Then and Now differ
 * only where the words do, not in `#`, `**` or link addresses.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>+|[-*+]|\d{1,9}[.)])\s+/gm, '')
    .replace(/(\*\*|__|[*_`])/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
