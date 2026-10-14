import { splitBlocks } from './blocks'

/**
 * Every number behind Rephrase (options for a passage or a title) in one place, so a limit can be tuned without
 * hunting through the code. The server enforces the ones it can; the web app uses the same values for what it shows.
 * Why these exist and why they are not a quota: docs/decisions.md, "Rephrase: options for a passage or title".
 */
export const REPHRASE = {
  /** Words the writer must put in the Aim ("what should this do?"), so a single letter does not pass. */
  aimMinWords: 3,
  /** The selected passage: inside one block, and neither a single word nor more than about a paragraph. */
  selection: { minWords: 5, maxWords: 150 },
  /** Up to this many words is "short" (a phrase or sentence: a list of options); more is "long" (a carousel). */
  shortMaxWords: 25,
  /** Title options need something to work from: the draft's body must have at least this many words. */
  titleMinBodyWords: 300,
  /** How many options the AI is asked for, and how many the server accepts. */
  short: { ask: 8, min: 5, max: 10 },
  long: { ask: 4, min: 3, max: 5 },
  /** An option may be at most the larger of `growth` times the wording or the wording plus `extraWords`. */
  option: { growth: 1.5, extraWords: 15 },
  /** A title option's own ceiling. */
  titleOptionMaxWords: 20,
} as const

export type RephraseSize = 'short' | 'long'

/** Words as a reader counts them: runs of non-space. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** A title is always short; a passage is short up to `shortMaxWords`. */
export function rephraseSize(kind: 'title' | 'passage', wording: string): RephraseSize {
  return kind === 'title' || countWords(wording) <= REPHRASE.shortMaxWords ? 'short' : 'long'
}

/** The most words an option may have for this wording. */
export function maxOptionWords(kind: 'title' | 'passage', wording: string): number {
  if (kind === 'title') return REPHRASE.titleOptionMaxWords
  const n = countWords(wording)
  return Math.max(Math.ceil(n * REPHRASE.option.growth), n + REPHRASE.option.extraWords)
}

/** Aims are compared ignoring case and spacing, so adding a space or a capital is not "a different Aim". */
export function normalizeAim(aim: string): string {
  return aim.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Why this wording cannot be rephrased, in words that say what to do; null when it can. A title only has to exist.
 * A passage must lie inside one block (a paragraph, list item or heading) and be neither tiny nor long.
 */
export function wordingProblem(kind: 'title' | 'passage', wording: string): string | null {
  const n = countWords(wording)
  if (kind === 'title') return n === 0 ? 'Give the draft a title first, even a rough one.' : null
  const { minWords, maxWords } = REPHRASE.selection
  if (splitBlocks(wording).length > 1) {
    return `Select part of a single paragraph, up to about ${maxWords} words.`
  }
  if (n < minWords) return `Select at least ${minWords} words to rephrase.`
  if (n > maxWords) return `Select part of a single paragraph, up to about ${maxWords} words.`
  return null
}
