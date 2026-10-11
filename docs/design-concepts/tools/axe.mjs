// Runs axe (WCAG 2.2 A/AA rules) over every concept page. Needs the dev server from vite.config.mjs on :5199.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/package.json'),
)
const { chromium } = require('@playwright/test')
const { AxeBuilder } = require('@axe-core/playwright')

const pages = ['home', 'inspiration', 'idea', 'editor', 'brainstorm', 'signin', 'kit']
const runs = [
  ['press'],
  ['ledger'],
  ['lamplight'],
  ['lamplight', 'dark'],
  ['slate'],
  ['evening'],
  ['evening', 'dark'],
]
const browser = await chromium.launch()
let total = 0
for (const [c, theme] of runs) {
  for (const p of pages) {
    const ctx = await browser.newContext({ colorScheme: theme === 'dark' ? 'dark' : 'light' })
    const tab = await ctx.newPage()
    await tab.goto(`http://localhost:5199/${c}/${p}.html${theme ? `?theme=${theme}` : ''}`)
    await tab.evaluate(() => document.fonts.ready)
    const { violations } = await new AxeBuilder({ page: tab })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    total += violations.length
    for (const v of violations)
      console.log(
        `${c}${theme ? '/' + theme : ''}/${p}: ${v.id} (${v.nodes.length}) ${v.nodes[0].target}`,
      )
    await ctx.close()
  }
}
console.log(total ? `${total} violation type(s)` : 'axe: no violations on any page.')
await browser.close()
