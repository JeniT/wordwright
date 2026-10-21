import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routes } from './router'

/** Every file under `dir` whose name ends in `.test.ts`. */
function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return testFiles(path)
    return name.endsWith('.test.ts') ? [path] : []
  })
}

describe('pages with tutorial text (#198)', () => {
  const named = routes.filter((r) => r.meta?.tutorial)

  it('never interrupt writing: the editor is quiet, so info notices are held back there', () => {
    expect(routes.find((r) => r.name === 'draft')?.meta?.quiet).toBe(true)
  })

  it('have a name, which is how a test finds the one that renders them', () => {
    for (const route of named) expect(route.name, route.path).toBeTruthy()
  })

  // A page that opts in has text that only shows in tutorial mode, so a test must switch it on and look: otherwise
  // that text could break, or leak into the normal view, without anyone noticing.
  it('each has a test that turns tutorial mode on and renders that page', () => {
    const sources = testFiles(join(__dirname)).map((f) => readFileSync(f, 'utf8'))
    for (const route of named) {
      const covered = sources.some(
        (text) => text.includes('tutorialMode: true') && text.includes(`'${String(route.name)}'`),
      )
      expect(covered, `no test renders ${String(route.name)} with tutorialMode: true`).toBe(true)
    }
  })
})
