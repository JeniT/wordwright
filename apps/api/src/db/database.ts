import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { firstAvailable, IDEA_NAME_MAX, profileIdFor, suggestHandle } from '@lfwa/core'

/**
 * SQL, or a function when the change needs logic SQL can't express. Either runs in one transaction.
 * `foreignKeysOff` is for rebuilding a table that other tables refer to (SQLite can't loosen a column in
 * place): dropping the old table with foreign keys on would fire their `ON DELETE` actions and clear every
 * reference to it. Foreign keys are off only while it runs, and the whole database is checked before it commits.
 */
type Migration =
  string | ((db: DatabaseSync) => void) | { foreignKeysOff: true; run: (db: DatabaseSync) => void }

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
  // #63: who wrote a reading-list item (a JSON list of names), and, in the record of where words came from, who
  // wrote the source as it was when the words went in.
  `
  ALTER TABLE idea_links ADD COLUMN authors TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE draft_insertions ADD COLUMN source_authors TEXT;
  `,
  // T38: the AI adds to the reading list. (1) The coach can suggest a page the writer gave it, as a proposal that
  // records what the server found at the address; a CHECK can't be widened in place, so idea_proposals is rebuilt
  // (nothing refers to it; its rows are copied as they are). (2) Research is separate from the conversation: a run
  // (what the writer asked to look into) holds the pages found, to be reviewed. (3) A reading-list item keeps the
  // AI's reason for suggesting it.
  `
  CREATE TABLE idea_proposals_new (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES idea_messages(id) ON DELETE CASCADE,
    tool_call_id TEXT NOT NULL,
    tool TEXT NOT NULL CHECK (tool IN ('update_idea', 'create_idea', 'suggest_reading')),
    input TEXT NOT NULL,
    base TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT,
    created_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    -- Only for suggest_reading: what looking at the address found.
    check_status TEXT CHECK (check_status IN ('found', 'no-title', 'not-found', 'not-public')),
    fetched_title TEXT,
    fetched_authors TEXT NOT NULL DEFAULT '[]'
  );
  INSERT INTO idea_proposals_new (id, message_id, tool_call_id, tool, input, base, status, decided_by, decided_at, created_idea_id)
    SELECT id, message_id, tool_call_id, tool, input, base, status, decided_by, decided_at, created_idea_id
    FROM idea_proposals;
  DROP TABLE idea_proposals;
  ALTER TABLE idea_proposals_new RENAME TO idea_proposals;
  CREATE INDEX idea_proposals_message ON idea_proposals(message_id);

  CREATE TABLE idea_research (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    -- Whose key paid for it; SET NULL so a leaving member's research stays.
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    areas TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idea_research_idea ON idea_research(idea_id);
  CREATE TABLE idea_research_items (
    id TEXT PRIMARY KEY,
    research_id TEXT NOT NULL REFERENCES idea_research(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    why TEXT NOT NULL,
    check_status TEXT NOT NULL CHECK (check_status IN ('found', 'no-title', 'not-found', 'not-public')),
    fetched_title TEXT,
    fetched_authors TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'added', 'dismissed'))
  );
  CREATE INDEX idea_research_items_research ON idea_research_items(research_id);

  ALTER TABLE idea_links ADD COLUMN why TEXT;
  `,
  // T38 follow-up: a research page that was added remembers the reading-list item it made, so that reconsidering
  // it can take that item off the list again. Null once the item is gone, or while the page isn't added.
  `
  ALTER TABLE idea_research_items ADD COLUMN link_id TEXT REFERENCES idea_links(id) ON DELETE SET NULL;
  `,
  `
  -- The latest read of each feed's posts: kept so a page view doesn't ask the feed again, and so a
  -- feed that has stopped working can be shown as such. The posts are a JSON list of FeedItem.
  CREATE TABLE profile_source_fetches (
    source_id TEXT PRIMARY KEY REFERENCES profile_sources(id) ON DELETE CASCADE,
    items TEXT NOT NULL DEFAULT '[]',
    etag TEXT,
    last_modified TEXT,
    checked_at TEXT,
    last_worked_at TEXT,
    last_error TEXT,
    last_error_at TEXT
  );
  `,
  // #69: reading items can belong to the profile as a whole (idea_id null), as notes already could, so a reading
  // list can be gathered before there is an idea. profile_id is now always set (as on idea_notes); a rebuild is
  // needed because SQLite can't make idea_id nullable in place, and notes and research items refer to this table.
  // A new origin 'feed' (with the feed it came from) is for posts added from the profile's feeds.
  {
    foreignKeysOff: true,
    run: (db) => {
      db.exec(`
        CREATE TABLE idea_links_new (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          idea_id TEXT REFERENCES ideas(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          read_at TEXT,
          origin TEXT NOT NULL DEFAULT 'entered'
            CHECK (origin IN ('entered', 'brainstorm', 'research', 'idea_generation', 'feed')),
          authors TEXT NOT NULL DEFAULT '[]',
          why TEXT,
          source_id TEXT REFERENCES profile_sources(id) ON DELETE SET NULL
        );
        INSERT INTO idea_links_new (id, profile_id, idea_id, url, title, created_at, read_at, origin, authors, why)
          SELECT l.id, i.profile_id, l.idea_id, l.url, l.title, l.created_at, l.read_at, l.origin, l.authors, l.why
          FROM idea_links l JOIN ideas i ON i.id = l.idea_id ORDER BY l.rowid;
        DROP TABLE idea_links;
        ALTER TABLE idea_links_new RENAME TO idea_links;
        CREATE INDEX idea_links_idea ON idea_links(idea_id);
        CREATE INDEX idea_links_profile ON idea_links(profile_id);
      `)
    },
  },
  // #69: what was moved between a profile's reading list and notes and its ideas, by whom and when, one row per
  // operation and thing moved. Kept so a move can be shown and undone later; the things themselves may be gone.
  `
  CREATE TABLE moves (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    moved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    moved_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('reading', 'note')),
    item_id TEXT NOT NULL,
    from_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    to_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    -- True when the item joined an item the destination already had (and was not carried over as it was).
    merged INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX moves_profile ON moves(profile_id, moved_at);
  `,
  // #70: posts from a profile's feeds that someone in the profile chose to ignore. Keyed by the post's address (as
  // links are compared), so a post carried by two feeds is one decision. Whether a post was added is not kept here:
  // it is added if it is on one of the profile's reading lists, however it got there.
  `
  CREATE TABLE feed_post_ignores (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_key TEXT NOT NULL,
    ignored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    ignored_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, post_key)
  );
  `,
  // #84: an item on a profile's own reading list can be kept; the others drop off a month after they were put there.
  // Only meaningful on a profile's own list (idea_id null), where it is the writer's choice.
  `ALTER TABLE idea_links ADD COLUMN kept INTEGER NOT NULL DEFAULT 0 CHECK (kept IN (0, 1))`,
  // #88: a link the writer added themselves to the profile's own list is kept from the start (they can switch it
  // off); only what a feed brought drops off after a month. Links already there are brought into line.
  `UPDATE idea_links SET kept = 1 WHERE idea_id IS NULL AND origin = 'entered'`,
  // T9b: critique rounds are kept with their draft, each point with the block it was about (its hash and the start of
  // its text, so it can be found again after edits) and whether the writer set it aside. They go with the draft.
  `
  CREATE TABLE critique_rounds (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    ready INTEGER NOT NULL CHECK (ready IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX critique_rounds_draft ON critique_rounds(draft_id, created_at);
  CREATE TABLE critique_points (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL REFERENCES critique_rounds(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    block TEXT NOT NULL,
    block_hash TEXT,
    excerpt TEXT NOT NULL,
    point TEXT NOT NULL,
    reason TEXT NOT NULL,
    dismissed_at TEXT
  );
  CREATE INDEX critique_points_round ON critique_points(round_id, rank);
  `,
  // T9c: a person's own settings, one column per setting as they appear. No row (or a null) means "the default",
  // so a change to the default reaches everyone who has not chosen.
  `
  CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    critique_rounds INTEGER CHECK (critique_rounds BETWEEN 1 AND 5),
    updated_at TEXT NOT NULL
  );
  `,
  // #131: a venue description in Markdown. Where it came from is kept so an AI draft (#27) can show its evidence
  // and stay out of the prompts until someone accepts it; sources is a JSON array of links.
  `
  ALTER TABLE profiles ADD COLUMN description TEXT;
  ALTER TABLE profiles ADD COLUMN description_origin TEXT NOT NULL DEFAULT 'entered'
    CHECK (description_origin IN ('entered', 'inferred'));
  ALTER TABLE profiles ADD COLUMN description_confirmed INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE profiles ADD COLUMN description_sources TEXT NOT NULL DEFAULT '[]';
  `,
  // #136: an AI draft that a person has changed keeps its origin (the words began as the AI's) and says it was edited.
  `
  ALTER TABLE profiles ADD COLUMN description_edited INTEGER NOT NULL DEFAULT 0;
  `,
  // #140: flat tags on reading-list items, the same as on notes (kept in the order given; the same word on several
  // items groups them). They go with the item.
  `
  CREATE TABLE idea_link_tags (
    link_id TEXT NOT NULL REFERENCES idea_links(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (link_id, tag COLLATE NOCASE)
  );
  `,
  // #151: AI-drafted descriptions are gone (#150), so a description is always the writer's own words and the
  // columns that said where it came from, whether it was accepted and what it was drawn from are dropped.
  `
  ALTER TABLE profiles DROP COLUMN description_origin;
  ALTER TABLE profiles DROP COLUMN description_confirmed;
  ALTER TABLE profiles DROP COLUMN description_sources;
  ALTER TABLE profiles DROP COLUMN description_edited;
  `,
  // #152: the profile role 'editor' becomes 'member' (#26 gives every draft an "editor", one person responsible
  // for it). SQLite can't alter a CHECK, so the table is rebuilt; nothing references it.
  `
  CREATE TABLE profile_members_new (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, user_id)
  );
  INSERT INTO profile_members_new
    SELECT profile_id, user_id, CASE role WHEN 'editor' THEN 'member' ELSE role END, joined_at
    FROM profile_members;
  DROP TABLE profile_members;
  ALTER TABLE profile_members_new RENAME TO profile_members;
  CREATE INDEX profile_members_user ON profile_members(user_id);
  `,
  // #153: when someone deletes their account they may leave their display name (only) on what they contributed to
  // profiles that continue. It is copied here at deletion, never before, and is read only when the account is gone,
  // so a person who chooses not to keep it leaves no trace of the name on any row.
  `
  ALTER TABLE idea_notes ADD COLUMN kept_name TEXT;
  ALTER TABLE idea_messages ADD COLUMN kept_name TEXT;
  ALTER TABLE idea_research ADD COLUMN kept_name TEXT;
  ALTER TABLE draft_insertions ADD COLUMN kept_note_author_name TEXT;
  ALTER TABLE draft_insertions ADD COLUMN kept_inserted_by_name TEXT;
  `,
  // #154: each draft has one editor, who alone changes its words, and a version that saves must quote. Existing
  // drafts go to their creator, or to the profile's longest-standing owner if the creator is gone. The editor
  // is cleared if their account goes, but removing a member or an account hands their drafts to an owner first.
  `
  ALTER TABLE drafts ADD COLUMN editor_id TEXT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE drafts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  UPDATE drafts SET editor_id = coalesce(
    created_by,
    (SELECT m.user_id FROM profile_members m WHERE m.profile_id = drafts.profile_id AND m.role = 'owner'
     ORDER BY m.joined_at, m.rowid LIMIT 1)
  );
  `,
  // #155: handing a draft's editor role over. Offers, asks and reassignments are kept as a history; people are
  // referenced by id (so a name is shown only while the account exists) and closed before they leave a profile.
  `
  CREATE TABLE draft_handovers (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('offer', 'ask', 'reassign')),
    status TEXT NOT NULL CHECK (status IN
      ('pending', 'accepted', 'declined', 'withdrawn', 'dismissed', 'fulfilled', 'done')),
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    member_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX draft_handovers_draft ON draft_handovers(draft_id, created_at);
  CREATE UNIQUE INDEX draft_handovers_one_offer ON draft_handovers(draft_id)
    WHERE kind = 'offer' AND status = 'pending';
  `,
  // The handover log keeps names like everything else people did (#153): copied at account deletion only if the
  // person chose to keep their name. `reason` marks a reassignment the system made because the editor left.
  `
  ALTER TABLE draft_handovers ADD COLUMN kept_actor_name TEXT;
  ALTER TABLE draft_handovers ADD COLUMN kept_member_name TEXT;
  ALTER TABLE draft_handovers ADD COLUMN reason TEXT;
  `,
  // #157: reviewer-only accounts (no username, no profile) and the reviews they were invited to. A review is the
  // grant to read one draft and comment on it; it ends when the reviewer leaves or the editor or an owner revokes it.
  // Review invitations are separate from profile invitations but share who has blocked whom.
  `
  ALTER TABLE users ADD COLUMN reviewer_only INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE draft_reviews (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    state TEXT NOT NULL CHECK (state IN ('open', 'left', 'revoked')),
    created_at TEXT NOT NULL,
    ended_at TEXT,
    UNIQUE (draft_id, reviewer_id)
  );
  CREATE INDEX draft_reviews_reviewer ON draft_reviews(reviewer_id);
  CREATE TABLE review_invitations (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX review_invitations_draft ON review_invitations(draft_id);
  `,
  // #156: one comment model for people and the AI. A critique's points become comments (those with a round_id are
  // the AI's; "dismissed" becomes "resolved"), and members can add their own. A person's comment keeps their name
  // through leaving a profile (it is read from the account) and, if they delete their account and choose to,
  // through that (kept_name, copied at deletion like the other contributions).
  `
  CREATE TABLE draft_comments (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    round_id TEXT REFERENCES critique_rounds(id) ON DELETE CASCADE,
    author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    kept_name TEXT,
    rank INTEGER NOT NULL DEFAULT 0,
    block TEXT NOT NULL,
    block_hash TEXT,
    excerpt TEXT NOT NULL,
    text TEXT NOT NULL,
    reason TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX draft_comments_draft ON draft_comments(draft_id, created_at, rank);
  INSERT INTO draft_comments (id, draft_id, round_id, rank, block, block_hash, excerpt, text, reason, resolved_at, created_at)
    SELECT p.id, r.draft_id, r.id, p.rank, p.block, p.block_hash, p.excerpt, p.point, p.reason, p.dismissed_at, r.created_at
    FROM critique_points p JOIN critique_rounds r ON r.id = p.round_id;
  DROP TABLE critique_points;
  `,
  // #158: a review is of a snapshot, a frozen copy of the draft made when the editor sends it for review (ADR 0001).
  // Reviews already made get a snapshot of the draft as it is now. States become open, ended (the reviewer finished)
  // and closed (the editor stopped accepting), and a reviewer's comments remember the review they were made in.
  `
  CREATE TABLE draft_snapshots (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX draft_snapshots_draft ON draft_snapshots(draft_id, created_at);
  INSERT INTO draft_snapshots (id, draft_id, title, body, created_by, created_at)
    SELECT lower(hex(randomblob(16))), d.id, d.title, d.body, d.editor_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM drafts d
    WHERE d.id IN (SELECT draft_id FROM draft_reviews UNION SELECT draft_id FROM review_invitations);
  CREATE TABLE draft_reviews_new (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES draft_snapshots(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    state TEXT NOT NULL CHECK (state IN ('open', 'ended', 'closed')),
    created_at TEXT NOT NULL,
    ended_at TEXT,
    UNIQUE (snapshot_id, reviewer_id)
  );
  INSERT INTO draft_reviews_new (id, draft_id, snapshot_id, reviewer_id, invited_by, state, created_at, ended_at)
    SELECT r.id, r.draft_id, (SELECT s.id FROM draft_snapshots s WHERE s.draft_id = r.draft_id), r.reviewer_id,
           r.invited_by, CASE r.state WHEN 'left' THEN 'ended' WHEN 'revoked' THEN 'closed' ELSE r.state END,
           r.created_at, r.ended_at
    FROM draft_reviews r;
  DROP TABLE draft_reviews;
  ALTER TABLE draft_reviews_new RENAME TO draft_reviews;
  CREATE INDEX draft_reviews_reviewer ON draft_reviews(reviewer_id);
  CREATE INDEX draft_reviews_draft ON draft_reviews(draft_id);
  ALTER TABLE review_invitations ADD COLUMN snapshot_id TEXT REFERENCES draft_snapshots(id) ON DELETE CASCADE;
  UPDATE review_invitations SET snapshot_id =
    (SELECT s.id FROM draft_snapshots s WHERE s.draft_id = review_invitations.draft_id);
  ALTER TABLE draft_comments ADD COLUMN review_id TEXT REFERENCES draft_reviews(id) ON DELETE SET NULL;
  UPDATE draft_comments SET review_id =
    (SELECT r.id FROM draft_reviews r WHERE r.draft_id = draft_comments.draft_id AND r.reviewer_id = draft_comments.author_id)
    WHERE author_id IN (SELECT reviewer_id FROM draft_reviews);
  `,
  // #162: words that came from an AI option in a Rephrase window are recorded beside the words pulled in from notes.
  // A CHECK can't be widened in place, so draft_insertions is rebuilt (nothing refers to it; its rows are copied as
  // they are). An option row has no note; it keeps what was offered, the writer's aim and where the words went.
  `
  CREATE TABLE draft_insertions_new (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    note_id TEXT REFERENCES idea_notes(id) ON DELETE SET NULL,
    note_author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    inserted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('entered', 'brainstorm', 'reading', 'option')),
    source_title TEXT,
    source_url TEXT,
    inserted_at TEXT NOT NULL,
    source_authors TEXT,
    kept_note_author_name TEXT,
    kept_inserted_by_name TEXT,
    option_kind TEXT CHECK (option_kind IN ('title', 'passage')),
    option_offered TEXT,
    option_aim TEXT
  );
  INSERT INTO draft_insertions_new (id, draft_id, note_id, note_author_id, inserted_by, text, origin, source_title,
      source_url, inserted_at, source_authors, kept_note_author_name, kept_inserted_by_name)
    SELECT id, draft_id, note_id, note_author_id, inserted_by, text, origin, source_title,
      source_url, inserted_at, source_authors, kept_note_author_name, kept_inserted_by_name
    FROM draft_insertions;
  DROP TABLE draft_insertions;
  ALTER TABLE draft_insertions_new RENAME TO draft_insertions;
  CREATE INDEX draft_insertions_draft ON draft_insertions(draft_id);
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
    const step = migrations[v]!
    const rebuild = typeof step === 'object'
    // Foreign keys can only be switched off outside a transaction.
    if (rebuild) db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    try {
      if (typeof step === 'string') db.exec(step)
      else if (typeof step === 'function') step(db)
      else step.run(db)
      if (rebuild) {
        const broken = db.prepare('PRAGMA foreign_key_check').all()
        if (broken.length) {
          throw new DatabaseError(`Migration ${v + 1} left ${broken.length} broken references`)
        }
      }
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    } finally {
      if (rebuild) db.exec('PRAGMA foreign_keys = ON')
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
