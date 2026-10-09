import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Ordered, append-only. The schema version is the number of migrations applied. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,            -- stored lower-cased; uniqueness is enforced here
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE password_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE identities (
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (provider, subject)
  );
  CREATE INDEX identities_user ON identities(user_id);
  -- Only hashes of session / reset tokens are stored, so a database leak can't be replayed.
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE profile_members (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, user_id)
  );
  CREATE INDEX profile_members_user ON profile_members(user_id);
  CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX drafts_profile ON drafts(profile_id);
  `,
  `
  -- A user's own LLM credentials. The key is encrypted; only the last four characters are kept in clear.
  CREATE TABLE llm_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    model TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
]

/** A problem with the database file that a person needs to act on (not a bug). */
export class DatabaseError extends Error {}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  try {
    migrate(db, path)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

/** Brings the schema up to date, one atomic step per migration. */
export function migrate(db: DatabaseSync, path = 'the database', migrations = MIGRATIONS) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as {
    user_version: number
  }

  if (current > migrations.length) {
    throw new DatabaseError(
      `${path} was created by a newer version of this app (schema v${current}, this build knows v${migrations.length}). Upgrade the app rather than downgrading the data.`,
    )
  }
  // Version 0 with tables already present means a file from before migrations existed.
  // Running migration 1 over it would fail halfway with a confusing "table already exists".
  const tables = (
    db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as {
      n: number
    }
  ).n
  if (current === 0 && tables > 0) {
    throw new DatabaseError(
      `${path} is from an early development version and has no schema version, so it can't be upgraded automatically. ` +
        `If you don't need its contents, move or delete it (and any -wal/-shm files beside it) and restart.`,
    )
  }

  for (let v = current; v < migrations.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(migrations[v]!)
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

/** Runs `fn` atomically. Not re-entrant; call it from the service layer only. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const nowIso = () => new Date().toISOString()
