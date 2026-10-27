import { loadConfig } from './config'
import { openStore } from './db/store'

// For when KEY_ENCRYPTION_SECRET has leaked (docs/runbook.md): deletes every saved AI key, so a new secret can be set and
// writers asked to add theirs again. Without --apply it only counts.
const apply = process.argv.slice(2).includes('--apply')
const store = openStore(loadConfig().DATABASE_PATH)
const saved = store.credentials.count()
if (saved === 0) {
  console.log('No AI keys are saved.')
} else if (!apply) {
  console.log(`${saved} AI key(s) are saved. Run again with --apply to delete every one.`)
} else {
  console.log(
    `Deleted ${store.credentials.deleteAll()} AI key(s). Each writer must add theirs again.`,
  )
}
