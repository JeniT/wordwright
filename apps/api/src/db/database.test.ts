import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addHandlesAndVenueProfiles,
  DatabaseError,
  MIGRATIONS,
  migrate,
  openDatabase,
} from './database'

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

  describe('handles and readable profile ids', () => {
    const before = MIGRATIONS.slice(0, MIGRATIONS.indexOf(addHandlesAndVenueProfiles))

    function legacyDb() {
      const db = new DatabaseSync(':memory:')
      db.exec('PRAGMA foreign_keys = ON')
      migrate(db, 'test', before)
      const user = (id: string, name: string, email: string) =>
        db
          .prepare('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)')
          .run(id, name, email, `2026-01-0${id.length}T00:00:00Z`)
      user('u1', 'Ada Lovelace', 'ada@example.com')
      user('u22', 'Ada Lovelace', 'ada2@example.com') // same name: needs a distinct handle
      user('u333', '日本語', 'sam.smith@example.com') // no Latin letters: falls back to the email
      const profile = (id: string, name: string, createdAt: string) =>
        db
          .prepare('INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)')
          .run(id, name, createdAt)
      const member = (profileId: string, userId: string, role: string, joinedAt: string) =>
        db
          .prepare('INSERT INTO profile_members VALUES (?, ?, ?, ?)')
          .run(profileId, userId, role, joinedAt)
      profile('3f2a-uuid-1', "Ada's writing", '2026-01-01T00:00:00Z')
      member('3f2a-uuid-1', 'u1', 'owner', '2026-01-01T00:00:00Z')
      profile('9b7c-uuid-2', "Ada's writing", '2026-01-02T00:00:00Z') // same name, same owner
      member('9b7c-uuid-2', 'u1', 'owner', '2026-01-02T00:00:00Z')
      member('9b7c-uuid-2', 'u22', 'editor', '2026-01-02T00:00:01Z') // shared with another user
      profile('abcd-uuid-3', 'Notes', '2026-01-03T00:00:00Z')
      member('abcd-uuid-3', 'u333', 'owner', '2026-01-03T00:00:00Z')
      db.prepare(
        'INSERT INTO drafts (id, profile_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('d1', '9b7c-uuid-2', 'Keep me', 'body', 'x', 'x')
      db.prepare(
        `INSERT INTO invitations (id, profile_id, invited_by, email, token_hash, created_at, expires_at)
         VALUES ('i1', '9b7c-uuid-2', 'u1', 'new@example.com', 'hash', 'x', 'x')`,
      ).run()
      return db
    }

    it('gives existing users unique handles and renames profiles, keeping members and drafts', () => {
      const db = legacyDb()
      migrate(db, 'test', MIGRATIONS)

      const handles = db.prepare('SELECT id, handle FROM users ORDER BY id').all()
      expect(handles).toEqual([
        { id: 'u1', handle: 'adalovelace' },
        { id: 'u22', handle: 'adalovelace2' },
        { id: 'u333', handle: 'samsmith' },
      ])
      expect(db.prepare('SELECT id, name FROM profiles ORDER BY id').all()).toEqual([
        { id: 'adalovelace-adas-writing', name: "Ada's writing" },
        { id: 'adalovelace-adas-writing-2', name: "Ada's writing" },
        { id: 'samsmith-notes', name: 'Notes' },
      ])
      // Children moved with their parents.
      expect(
        db.prepare('SELECT profile_id, user_id FROM profile_members ORDER BY 1, 2').all(),
      ).toEqual([
        { profile_id: 'adalovelace-adas-writing', user_id: 'u1' },
        { profile_id: 'adalovelace-adas-writing-2', user_id: 'u1' },
        { profile_id: 'adalovelace-adas-writing-2', user_id: 'u22' },
        { profile_id: 'samsmith-notes', user_id: 'u333' },
      ])
      expect(db.prepare('SELECT profile_id FROM drafts').all()).toEqual([
        { profile_id: 'adalovelace-adas-writing-2' },
      ])
      expect(db.prepare('SELECT profile_id FROM invitations').all()).toEqual([
        { profile_id: 'adalovelace-adas-writing-2' },
      ])
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })

    it('#152: renames the profile role editor to member and keeps owners', () => {
      const db = legacyDb()
      migrate(db, 'test', MIGRATIONS)
      expect(db.prepare('SELECT user_id, role FROM profile_members ORDER BY 1').all()).toEqual([
        { user_id: 'u1', role: 'owner' },
        { user_id: 'u1', role: 'owner' },
        { user_id: 'u22', role: 'member' },
        { user_id: 'u333', role: 'owner' },
      ])
      expect(() =>
        db.exec("UPDATE profile_members SET role = 'editor' WHERE user_id = 'u22'"),
      ).toThrow(/CHECK/)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })

    it('#154: makes each existing draft’s creator its editor, or the longest-standing owner if they are gone', () => {
      const db = new DatabaseSync(':memory:')
      db.exec('PRAGMA foreign_keys = ON')
      const at = MIGRATIONS.findIndex(
        (m) => typeof m === 'string' && m.includes('ADD COLUMN editor_id'),
      )
      expect(at).toBeGreaterThan(0)
      migrate(db, 'test', MIGRATIONS.slice(0, at))
      for (const [id, email] of [
        ['u1', 'a@example.com'],
        ['u2', 'b@example.com'],
      ] as const) {
        db.prepare('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)').run(
          id,
          id,
          email,
          'x',
        )
      }
      db.prepare("INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'x')").run()
      db.prepare("INSERT INTO profile_members VALUES ('p', 'u1', 'owner', '2026-01-01')").run()
      db.prepare("INSERT INTO profile_members VALUES ('p', 'u2', 'member', '2026-01-02')").run()
      const draft = (id: string, createdBy: string | null) =>
        db
          .prepare(
            "INSERT INTO drafts (id, profile_id, created_by, title, body, created_at, updated_at) VALUES (?, 'p', ?, 't', 'b', 'x', 'x')",
          )
          .run(id, createdBy)
      draft('d-bob', 'u2')
      draft('d-gone', null)
      migrate(db, 'test', MIGRATIONS)
      expect(db.prepare('SELECT id, editor_id, version FROM drafts ORDER BY id').all()).toEqual([
        { id: 'd-bob', editor_id: 'u2', version: 1 },
        { id: 'd-gone', editor_id: 'u1', version: 1 },
      ])
    })

    it('#158: gives reviews already made a snapshot of the draft, renames their states, and links reviewers’ comments', () => {
      const db = new DatabaseSync(':memory:')
      db.exec('PRAGMA foreign_keys = ON')
      const at = MIGRATIONS.findIndex(
        (m) => typeof m === 'string' && m.includes('CREATE TABLE draft_snapshots'),
      )
      expect(at).toBeGreaterThan(0)
      migrate(db, 'test', MIGRATIONS.slice(0, at))
      const run = (sql: string, ...args: (string | null)[]) => db.prepare(sql).run(...args)
      for (const [id, email] of [
        ['u1', 'ada@example.com'],
        ['u2', 'rae@example.com'],
        ['u3', 'ray@example.com'],
      ] as const) {
        run(
          'INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)',
          id,
          id,
          email,
          'x',
        )
      }
      run("INSERT INTO profiles (id, name, created_at) VALUES ('p', 'P', 'x')")
      run(
        "INSERT INTO drafts (id, profile_id, created_by, editor_id, title, body, created_at, updated_at) VALUES ('d', 'p', 'u1', 'u1', 'Title', 'Body', 'x', 'x')",
      )
      for (const [id, reviewer, state] of [
        ['r-open', 'u2', 'open'],
        ['r-left', 'u3', 'left'],
      ] as const) {
        run(
          `INSERT INTO draft_reviews (id, draft_id, reviewer_id, invited_by, state, created_at) VALUES (?, 'd', ?, 'u1', ?, 'x')`,
          id,
          reviewer,
          state,
        )
      }
      run(
        "INSERT INTO review_invitations (id, draft_id, invited_by, email, token_hash, created_at, expires_at) VALUES ('i', 'd', 'u1', 'new@example.com', 'h', 'x', 'x')",
      )
      run(
        "INSERT INTO draft_comments (id, draft_id, author_id, block, excerpt, text, created_at) VALUES ('c', 'd', 'u2', 'whole', '', 'Hm', 'x')",
      )
      migrate(db, 'test', MIGRATIONS)

      expect(db.prepare('SELECT title, body FROM draft_snapshots').all()).toEqual([
        { title: 'Title', body: 'Body' },
      ]) // one for the draft, however many reviews it had
      expect(db.prepare('SELECT id, state FROM draft_reviews ORDER BY id').all()).toEqual([
        { id: 'r-left', state: 'ended' },
        { id: 'r-open', state: 'open' },
      ])
      expect(
        db.prepare('SELECT count(*) AS n FROM draft_reviews WHERE snapshot_id IS NOT NULL').get(),
      ).toEqual({ n: 2 })
      expect(
        db.prepare('SELECT snapshot_id IS NOT NULL AS ok FROM review_invitations').get(),
      ).toEqual({ ok: 1 })
      expect(db.prepare("SELECT review_id FROM draft_comments WHERE id = 'c'").get()).toEqual({
        review_id: 'r-open',
      })
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })

    it('enforces unique handles afterwards', () => {
      const db = legacyDb()
      migrate(db, 'test', MIGRATIONS)
      expect(() => db.exec("UPDATE users SET handle = 'samsmith' WHERE id = 'u1'")).toThrow(
        /UNIQUE/,
      )
    })

    it('#88: keeps the links the writer already added by hand to a profile’s own list, and no others', () => {
      const db = new DatabaseSync(':memory:')
      // Everything before the migration that adds `kept` (found by what it adds, so later migrations don't matter).
      let before = 0
      for (let n = 1; n <= MIGRATIONS.length; n++) {
        const probe = new DatabaseSync(':memory:')
        migrate(probe, 'test', MIGRATIONS.slice(0, n))
        const has = probe
          .prepare("SELECT 1 FROM pragma_table_info('idea_links') WHERE name = 'kept'")
          .get()
        if (has) break
        before = n
      }
      migrate(db, 'test', MIGRATIONS.slice(0, before))
      db.exec('PRAGMA foreign_keys = OFF')
      const link = db.prepare(
        'INSERT INTO idea_links (id, profile_id, idea_id, url, title, created_at, origin) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      link.run('mine', 'p', null, 'https://a/', 'a', 'x', 'entered')
      link.run('feed', 'p', null, 'https://b/', 'b', 'x', 'feed')
      link.run('idea', 'p', 'i', 'https://c/', 'c', 'x', 'entered')
      migrate(db, 'test', MIGRATIONS)
      expect(db.prepare('SELECT id, kept FROM idea_links ORDER BY id').all()).toEqual([
        { id: 'feed', kept: 0 },
        { id: 'idea', kept: 0 },
        { id: 'mine', kept: 1 },
      ])
    })

    it('works on an empty database', () => {
      const db = new DatabaseSync(':memory:')
      expect(() => migrate(db, 'test', MIGRATIONS)).not.toThrow()
    })
  })

  it('roll back a failing migration completely and leave the version unchanged', () => {
    const db = new DatabaseSync(':memory:')
    expect(() =>
      migrate(db, 'test', ['CREATE TABLE a (id TEXT); CREATE TABLE a (id TEXT)']),
    ).toThrow(/already exists/)
    expect(version(db)).toBe(0)
    expect(tableNames(db)).toEqual([])
  })

  describe('reading suggestions (T38)', () => {
    // The steps before the one that widens idea_proposals make the old shape.
    const before = MIGRATIONS.slice(
      0,
      MIGRATIONS.findIndex((m) => typeof m === 'string' && m.includes('idea_proposals_new')),
    )

    function oldDb() {
      const db = new DatabaseSync(':memory:')
      db.exec('PRAGMA foreign_keys = ON')
      migrate(db, 'test', before)
      db.prepare('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)').run(
        'u1',
        'Ada',
        'ada@example.com',
        'x',
      )
      db.prepare('INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)').run('p1', 'P', 'x')
      db.prepare(
        `INSERT INTO ideas (id, profile_id, created_by, name, notes, created_at, updated_at)
         VALUES ('i1', 'p1', 'u1', 'Idea', '', 'x', 'x')`,
      ).run()
      db.prepare(
        `INSERT INTO idea_messages (id, idea_id, seq, role, kind, author_id, content, display_text, created_at)
         VALUES ('m1', 'i1', 1, 'assistant', 'message', 'u1', '[]', 'Hi', 'x')`,
      ).run()
      db.prepare(
        `INSERT INTO idea_proposals (id, message_id, tool_call_id, tool, input, base, status, decided_by, decided_at)
         VALUES ('pr1', 'm1', 'c1', 'update_idea', '{"name":"New"}', '{"name":"Old"}', 'accepted', 'u1', 'y')`,
      ).run()
      return db
    }

    it('keeps existing suggestions exactly as they were, with no reading details', () => {
      const db = oldDb()
      migrate(db, 'test', MIGRATIONS)
      expect(db.prepare('SELECT * FROM idea_proposals').all()).toEqual([
        expect.objectContaining({
          id: 'pr1',
          message_id: 'm1',
          tool: 'update_idea',
          input: '{"name":"New"}',
          base: '{"name":"Old"}',
          status: 'accepted',
          decided_by: 'u1',
          decided_at: 'y',
          check_status: null,
          fetched_title: null,
        }),
      ])
    })

    it('still removes suggestions with their message, and accepts only the known tools and checks', () => {
      const db = oldDb()
      migrate(db, 'test', MIGRATIONS)
      const add = (tool: string, check: string | null) =>
        db
          .prepare(
            `INSERT INTO idea_proposals (id, message_id, tool_call_id, tool, input, check_status)
             VALUES (?, 'm1', 'c', ?, '{}', ?)`,
          )
          .run(`x-${tool}-${check}`, tool, check)
      expect(() => add('suggest_reading', 'not-found')).not.toThrow()
      expect(() => add('delete_everything', null)).toThrow()
      expect(() => add('suggest_reading', 'fine')).toThrow()

      db.prepare("DELETE FROM idea_messages WHERE id = 'm1'").run()
      expect(db.prepare('SELECT count(*) AS n FROM idea_proposals').get()).toEqual({ n: 0 })
    })

    it('keeps research with its idea: a run, its pages, and the reason kept on a reading-list item', () => {
      const db = oldDb()
      migrate(db, 'test', MIGRATIONS)
      db.prepare(
        `INSERT INTO idea_research (id, idea_id, created_by, areas, provider, model, created_at)
         VALUES ('r1', 'i1', 'u1', 'Areas', 'anthropic', 'm', 'x')`,
      ).run()
      const item = (check: string) =>
        db
          .prepare(
            `INSERT INTO idea_research_items (id, research_id, position, url, title, why, check_status)
             VALUES (?, 'r1', 0, 'https://a.example.org', 't', 'w', ?)`,
          )
          .run(`item-${check}`, check)
      expect(() => item('found')).not.toThrow()
      expect(() => item('fine')).toThrow()
      db.prepare(
        `INSERT INTO idea_links (id, profile_id, idea_id, url, title, why, created_at) VALUES ('l1', 'p1', 'i1', 'https://a.example.org', 't', 'Because.', 'x')`,
      ).run()
      expect(db.prepare("SELECT why FROM idea_links WHERE id = 'l1'").get()).toEqual({
        why: 'Because.',
      })

      db.prepare("DELETE FROM ideas WHERE id = 'i1'").run()
      expect(db.prepare('SELECT count(*) AS n FROM idea_research_items').get()).toEqual({ n: 0 })
      expect(db.prepare('SELECT count(*) AS n FROM idea_research').get()).toEqual({ n: 0 })
    })
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

  describe('reading items that can belong to a profile (#69)', () => {
    const rebuild = MIGRATIONS.findIndex((m) => typeof m === 'object' && 'foreignKeysOff' in m)

    function before() {
      const db = new DatabaseSync(':memory:')
      db.exec('PRAGMA foreign_keys = ON')
      migrate(db, 'test', MIGRATIONS.slice(0, rebuild))
      db.exec(`
        INSERT INTO users (id, name, email, created_at) VALUES ('u1', 'Ada', 'ada@example.com', 'x');
        INSERT INTO profiles (id, name, created_at) VALUES ('p1', 'P', 'x');
        INSERT INTO ideas (id, profile_id, created_by, name, notes, created_at, updated_at)
          VALUES ('i1', 'p1', 'u1', 'Idea', '', 'x', 'x');
        INSERT INTO idea_links (id, idea_id, url, title, origin, authors, why, read_at, created_at)
          VALUES ('l1', 'i1', 'https://a.example.org', 'First', 'research', '["Ada"]', 'Because.', 'r', '1'),
                 ('l2', 'i1', 'https://b.example.org', 'Second', 'entered', '[]', NULL, NULL, '2');
        INSERT INTO idea_notes (id, profile_id, idea_id, text, origin, position, reading_item_id, created_at, updated_at)
          VALUES ('n1', 'p1', 'i1', 'A note', 'reading', 0, 'l1', 'x', 'x');
        INSERT INTO idea_research (id, idea_id, created_by, areas, provider, model, created_at)
          VALUES ('r1', 'i1', 'u1', 'Areas', 'anthropic', 'm', 'x');
        INSERT INTO idea_research_items (id, research_id, position, url, title, why, check_status, link_id)
          VALUES ('ri1', 'r1', 0, 'https://a.example.org', 't', 'w', 'found', 'l1');
      `)
      return db
    }

    it('keeps every item, and everything that refers to one, when the table is rebuilt', () => {
      const db = before()
      migrate(db, 'test', MIGRATIONS)
      expect(db.prepare('SELECT * FROM idea_links ORDER BY rowid').all()).toEqual([
        expect.objectContaining({
          id: 'l1',
          profile_id: 'p1',
          idea_id: 'i1',
          title: 'First',
          origin: 'research',
          authors: '["Ada"]',
          why: 'Because.',
          read_at: 'r',
          source_id: null,
        }),
        expect.objectContaining({ id: 'l2', profile_id: 'p1', idea_id: 'i1', title: 'Second' }),
      ])
      // The things that point at an item still do (a rebuild must not clear them).
      expect(db.prepare('SELECT reading_item_id FROM idea_notes').get()).toEqual({
        reading_item_id: 'l1',
      })
      expect(db.prepare('SELECT link_id FROM idea_research_items').get()).toEqual({ link_id: 'l1' })
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(
        (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys,
      ).toBe(1)
    })

    it('then lets an item belong to the profile alone, and refuses one with no profile', () => {
      const db = before()
      migrate(db, 'test', MIGRATIONS)
      const add = (id: string, profile: string | null, idea: string | null, origin = 'feed') =>
        db
          .prepare(
            'INSERT INTO idea_links (id, profile_id, idea_id, url, title, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(id, profile, idea, `https://${id}.example`, id, origin, 'x')
      expect(() => add('p-level', 'p1', null)).not.toThrow()
      expect(() => add('no-profile', null, null)).toThrow()
      expect(() => add('bad-origin', 'p1', null, 'robot')).toThrow()
    })

    it('still deletes an idea’s items with the idea, and all of them with the profile', () => {
      const db = before()
      migrate(db, 'test', MIGRATIONS)
      db.prepare(
        "INSERT INTO idea_links (id, profile_id, idea_id, url, title, created_at) VALUES ('p-level', 'p1', NULL, 'https://x.example', 'x', 'x')",
      ).run()
      db.prepare("DELETE FROM ideas WHERE id = 'i1'").run()
      expect(db.prepare('SELECT id FROM idea_links').all()).toEqual([{ id: 'p-level' }])
      db.prepare("DELETE FROM profiles WHERE id = 'p1'").run()
      expect(db.prepare('SELECT count(*) AS n FROM idea_links').get()).toEqual({ n: 0 })
    })

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
