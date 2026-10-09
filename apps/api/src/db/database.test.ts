import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseError, migrate, openDatabase } from './database'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const tempPath = () => {
  const dir = mkdtempSync(join(tmpdir(), 'lfwa-db-'))
  dirs.push(dir)
  return join(dir, 'test.sqlite')
}

const version = (db: DatabaseSync) =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
const tableNames = (db: DatabaseSync) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  ).map((r) => r.name)

describe('migrations', () => {
  it('create the full schema in a fresh file and are idempotent when reopened', () => {
    const path = tempPath()
    const first = openDatabase(path)
    expect(tableNames(first)).toEqual(
      expect.arrayContaining(['users', 'profiles', 'drafts', 'llm_credentials']),
    )
    const latest = version(first)
    first.close()

    const second = openDatabase(path) // must not try to re-run anything
    expect(version(second)).toBe(latest)
    second.close()
  })

  it('upgrade a database that is one version behind, keeping its data', () => {
    const db = new DatabaseSync(':memory:')
    const steps = ['CREATE TABLE a (id TEXT PRIMARY KEY)', 'CREATE TABLE b (id TEXT PRIMARY KEY)']
    migrate(db, 'test', steps.slice(0, 1))
    db.exec("INSERT INTO a VALUES ('kept')")
    expect(version(db)).toBe(1)

    migrate(db, 'test', steps)
    expect(version(db)).toBe(2)
    expect(db.prepare('SELECT id FROM a').all()).toHaveLength(1)
    expect(tableNames(db)).toContain('b')
  })

  it('roll back a failing migration completely and leave the version unchanged', () => {
    const db = new DatabaseSync(':memory:')
    expect(() =>
      migrate(db, 'test', ['CREATE TABLE a (id TEXT); CREATE TABLE a (id TEXT)']),
    ).toThrow(/already exists/)
    expect(version(db)).toBe(0)
    expect(tableNames(db)).toEqual([])
  })

  it('explain, rather than crash on, a file from before migrations existed', () => {
    const path = tempPath()
    const legacy = new DatabaseSync(path)
    legacy.exec('CREATE TABLE drafts (id TEXT PRIMARY KEY, title TEXT)') // the original scaffold's table
    legacy.close()

    const err = (() => {
      try {
        openDatabase(path)
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(DatabaseError)
    expect((err as Error).message).toMatch(/early development version/)
    expect((err as Error).message).toContain(path)
  })

  it('refuse a database written by a newer version of the app', () => {
    const path = tempPath()
    const db = new DatabaseSync(path)
    db.exec('PRAGMA user_version = 999')
    db.close()
    expect(() => openDatabase(path)).toThrow(/newer version/)
  })
})
