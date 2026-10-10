import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { firstAvailable, IDEA_NAME_MAX, profileIdFor, suggestHandle } from '@lfwa/core'

/** SQL, or a function when the change needs logic SQL can't express. Either runs in one transaction. */
type Migration = string | ((db: DatabaseSync) => void)

/** Ordered, append-only. The schema version is the number of migrations applied. */
export const MIGRATIONS: Migration[] = [
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
  `
  -- Proves control of an address. The address is stored with the token so a link can only ever
  -- verify the address it was sent to, even if the account's email later changes.
  CREATE TABLE email_verifications (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX email_verifications_user ON email_verifications(user_id);
  `,
  `
  -- Invitations are addressed to an email, not an account, so people can be invited before they sign
  -- up. Accepted rows are kept so that re-opening the link is harmless.
  CREATE TABLE invitations (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TEXT
  );
  CREATE INDEX invitations_profile ON invitations(profile_id);
  CREATE INDEX invitations_email ON invitations(email);
  `,
  addHandlesAndVenueProfiles,
  `
  -- Renaming a profile changes its id; the old ids keep pointing at it so shared links still work.
  CREATE TABLE profile_aliases (
    old_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  );
  CREATE INDEX profile_aliases_profile ON profile_aliases(profile_id);
  `,
  `
  -- A requested change of email address, waiting for the link sent to the *new* address to be opened.
  -- The address lives with the token, so a link can only ever switch the account to the address it
  -- was sent to.
  CREATE TABLE email_changes (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX email_changes_user ON email_changes(user_id);
  `,
  `
  -- An idea is something to write about; drafts develop it. Drafts that already exist stay as
  -- they are (idea_id NULL) rather than being moved, so nothing about them changes.
  CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX ideas_profile ON ideas(profile_id);
  CREATE TABLE idea_links (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idea_links_idea ON idea_links(idea_id);
  ALTER TABLE drafts ADD COLUMN idea_id TEXT REFERENCES ideas(id) ON DELETE CASCADE;
  CREATE INDEX drafts_idea ON drafts(idea_id);
  `,
  `
  -- "This wasn't me" links sent to the *old* address after an email change. Valid only while the
  -- account still has the address the change moved it to.
  CREATE TABLE email_change_undos (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_email TEXT NOT NULL,
    new_email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX email_change_undos_user ON email_change_undos(user_id);
  `,
  `
  -- Invitations someone has chosen not to receive, keyed by the address (invitees often have no
  -- account). A null sender blocks everyone. Blocks about a sender go with that sender's account.
  CREATE TABLE invitation_blocks (
    email TEXT NOT NULL,
    sender_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX invitation_blocks_unique ON invitation_blocks(email, COALESCE(sender_id, ''));
  `,
  `
  -- Feeds a profile watches for ideas. position is the priority (0 first); the store keeps it dense.
  CREATE TABLE profile_sources (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (profile_id, url)
  );
  CREATE INDEX profile_sources_profile ON profile_sources(profile_id, position);
  `,
  `
  -- What each feed says about itself, read when it was added. Null for sources added before that.
  ALTER TABLE profile_sources ADD COLUMN title TEXT;
  ALTER TABLE profile_sources ADD COLUMN description TEXT;
  ALTER TABLE profile_sources ADD COLUMN site_url TEXT;
  -- The picture kept for a source, in its own table so listing sources never reads image bytes.
  CREATE TABLE profile_source_icons (
    source_id TEXT PRIMARY KEY REFERENCES profile_sources(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  wrapStandaloneDraftsInIdeas,
  `
  -- A person's own version of an AI prompt. No row means "use the default", so improvements to the
  -- default reach everyone who hasn't changed it. One column per prompt kind, added as they appear.
  CREATE TABLE user_prompts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    brainstorm TEXT,
    updated_at TEXT NOT NULL
  );
  `,
  `
  -- The brainstorming conversation about an idea: one thread, shared by everyone in the profile. Kept in our
  -- own neutral format (text and tool calls, never the model's reasoning), so it replays on any provider.
  CREATE TABLE idea_messages (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    kind TEXT NOT NULL CHECK (kind IN ('kickoff', 'message')),
    -- Who sent it, or whose key the reply was paid for with; SET NULL so a leaving member's messages stay.
    author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    provider TEXT,
    model TEXT,
    -- What is replayed to the model: a JSON array of content blocks.
    content TEXT NOT NULL,
    -- What people see.
    display_text TEXT NOT NULL,
    -- The idea snapshot this message carries, if any; a new one is sent only when the idea has changed.
    snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'stopped')),
    stop_reason TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cached_tokens INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE (idea_id, seq)
  );
  -- A suggestion from the AI. It changes nothing until a person accepts it.
  CREATE TABLE idea_proposals (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES idea_messages(id) ON DELETE CASCADE,
    tool_call_id TEXT NOT NULL,
    tool TEXT NOT NULL CHECK (tool IN ('update_idea', 'create_idea')),
    input TEXT NOT NULL,
    -- The idea's title and notes when it was suggested, to notice if they have changed since.
    base TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT,
    created_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL
  );
  CREATE INDEX idea_proposals_message ON idea_proposals(message_id);
  `,
  // T3e: when an unconfirmed account was warned that it is about to be deleted (once only).
  `ALTER TABLE users ADD COLUMN deletion_reminded_at TEXT`,
  `
  -- Notes: index cards for an idea. profile_id is always set; idea_id is null for a note that belongs to the
  -- profile as a whole (used later, when notes can be gathered before an idea exists). ideas.notes is no longer
  -- read: it stays because SQLite can't cheaply drop a NOT NULL column, and new ideas write ''.
  CREATE TABLE idea_notes (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    idea_id TEXT REFERENCES ideas(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('entered', 'brainstorm', 'reading')),
    position INTEGER NOT NULL,
    added_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idea_notes_idea ON idea_notes(idea_id);
  CREATE INDEX idea_notes_profile ON idea_notes(profile_id);
  -- Each idea's existing notes become one note of its own.
  INSERT INTO idea_notes (id, profile_id, idea_id, created_by, text, origin, position, created_at, updated_at)
    SELECT lower(hex(randomblob(16))), profile_id, id, created_by, notes, 'entered', 0, created_at, updated_at
    FROM ideas WHERE trim(notes, ' ' || char(9) || char(10) || char(13)) != '';
  `,
  // T20e: the order of an idea's drafts (the reading order of a linked set), starting from the
  // order they were created in, which is what people have been seeing.
  `
  ALTER TABLE drafts ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  UPDATE drafts SET position = (
    SELECT count(*) FROM drafts d2
    WHERE d2.idea_id = drafts.idea_id
      AND (d2.created_at < drafts.created_at
           OR (d2.created_at = drafts.created_at AND d2.rowid < drafts.rowid))
  ) WHERE idea_id IS NOT NULL;
  `,
  // T18: usernames can change. A former username is kept here and can't be taken by anyone else
  // (profile addresses and invitations may still mention it), but its owner can come back to it.
  // handle_chosen is false only for sign-ups through an identity provider, who were given one.
  `
  ALTER TABLE users ADD COLUMN handle_chosen INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE retired_handles (
    handle TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    retired_at TEXT NOT NULL
  );
  CREATE INDEX retired_handles_user ON retired_handles(user_id);
  `,
  // T30: the points the AI recorded as notes while replying. Kept apart from the notes themselves so the chat can
  // show them (and the AI be told what became of each call) even after a note is deleted or changed.
  `
  CREATE TABLE idea_message_notes (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES idea_messages(id) ON DELETE CASCADE,
    tool_call_id TEXT NOT NULL,
    text TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('added', 'duplicate', 'full')),
    -- The note it made; null once that note is deleted (or if none was made).
    note_id TEXT REFERENCES idea_notes(id) ON DELETE SET NULL
  );
  CREATE INDEX idea_message_notes_message ON idea_message_notes(message_id);
  `,
  // T31: an idea's links become its reading list. Each item can be marked read (it may have been read offline) and
  // says where it came from; a note can be taken from an item, and keeps no claim on it if the item is removed.
  `
  ALTER TABLE idea_links ADD COLUMN read_at TEXT;
  ALTER TABLE idea_links ADD COLUMN origin TEXT NOT NULL DEFAULT 'entered'
    CHECK (origin IN ('entered', 'brainstorm', 'research', 'idea_generation'));
  ALTER TABLE idea_notes ADD COLUMN reading_item_id TEXT REFERENCES idea_links(id) ON DELETE SET NULL;
  `,
  // T33: words pulled into a draft from a note keep their origin. The insertion records what was inserted and
  // where it came from (the note's origin, who wrote it, the reading-list item as it was then), so the draft can say
  // so even after the text is edited. The note, its author and the inserter may all go; the record stays.
  `
  CREATE TABLE draft_insertions (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    note_id TEXT REFERENCES idea_notes(id) ON DELETE SET NULL,
    note_author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    inserted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('entered', 'brainstorm', 'reading')),
    source_title TEXT,
    source_url TEXT,
    inserted_at TEXT NOT NULL
  );
  CREATE INDEX draft_insertions_draft ON draft_insertions(draft_id);
  `,
  // T35: flat tags on notes. A tag is just a label on a note (kept in the order given); the same word on several notes
  // is how a draft, a section or a theme is shown. They go with the note.
  `
  CREATE TABLE idea_note_tags (
    note_id TEXT NOT NULL REFERENCES idea_notes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (note_id, tag COLLATE NOCASE)
  );
  `,
  // T32b: a note can be a direct quotation, which is never edited. The database itself refuses to change a
  // quotation's words, so no route or later feature can do it by accident (deleting one is still allowed).
  `
  ALTER TABLE idea_notes ADD COLUMN is_quote INTEGER NOT NULL DEFAULT 0 CHECK (is_quote IN (0, 1));
  CREATE TRIGGER idea_notes_quote_text_is_fixed
  BEFORE UPDATE OF text ON idea_notes
  WHEN old.is_quote = 1 AND new.text <> old.text
  BEGIN
    SELECT RAISE(ABORT, 'A quotation cannot be edited');
  END;
  `,
]

/**
 * Every draft now develops an idea. Drafts from before ideas existed each get an idea of their own,
 * named after the draft, so nothing is lost and people can regroup them later. `drafts.idea_id` stays
 * nullable in the schema (SQLite can't add NOT NULL afterwards); the draft store always sets it.
 */
export function wrapStandaloneDraftsInIdeas(db: DatabaseSync) {
  const rows = db
    .prepare(
      'SELECT id, profile_id, created_by, title, created_at, updated_at FROM drafts WHERE idea_id IS NULL ORDER BY created_at, rowid',
    )
    .all() as {
    id: string
    profile_id: string
    created_by: string | null
    title: string
    created_at: string
    updated_at: string
  }[]
  const addIdea = db.prepare(
    'INSERT INTO ideas (id, profile_id, created_by, name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  const attach = db.prepare('UPDATE drafts SET idea_id = ? WHERE id = ?')
  for (const d of rows) {
    const ideaId = randomUUID()
    const name = d.title.trim().slice(0, IDEA_NAME_MAX) || 'Untitled idea'
    addIdea.run(ideaId, d.profile_id, d.created_by, name, '', d.created_at, d.updated_at)
    attach.run(ideaId, d.id)
  }
}

/**
 * Profiles become publishing venues with human-readable ids, `<owner handle>-<name slug>`.
 * Every user gets a unique handle (letters and digits only), and existing profiles, which had
 * random ids, are renamed to match. `users.handle` stays nullable in the schema because SQLite
 * can't add a NOT NULL column without a default; the unique index and the store enforce it.
 */
export function addHandlesAndVenueProfiles(db: DatabaseSync) {
  db.exec(`
    ALTER TABLE users ADD COLUMN handle TEXT;
    ALTER TABLE profiles ADD COLUMN site_url TEXT;
    -- Kept apart from profiles so listing profiles never reads image bytes.
    CREATE TABLE profile_images (
      profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL,
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const handles = new Map<string, string>()
  const takenHandles = new Set<string>()
  const users = db
    .prepare('SELECT id, name, email FROM users ORDER BY created_at, rowid')
    .all() as { id: string; name: string; email: string }[]
  const setHandle = db.prepare('UPDATE users SET handle = ? WHERE id = ?')
  for (const u of users) {
    const handle = firstAvailable(suggestHandle(u.name, u.email), (h) => takenHandles.has(h))
    takenHandles.add(handle)
    handles.set(u.id, handle)
    setHandle.run(handle, u.id)
  }
  db.exec('CREATE UNIQUE INDEX users_handle ON users(handle)')

  // Rewriting a primary key means rewriting its children too; check foreign keys only at commit.
  db.exec('PRAGMA defer_foreign_keys = ON')
  const profiles = db
    .prepare(
      `SELECT p.id, p.name,
         (SELECT m.user_id FROM profile_members m WHERE m.profile_id = p.id
          ORDER BY m.role = 'owner' DESC, m.joined_at, m.rowid LIMIT 1) AS owner_id
       FROM profiles p ORDER BY p.created_at, p.rowid`,
    )
    .all() as { id: string; name: string; owner_id: string | null }[]
  const takenIds = new Set<string>()
  const rename = [
    db.prepare('UPDATE profiles SET id = ? WHERE id = ?'),
    db.prepare('UPDATE profile_members SET profile_id = ? WHERE profile_id = ?'),
    db.prepare('UPDATE drafts SET profile_id = ? WHERE profile_id = ?'),
    db.prepare('UPDATE invitations SET profile_id = ? WHERE profile_id = ?'),
  ]
  for (const p of profiles) {
    const handle = p.owner_id ? handles.get(p.owner_id) : undefined
    if (!handle) continue // no members, so nobody can reach it anyway; leave it be
    const id = firstAvailable(profileIdFor(handle, p.name), (c) => takenIds.has(c), '-')
    takenIds.add(id)
    for (const statement of rename) statement.run(id, p.id)
  }
}

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
export function migrate(
  db: DatabaseSync,
  path = 'the database',
  migrations: Migration[] = MIGRATIONS,
) {
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
      const step = migrations[v]!
      if (typeof step === 'string') db.exec(step)
      else step(db)
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
