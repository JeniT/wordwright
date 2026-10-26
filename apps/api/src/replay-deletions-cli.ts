import { loadConfig } from './config'
import { openStore } from './db/store'
import { FileDeletionJournal } from './services/deletion-journal'
import { replayDeletions } from './services/replay-deletions'

const args = process.argv.slice(2).filter((a) => a !== '--')
const apply = args.includes('--apply')
const [since] = args.filter((a) => !a.startsWith('--'))
const sinceDate = since ? new Date(since) : undefined
if (!sinceDate || Number.isNaN(sinceDate.getTime())) {
  console.error(
    'Usage: replay-deletions-cli.ts <time the restored backup was taken, e.g. 2026-10-23T02:30:00Z> [--apply]',
  )
  process.exit(1)
}

const config = loadConfig()
const entries = new FileDeletionJournal(config.DELETION_JOURNAL_PATH).since(sinceDate)
const store = openStore(config.DATABASE_PATH)
const result = replayDeletions(store, entries, { dryRun: !apply })
const verb = apply ? 'Deleted again' : 'Would delete again'
console.log(
  `${entries.length} deletion(s) recorded since ${sinceDate.toISOString()}. ${verb}: ${result.deleted}. Not in this database: ${result.absent}.`,
)
if (!apply && result.deleted > 0) console.log('Run again with --apply to do it.')
