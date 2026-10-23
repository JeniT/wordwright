// Makes a consistent copy of the live database and deletes old copies. `node:sqlite`'s backup() copies a
// WAL-mode database safely while the app is writing; a plain `cp` of the file is not safe.
//
//   node scripts/backup-db.mjs [directory]
//
// Reads DATABASE_PATH (default ./data/wordwright.sqlite) and BACKUP_KEEP_DAYS (default 14). Prints the new file's path.
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const PREFIX = 'wordwright-'
const SUFFIX = '.sqlite'

/** Copies `source` into `directory`, checks the copy, and removes copies older than `keepDays`. Returns the new path. */
export async function backupDatabase({ source, directory, keepDays = 14, now = new Date() }) {
  mkdirSync(directory, { recursive: true })
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
  const target = join(directory, `${PREFIX}${stamp}${SUFFIX}`)

  const db = new DatabaseSync(source, { readOnly: true })
  try {
    await backup(db, target)
  } finally {
    db.close()
  }

  // The copy inherits WAL mode, which leaves -wal and -shm files beside it whenever it is opened. Make it one
  // self-contained file, then check it: a backup that can't be opened is worse than none, so say so now, not at the restore.
  const copy = new DatabaseSync(target)
  copy.exec('PRAGMA journal_mode = DELETE')
  try {
    const { integrity_check: result } = copy.prepare('PRAGMA integrity_check').get()
    if (result !== 'ok') throw new Error(`Backup ${target} failed its integrity check: ${result}`)
  } finally {
    copy.close()
  }

  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000
  for (const name of readdirSync(directory)) {
    if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX) || name === basename(target)) continue
    const path = join(directory, name)
    if (statSync(path).mtimeMs < cutoff) unlinkSync(path)
  }
  return target
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.env.DATABASE_PATH ?? './data/wordwright.sqlite'
  const directory = process.argv[2] ?? join(dirname(source), 'backups')
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14)
  backupDatabase({ source, directory, keepDays }).then(
    (path) => console.log(path),
    (err) => {
      console.error(`Backup failed: ${err.message}`)
      process.exit(1)
    },
  )
}
