// Screenshots the navigation mock-ups (dev server from ../tools/vite.config.mjs on :5199 must be running).
// Usage: node docs/design-concepts/navigation/shoot.mjs [approach ...]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(join(here, '../../../apps/web/package.json'))('@playwright/test')
const out = join(here, 'screenshots')
const approaches = process.argv.slice(2).length ? process.argv.slice(2) : ['a', 'b', 'c']
const desktop = [
  'home',
  'profile-inspiration',
  'profile-notes',
  'profile-ideas',
  'idea-research',
  'idea-notes',
  'idea-refine',
  'idea-draft',
  'idea-publish',
]

const browser = await chromium.launch()
async function shot(a, page, name, { width, height, query = '', full = true }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const tab = await ctx.newPage()
  await tab.goto(`http://localhost:5199/navigation/${a}/${page}.html${query}`)
  await tab.evaluate(() => document.fonts.ready)
  mkdirSync(join(out, a), { recursive: true })
  await tab.screenshot({ path: join(out, a, `${name}.png`), fullPage: full })
  await ctx.close()
}
for (const a of approaches) {
  for (const p of desktop) await shot(a, p, p, { width: 1280, height: 800, full: false })
  await shot(a, 'idea-notes', 'idea-notes-mobile', { width: 390, height: 844, full: false })
  await shot(a, 'idea-notes', 'idea-notes-mobile-menu', {
    width: 390,
    height: 844,
    query: '?menu=open',
    full: false,
  })
}
await browser.close()
