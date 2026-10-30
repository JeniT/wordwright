import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseError, isReady, MIGRATIONS, migrate, openDatabase } from './database'
import { PUBLICATION_REFERENCES } from './publications'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const tempPath = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wordwright-db-'))
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
      expect.arrayContaining(['users', 'publications', 'drafts', 'llm_credentials']),
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

  it('has an index on every publication_id so a publication’s rows are found and deleted quickly', () => {
    const db = openDatabase(':memory:')
    const tables = (
      db
        .prepare(
          "SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) c WHERE m.type = 'table' AND c.name = 'publication_id'",
        )
        .all() as { name: string }[]
    ).map((r) => r.name)
    expect(tables.length).toBeGreaterThan(5)
    for (const table of tables) {
      const leading = (
        db
          .prepare(
            "SELECT i.name FROM pragma_index_list(?) i, pragma_index_info(i.name) c WHERE c.seqno = 0 AND c.name = 'publication_id'",
          )
          .all(table) as unknown[]
      ).length
      const primary = (
        db
          .prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = 'publication_id' AND pk = 1")
          .all(table) as unknown[]
      ).length
      expect(leading + primary, `${table} needs an index on publication_id`).toBeGreaterThan(0)
    }
  })

  it('lists, for renaming a publication, every column that references one', () => {
    const db = openDatabase(':memory:')
    const referencing = (
      db
        .prepare(
          `SELECT m.name AS "table", f."from" AS "column" FROM sqlite_master m, pragma_foreign_key_list(m.name) f
           WHERE m.type = 'table' AND f."table" = 'publications'`,
        )
        .all() as { table: string; column: string }[]
    ).map((r) => `${r.table}.${r.column}`)
    const listed = PUBLICATION_REFERENCES.map(([t, c]) => `${t}.${c}`)
    // publication_aliases is rewritten by hand (it keeps the old ids); publications.id is the id itself.
    expect(
      [...referencing, 'publications.id']
        .filter((r) => r !== 'publication_aliases.publication_id')
        .sort(),
    ).toEqual(listed.sort())
  })

  it('enforces unique usernames, and lets reviewer-only accounts have none', () => {
    const db = openDatabase(':memory:')
    const add = (id: string, handle: string | null) =>
      db
        .prepare('INSERT INTO users (id, name, email, handle, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, id, `${id}@example.com`, handle, 'x')
    add('u1', 'ada')
    expect(() => add('u2', 'ada')).toThrow(/UNIQUE/)
    expect(() => add('r1', null)).not.toThrow()
    expect(() => add('r2', null)).not.toThrow()
  })

  it('refuses the old role name and keeps a draft tied to an idea', () => {
    const db = openDatabase(':memory:')
    db.exec(`
      INSERT INTO users (id, name, email, handle, created_at) VALUES ('u1', 'Ada', 'a@example.com', 'ada', 'x');
      INSERT INTO publications (id, name, created_at) VALUES ('p', 'P', 'x');
    `)
    expect(() =>
      db.exec("INSERT INTO publication_members VALUES ('p', 'u1', 'editor', 'x')"),
    ).toThrow(/CHECK/)
    expect(() =>
      db.exec(
        "INSERT INTO drafts (id, publication_id, title, body, created_at, updated_at) VALUES ('d', 'p', 't', 'b', 'x', 'x')",
      ),
    ).toThrow(/NOT NULL/)
  })

  it('removes everything that belongs to a publication with it', () => {
    const db = openDatabase(':memory:')
    db.exec(`
      INSERT INTO users (id, name, email, handle, created_at) VALUES ('u1', 'Ada', 'a@example.com', 'ada', 'x');
      INSERT INTO publications (id, name, created_at) VALUES ('p', 'P', 'x');
      INSERT INTO publication_members VALUES ('p', 'u1', 'owner', 'x');
      INSERT INTO ideas (id, publication_id, name, created_at, updated_at) VALUES ('i', 'p', 'I', 'x', 'x');
      INSERT INTO drafts (id, publication_id, idea_id, title, body, created_at, updated_at) VALUES ('d', 'p', 'i', 't', 'b', 'x', 'x');
      INSERT INTO articles (id, publication_id, idea_id, url, title, created_at) VALUES ('l', 'p', NULL, 'https://x.example', 'x', 'x');
      INSERT INTO publication_aliases VALUES ('u1-old', 'p');
      INSERT INTO publications (id, name, created_at) VALUES ('q', 'Q', 'x');
      INSERT INTO moves (id, batch_id, publication_id, moved_at, kind, item_id, to_publication_id) VALUES ('m', 'b', 'q', 'x', 'article', 'l', 'p');
    `)
    db.exec("DELETE FROM publications WHERE id = 'p'")
    for (const table of [
      'publication_members',
      'ideas',
      'drafts',
      'articles',
      'publication_aliases',
      'moves', // the log of a move out of another publication goes with the one it went into
    ]) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get(), table).toEqual({ n: 0 })
    }
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

  describe('rebuilding migrations', () => {
    it('rolls back, and leaves foreign keys on, when a rebuilding migration fails', () => {
      const db = new DatabaseSync(':memory:')
      db.exec('PRAGMA foreign_keys = ON')
      expect(() =>
        migrate(db, 'test', [
          'CREATE TABLE a (id TEXT PRIMARY KEY)',
          {
            foreignKeysOff: true,
            run: (d) => {
              d.exec(
                "CREATE TABLE b (a_id TEXT REFERENCES a(id)); INSERT INTO b VALUES ('missing')",
              )
            },
          },
        ]),
      ).toThrow(/broken references/)
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined()
      expect(
        (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
      ).toBe(1)
      expect(
        (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys,
      ).toBe(1)
    })
  })
})

describe('isReady', () => {
  it('is true for a fully migrated database', () => {
    expect(isReady(openDatabase(':memory:'))).toBe(true)
  })

  it('is false when migrations are missing, and when the database is closed', () => {
    const db = new DatabaseSync(':memory:')
    expect(isReady(db)).toBe(false)
    db.close()
    expect(isReady(db)).toBe(false)
  })
})

describe('the collapsed schema (#308)', () => {
  type Entry = { type: string; name: string; tbl_name: string; sql: string }
  const snapshot = (db: DatabaseSync) =>
    (
      db
        .prepare(
          "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type, name",
        )
        .all() as Entry[]
    ).map((e) => ({ ...e, sql: e.sql.replace(/\s+/g, ' ').trim() }))

  it('is the schema the old chain of twenty-one migrations produced', () => {
    const before = (
      JSON.parse(
        readFileSync(join(__dirname, '__fixtures__/schema-before-collapse.json'), 'utf8'),
      ) as Entry[]
    )
      .map((e) => ({ ...e, sql: e.sql.replace(/\s+/g, ' ').trim() }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    expect(snapshot(openDatabase(':memory:'))).toEqual(before)
  })

  it('refuses a state the private alpha does not know', () => {
    const db = openDatabase(':memory:')
    db.exec(
      "INSERT INTO users (id, name, email, created_at) VALUES ('u', 'A', 'a@example.com', 't')",
    )
    expect(() => db.exec("UPDATE users SET approval = 'maybe'")).toThrow()
  })

  it('is one step, and refuses a development database from before the fold', () => {
    expect(MIGRATIONS).toHaveLength(1)
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA user_version = 20')
    expect(() => migrate(db, 'dev.sqlite')).toThrow(DatabaseError)
  })
})
