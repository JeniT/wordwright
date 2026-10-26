import { loadConfig } from './config'
import { openStore } from './db/store'

const args = process.argv.slice(2).filter((a) => a !== '--')
const apply = args.includes('--apply')
const [name] = args.filter((a) => !a.startsWith('--'))
if (!name) {
  console.error(
    'Usage: forget-kept-name-cli.ts "<the display name exactly as it appears>" [--apply]',
  )
  process.exit(1)
}

const store = openStore(loadConfig().DATABASE_PATH)
const counts = store.users.countKeptName(name)
const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
for (const [where, n] of Object.entries(counts)) if (n > 0) console.log(`  ${where}: ${n}`)
if (total === 0) {
  console.log(`No kept name matches that text.`)
} else if (!apply) {
  console.log(
    `${total} place(s) hold that name. This clears every one, including anyone else who kept the same name. Run again with --apply to do it.`,
  )
} else {
  console.log(
    `Cleared ${store.users.forgetKeptName(name)} place(s); they now read "a former member".`,
  )
}
