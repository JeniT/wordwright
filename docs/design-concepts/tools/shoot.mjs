// Screenshots every concept page (needs the dev server from vite.config.mjs running on :5199).
// Usage: node tools/shoot.mjs [concept ...]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(join(here, '../../../apps/web/package.json'))('@playwright/test')
const out = join(here, '..', 'screenshots')
const base = 'http://localhost:5199'

const concepts = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'press',
      'ledger',
      'lamplight',
      'slate',
      'evening',
      'slate-teal',
      'slate-ember',
      'slate-aubergine',
    ]
const desktop = ['home', 'inspiration', 'idea', 'editor', 'brainstorm', 'signin', 'kit']
const mobile = ['home', 'idea', 'editor', 'brainstorm']

const browser = await chromium.launch()
async function shot(concept, page, { width, height, suffix, theme }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  })
  const tab = await context.newPage()
  await tab.goto(`${base}/${concept}/${page}.html${theme ? `?theme=${theme}` : ''}`)
  await tab.evaluate(() => document.fonts.ready)
  await tab.waitForTimeout(150)
  mkdirSync(join(out, concept), { recursive: true })
  const file = join(out, concept, `${page}${suffix}.png`)
  await tab.screenshot({ path: file, fullPage: true })
  await context.close()
  console.log(file)
}

for (const c of concepts) {
  for (const p of desktop) await shot(c, p, { width: 1280, height: 800, suffix: '' })
  for (const p of mobile) await shot(c, p, { width: 390, height: 844, suffix: '-mobile' })
  if (c === 'lamplight' || c === 'evening' || c.startsWith('slate-')) {
    for (const p of desktop)
      await shot(c, p, { width: 1280, height: 800, suffix: '-dark', theme: 'dark' })
    for (const p of mobile)
      await shot(c, p, { width: 390, height: 844, suffix: '-mobile-dark', theme: 'dark' })
  }
}
await browser.close()
