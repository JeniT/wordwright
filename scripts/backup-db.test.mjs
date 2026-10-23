import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { backupDatabase } from './backup-db.mjs'

function liveDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'backup-test-'))
  const source = join(dir, 'live.sqlite')
  const db = new DatabaseSync(source)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE notes (text TEXT)')
  db.exec("INSERT INTO notes VALUES ('written while the database is open')")
  return { dir, source, db }
}

test('copies a live WAL database, and the copy opens with the same rows', async () => {
  const { dir, source, db } = liveDatabase()
  const target = await backupDatabase({ source, directory: join(dir, 'backups') })
  db.close()
  const copy = new DatabaseSync(target, { readOnly: true })
  assert.deepEqual(
    copy
      .prepare('SELECT text FROM notes')
      .all()
      .map((r) => r.text),
    ['written while the database is open'],
  )
  copy.close()
})

test('deletes backups older than the retention, and nothing else in the folder', async () => {
  const { dir, source, db } = liveDatabase()
  const directory = join(dir, 'backups')
  const old = await backupDatabase({ source, directory, now: new Date('2026-01-01T00:00:00Z') })
  writeFileSync(join(directory, 'notes.txt'), 'not a backup')
  const longAgo = new Date('2026-01-01T00:00:00Z')
  utimesSync(old, longAgo, longAgo)
  utimesSync(join(directory, 'notes.txt'), longAgo, longAgo)

  const fresh = await backupDatabase({
    source,
    directory,
    keepDays: 14,
    now: new Date('2026-02-01T00:00:00Z'),
  })
  db.close()
  assert.equal(existsSync(old), false)
  assert.equal(existsSync(fresh), true)
  assert.deepEqual(readdirSync(directory).sort(), [fresh.split('/').pop(), 'notes.txt'].sort())
})

test('fails loudly when the source is not there', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'backup-test-'))
  await assert.rejects(backupDatabase({ source: join(dir, 'missing.sqlite'), directory: dir }))
})
