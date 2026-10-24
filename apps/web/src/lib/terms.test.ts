import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The glossary calls these Articles (CONTEXT.md). The words people read must not drift back to the old names.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sources(path)
    return /\.(vue|ts)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path] : []
  })
}

describe('the word for a thing to read', () => {
  it('is Article everywhere in the web app: no “reading list” or “reading item”', () => {
    const offenders = sources(join(__dirname, '..')).filter((f) =>
      /reading\s+(list|item)/i.test(readFileSync(f, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
