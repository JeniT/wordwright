export interface DiffLine {
  kind: 'same' | 'added' | 'removed'
  text: string
}

/** Too big to compare line by line: show the old text removed and the new text added. */
const MAX_CELLS = 4_000_000

/**
 * A line-by-line difference between two texts (the longest common subsequence of their lines), so a
 * person can see exactly what a suggestion would change in their notes.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ kind: 'removed', text })),
      ...b.map((text): DiffLine => ({ kind: 'added', text })),
    ]
  }

  // lengths[i][j] = length of the longest common run of a[i..] and b[j..]
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

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! })
      i++
      j++
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      out.push({ kind: 'removed', text: a[i++]! })
    } else {
      out.push({ kind: 'added', text: b[j++]! })
    }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++]! })
  while (j < b.length) out.push({ kind: 'added', text: b[j++]! })
  return out
}

export type DiffRow = DiffLine | { kind: 'skipped'; count: number }

/** Folds long runs of unchanged lines into "N unchanged lines", keeping `context` lines beside each change. */
export function foldUnchanged(lines: DiffLine[], context = 2): DiffRow[] {
  const keep = lines.map((l) => l.kind !== 'same')
  const near = keep.map((_, i) => {
    for (let d = -context; d <= context; d++) if (keep[i + d]) return true
    return false
  })
  const rows: DiffRow[] = []
  let skipped = 0
  lines.forEach((line, i) => {
    if (near[i]) {
      if (skipped) rows.push({ kind: 'skipped', count: skipped })
      skipped = 0
      rows.push(line)
    } else skipped++
  })
  if (skipped) rows.push({ kind: 'skipped', count: skipped })
  return rows
}
