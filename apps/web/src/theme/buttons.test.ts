import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// A link or button that is dressed up by hand (a border plus padding) is not centred the way `.btn` is, so when a
// flex row stretches it to its neighbour's height the text sits at the top (#248). Use `btn btn-*` instead.
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : []
  })
}

// Small toggle chips that are a single line of text and never stretched.
const allowed = ['BulkTagFields.vue']

describe('button-like links and buttons', () => {
  it('use the btn classes, not hand-made borders and padding', () => {
    const offenders: string[] = []
    for (const file of vueFiles(resolve(process.cwd(), 'src'))) {
      if (allowed.some((a) => file.endsWith(a))) continue
      const source = readFileSync(file, 'utf8')
      for (const tag of source.matchAll(/<(?:a|button|RouterLink)\b[^>]*>/g)) {
        const classes = /(?:^|\s)class="([^"]*)"/.exec(tag[0])?.[1] ?? ''
        const words = classes.split(/\s+/)
        const handMade =
          words.includes('border') &&
          words.some((w) => /^px-/.test(w)) &&
          words.some((w) => /^py-/.test(w))
        if (handMade && !words.includes('btn')) offenders.push(`${file}: ${classes}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
