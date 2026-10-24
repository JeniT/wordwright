import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * SQL, or a function when the change needs logic SQL can't express. Either runs in one transaction.
 * `foreignKeysOff` is for rebuilding a table that other tables refer to (SQLite can't loosen a column in
 * place): dropping the old table with foreign keys on would fire their `ON DELETE` actions and clear every
 * reference to it. Foreign keys are off only while it runs, and the whole database is checked before it commits.
 */
type Migration =
  string | ((db: DatabaseSync) => void) | { foreignKeysOff: true; run: (db: DatabaseSync) => void }

/**
 * Ordered, append-only. The schema version is the number of migrations applied.
 *
 * The first entry is the whole schema as it stood when "profile" and "venue" became "publication" (#174). There were
 * no live deployments, so the earlier history was folded into it rather than carried forward, and the columns and
 * tables nothing read any more were left out. A development database from before that has a higher version than this
 * build knows and is refused; delete it. Everything after this is appended as usual.
 */
export const MIGRATIONS: Migration[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,            -- stored lower-cased; uniqueness is enforced here
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    -- The username, which starts the address of each publication the person creates. Null only for a reviewer-only
    -- account (no username, no publication). Unique when set.
    handle TEXT,
    -- False only for sign-ups through an identity provider, who were given a username.
    handle_chosen INTEGER NOT NULL DEFAULT 1,
    reviewer_only INTEGER NOT NULL DEFAULT 0,
    -- When an unconfirmed account was warned that it is about to be deleted (once only).
    deletion_reminded_at TEXT
  );
  CREATE UNIQUE INDEX users_handle ON users(handle);
  -- A former username can't be taken by anyone else (publication addresses and invitations may still mention it),
  -- but its owner can come back to it.
  CREATE TABLE retired_handles (
    handle TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    retired_at TEXT NOT NULL
  );
  CREATE INDEX retired_handles_user ON retired_handles(user_id);
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
  -- Only hashes of session / reset / verification tokens are stored, so a database leak can't be replayed.
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
  -- A requested change of email address, waiting for the link sent to the *new* address to be opened.
  CREATE TABLE email_changes (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX email_changes_user ON email_changes(user_id);
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
  -- A user's own LLM credentials. The key is encrypted; only the last four characters are kept in clear (the longer elided form shown to the owner is worked out from the key when asked).
  CREATE TABLE llm_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    model TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- A person's own version of an AI prompt. No row means "use the default", so improvements to the
  -- default reach everyone who hasn't changed it. One column per prompt kind, added as they appear.
  CREATE TABLE user_prompts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    brainstorm TEXT,
    updated_at TEXT NOT NULL
  );
  -- A person's own settings, one column per setting. No row (or a null) means "the default".
  CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    critique_rounds INTEGER CHECK (critique_rounds BETWEEN 1 AND 5),
    updated_at TEXT NOT NULL
  );

  -- A publication (a Substack, a blog, a magazine, a newsletter): where ideas and drafts live, and who works on them.
  CREATE TABLE publications (
    id TEXT PRIMARY KEY,                   -- <creator's username>-<slug of name>
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    site_url TEXT,
    description TEXT                       -- Markdown, the writer's own words
  );
  CREATE TABLE publication_members (
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (publication_id, user_id)
  );
  CREATE INDEX publication_members_user ON publication_members(user_id);
  -- Renaming a publication changes its id; the old ids keep pointing at it so shared links still work.
  CREATE TABLE publication_aliases (
    old_id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE
  );
  CREATE INDEX publication_aliases_publication ON publication_aliases(publication_id);
  -- Kept apart from publications so listing publications never reads image bytes.
  CREATE TABLE publication_images (
    publication_id TEXT PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- The icon of the publication's website, shown when it has no picture of its own. Kept apart from
  -- publication_images because it is another site's image, fetched by us, with its own (smaller, ICO-allowing) rules.
  CREATE TABLE publication_site_icons (
    publication_id TEXT PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- Invitations are addressed to an email, not an account, so people can be invited before they sign
  -- up. Accepted rows are kept so that re-opening the link is harmless.
  CREATE TABLE invitations (
    id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TEXT
  );
  CREATE INDEX invitations_publication ON invitations(publication_id);
  CREATE INDEX invitations_email ON invitations(email);
  -- Invitations someone has chosen not to receive, keyed by the address (invitees often have no
  -- account). A null sender blocks everyone. Blocks about a sender go with that sender's account.
  CREATE TABLE invitation_blocks (
    email TEXT NOT NULL,
    sender_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX invitation_blocks_unique ON invitation_blocks(email, COALESCE(sender_id, ''));

  -- Feeds a publication watches for ideas. position is the priority (0 first); the store keeps it dense.
  -- title, description and site_url are what the feed says about itself, read when it was added.
  CREATE TABLE publication_sources (
    id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    title TEXT,
    description TEXT,
    site_url TEXT,
    UNIQUE (publication_id, url)
  );
  CREATE INDEX publication_sources_publication ON publication_sources(publication_id, position);
  -- The picture kept for a source, in its own table so listing sources never reads image bytes.
  CREATE TABLE publication_source_icons (
    source_id TEXT PRIMARY KEY REFERENCES publication_sources(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- The latest read of each feed's posts: kept so a page view doesn't ask the feed again, and so a
  -- feed that has stopped working can be shown as such. The posts are a JSON list of FeedItem.
  CREATE TABLE publication_source_fetches (
    source_id TEXT PRIMARY KEY REFERENCES publication_sources(id) ON DELETE CASCADE,
    items TEXT NOT NULL DEFAULT '[]',
    etag TEXT,
    last_modified TEXT,
    checked_at TEXT,
    last_worked_at TEXT,
    last_error TEXT,
    last_error_at TEXT
  );
  -- Posts from a publication's feeds that someone chose to ignore. Keyed by the post's address (as links are
  -- compared), so a post carried by two feeds is one decision. Whether a post was added is not kept here: it is
  -- added if it is on one of the publication's lists of articles, however it got there.
  CREATE TABLE feed_post_ignores (
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    post_key TEXT NOT NULL,
    ignored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    ignored_at TEXT NOT NULL,
    PRIMARY KEY (publication_id, post_key)
  );

  -- An idea is something to write about; drafts develop it. Its notes are rows in idea_notes.
  CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX ideas_publication ON ideas(publication_id);
  CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- The one person who changes its words; cleared if their account goes (removing a member or an account hands
    -- their drafts to an owner first). A save must quote the version it was based on.
    editor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    -- The order of an idea's drafts (the reading order of a linked set).
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX drafts_publication ON drafts(publication_id);
  CREATE INDEX drafts_idea ON drafts(idea_id);

  -- Notes: index cards. publication_id is always set; idea_id is null for a note that belongs to the publication as a
  -- whole. kept_name (here and below) is a display name copied at account deletion, only if the person chose to keep
  -- it, so a person who chooses not to leaves no trace of the name on any row.
  CREATE TABLE idea_notes (
    id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    idea_id TEXT REFERENCES ideas(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('entered', 'brainstorm', 'reading')),
    position INTEGER NOT NULL,
    added_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- The reading-list item a note was taken from; it keeps no claim on it if the item is removed.
    reading_item_id TEXT REFERENCES idea_links(id) ON DELETE SET NULL,
    is_quote INTEGER NOT NULL DEFAULT 0 CHECK (is_quote IN (0, 1)),
    kept_name TEXT
  );
  CREATE INDEX idea_notes_idea ON idea_notes(idea_id);
  CREATE INDEX idea_notes_publication ON idea_notes(publication_id);
  -- The database itself refuses to change a quotation's words, so no route or later feature can do it by
  -- accident (deleting one is still allowed).
  CREATE TRIGGER idea_notes_quote_text_is_fixed
  BEFORE UPDATE OF text ON idea_notes
  WHEN old.is_quote = 1 AND new.text <> old.text
  BEGIN
    SELECT RAISE(ABORT, 'A quotation cannot be edited');
  END;
  -- Flat tags on notes, kept in the order given; the same word on several notes groups them. They go with the note.
  CREATE TABLE idea_note_tags (
    note_id TEXT NOT NULL REFERENCES idea_notes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (note_id, tag COLLATE NOCASE)
  );

  -- A reading-list item. publication_id is always set; idea_id is null for an item on the publication's own list.
  -- On that list an item can be kept; the others drop off a month after they were put there.
  CREATE TABLE idea_links (
    id TEXT PRIMARY KEY,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    idea_id TEXT REFERENCES ideas(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    origin TEXT NOT NULL DEFAULT 'entered'
      CHECK (origin IN ('entered', 'brainstorm', 'research', 'idea_generation', 'feed')),
    authors TEXT NOT NULL DEFAULT '[]',    -- a JSON list of names
    why TEXT,                              -- the AI's reason for suggesting it
    source_id TEXT REFERENCES publication_sources(id) ON DELETE SET NULL,
    kept INTEGER NOT NULL DEFAULT 0 CHECK (kept IN (0, 1))
  );
  CREATE INDEX idea_links_idea ON idea_links(idea_id);
  CREATE INDEX idea_links_publication ON idea_links(publication_id);
  CREATE TABLE idea_link_tags (
    link_id TEXT NOT NULL REFERENCES idea_links(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (link_id, tag COLLATE NOCASE)
  );
  -- What was moved between a publication's articles and notes and its ideas, by whom and when, one row per
  -- operation and thing moved. Kept so a move can be shown and undone later; the things themselves may be gone.
  CREATE TABLE moves (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    moved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    moved_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('reading', 'note')),
    item_id TEXT NOT NULL,
    from_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    to_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    -- True when the item joined an item the destination already had (and was not carried over as it was).
    merged INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX moves_publication ON moves(publication_id, moved_at);

  -- The brainstorming conversation about an idea: one thread, shared by everyone in the publication. Kept in our
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
    kept_name TEXT,
    UNIQUE (idea_id, seq)
  );
  -- A suggestion from the AI. It changes nothing until a person accepts it.
  CREATE TABLE idea_proposals (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES idea_messages(id) ON DELETE CASCADE,
    tool_call_id TEXT NOT NULL,
    tool TEXT NOT NULL CHECK (tool IN ('update_idea', 'create_idea', 'suggest_reading')),
    input TEXT NOT NULL,
    -- The idea's title and notes when it was suggested, to notice if they have changed since.
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
  CREATE INDEX idea_proposals_message ON idea_proposals(message_id);
  -- The points the AI recorded as notes while replying. Kept apart from the notes themselves so the chat can
  -- show them (and the AI be told what became of each call) even after a note is deleted or changed.
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
  -- Research is separate from the conversation: a run (what the writer asked to look into) holds the pages found,
  -- to be reviewed.
  CREATE TABLE idea_research (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    -- Whose key paid for it; SET NULL so a leaving member's research stays.
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    areas TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    kept_name TEXT
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
    status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'added', 'dismissed')),
    -- The reading-list item an added page made, so that reconsidering it can take that item off the list again.
    link_id TEXT REFERENCES idea_links(id) ON DELETE SET NULL
  );
  CREATE INDEX idea_research_items_research ON idea_research_items(research_id);

  -- Critique rounds are kept with their draft; their points are rows in draft_comments (round_id set).
  CREATE TABLE critique_rounds (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    ready INTEGER NOT NULL CHECK (ready IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX critique_rounds_draft ON critique_rounds(draft_id, created_at);
  -- A review is of a snapshot, a frozen copy of the draft made when the editor sends it for review (ADR 0001).
  CREATE TABLE draft_snapshots (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX draft_snapshots_draft ON draft_snapshots(draft_id, created_at);
  -- A review is the grant to read one snapshot and comment on it: open (they can comment), ended (they finished) or
  -- closed (the editor stopped accepting comments).
  CREATE TABLE draft_reviews (
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
  CREATE INDEX draft_reviews_reviewer ON draft_reviews(reviewer_id);
  CREATE INDEX draft_reviews_draft ON draft_reviews(draft_id);
  -- Review invitations are separate from publication invitations but share who has blocked whom.
  CREATE TABLE review_invitations (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    snapshot_id TEXT REFERENCES draft_snapshots(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX review_invitations_draft ON review_invitations(draft_id);
  -- One comment model for people and the AI (those with a round_id are the AI's).
  CREATE TABLE draft_comments (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    round_id TEXT REFERENCES critique_rounds(id) ON DELETE CASCADE,
    review_id TEXT REFERENCES draft_reviews(id) ON DELETE SET NULL,
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
  -- Words pulled into a draft from a note, or taken from an AI option in a Rephrase window, keep their origin. The
  -- record says what was inserted and where it came from, so the draft can say so even after the text is edited.
  -- The note, its author and the inserter may all go; the record stays.
  CREATE TABLE draft_insertions (
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
    -- Only for an option: what was offered, the writer's aim and where the words went.
    option_kind TEXT CHECK (option_kind IN ('title', 'passage')),
    option_offered TEXT,
    option_aim TEXT
  );
  CREATE INDEX draft_insertions_draft ON draft_insertions(draft_id);
  -- Offers, asks and reassignments of a draft's editor role, kept as a history. People are referenced by id (so a
  -- name is shown only while the account exists) and handovers are closed before they leave a publication.
  -- reason marks a reassignment the system made because the editor left.
  CREATE TABLE draft_handovers (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('offer', 'ask', 'reassign')),
    status TEXT NOT NULL CHECK (status IN
      ('pending', 'accepted', 'declined', 'withdrawn', 'dismissed', 'fulfilled', 'done')),
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    member_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    kept_actor_name TEXT,
    kept_member_name TEXT,
    reason TEXT
  );
  CREATE INDEX draft_handovers_draft ON draft_handovers(draft_id, created_at);
  CREATE UNIQUE INDEX draft_handovers_one_offer ON draft_handovers(draft_id)
    WHERE kind = 'offer' AND status = 'pending';
  `,
  `
  -- Where you're signed in (#165). Only a coarse label ("Safari on macOS") and times are kept: no IP address, no
  -- location, no raw user-agent. "id" is what the page names a session by, so the token hash never leaves the server.
  ALTER TABLE sessions ADD COLUMN id TEXT;
  ALTER TABLE sessions ADD COLUMN device_label TEXT;
  ALTER TABLE sessions ADD COLUMN last_used_at TEXT;
  UPDATE sessions SET id = lower(hex(randomblob(16))), last_used_at = created_at;
  CREATE UNIQUE INDEX sessions_id ON sessions(id);
  `,
  // A move can now cross publications: publication_id is where the thing came from, and this is where it went (null
  // when that was the same publication). The log concerns both, so it goes with either.
  `
  ALTER TABLE moves ADD COLUMN to_publication_id TEXT REFERENCES publications(id) ON DELETE CASCADE;
  CREATE INDEX moves_to_publication ON moves(to_publication_id) WHERE to_publication_id IS NOT NULL;
  `,
  // Tutorial mode (#198). tutorial_mode null = the default = off, so accounts that predate it stay off; registration
  // writes 1. tutorial_seen and tutorial_answered are no longer read or written (#314); migrations are append-only.
  `
  ALTER TABLE user_settings ADD COLUMN tutorial_mode INTEGER CHECK (tutorial_mode IN (0, 1));
  ALTER TABLE user_settings ADD COLUMN tutorial_seen TEXT;
  ALTER TABLE user_settings ADD COLUMN tutorial_answered INTEGER CHECK (tutorial_answered IN (0, 1));
  `,
  // The editable brainstorming prompt is gone (#205): everyone uses the default. Stored copies are deleted rather than
  // kept where nobody can see or use them.
  `
  DROP TABLE user_prompts;
  `,
  // Whether a stored site or feed icon is square to its corners (#226), so it can fill its box. Null = not yet checked
  // (icons stored before this): shown on the plate until the startup backfill has looked at it.
  `
  ALTER TABLE publication_site_icons ADD COLUMN square INTEGER CHECK (square IN (0, 1));
  ALTER TABLE publication_source_icons ADD COLUMN square INTEGER CHECK (square IN (0, 1));
  `,
  // The square check now samples just inside the edge, so a logo with a faint border line counts as square. Flags
  // worked out by the first rule are stale: clear them, and the startup backfill looks again.
  `
  UPDATE publication_site_icons SET square = NULL;
  UPDATE publication_source_icons SET square = NULL;
  `,
  // An idea can hold several Refine conversations (#289), each with its own messages. The thread each idea had becomes
  // its first conversation. Nullable only because SQLite cannot add a NOT NULL column with a reference; the code
  // always sets it.
  (db) => {
    db.exec(`
      CREATE TABLE idea_conversations (
        id TEXT PRIMARY KEY,
        idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idea_conversations_idea ON idea_conversations(idea_id, created_at);
      ALTER TABLE idea_messages
        ADD COLUMN conversation_id TEXT REFERENCES idea_conversations(id) ON DELETE CASCADE;
      CREATE INDEX idea_messages_conversation ON idea_messages(conversation_id, seq);
    `)
    const threads = db
      .prepare('SELECT idea_id, MIN(created_at) AS created_at FROM idea_messages GROUP BY idea_id')
      .all() as { idea_id: string; created_at: string }[]
    const add = db.prepare(
      'INSERT INTO idea_conversations (id, idea_id, created_at) VALUES (?, ?, ?)',
    )
    const attach = db.prepare('UPDATE idea_messages SET conversation_id = ? WHERE idea_id = ?')
    for (const thread of threads) {
      const id = randomUUID()
      add.run(id, thread.idea_id, thread.created_at)
      attach.run(id, thread.idea_id)
    }
  },
  // A conversation can have a title: given by the AI on its first reply, or by a person (#294). Null until then.
  `
  ALTER TABLE idea_conversations ADD COLUMN title TEXT;
  ALTER TABLE idea_conversations ADD COLUMN title_source TEXT CHECK (title_source IN ('ai', 'writer'));
  `,
  // A suggestion can be a note (#295): the AI suggests notes rather than adding them. The `tool` check names the
  // kinds, so the table is rebuilt to allow the new one (SQLite cannot change a check in place).
  {
    foreignKeysOff: true,
    run: (db) => {
      db.exec(`
        CREATE TABLE idea_proposals_new (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES idea_messages(id) ON DELETE CASCADE,
          tool_call_id TEXT NOT NULL,
          tool TEXT NOT NULL CHECK (tool IN ('update_idea', 'create_idea', 'suggest_reading', 'suggest_note')),
          input TEXT NOT NULL,
          -- The idea's title when it was suggested, to notice if it has changed since.
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
        INSERT INTO idea_proposals_new SELECT id, message_id, tool_call_id, tool, input, base, status, decided_by,
          decided_at, created_idea_id, check_status, fetched_title, fetched_authors FROM idea_proposals;
        DROP TABLE idea_proposals;
        ALTER TABLE idea_proposals_new RENAME TO idea_proposals;
        CREATE INDEX idea_proposals_message ON idea_proposals(message_id);
      `)
    },
  },
  // A review request can be named by its editor (#302). Null until then; the date and time it was sent stands in.
  `
  ALTER TABLE draft_snapshots ADD COLUMN name TEXT;
  `,
  // A suggested note remembers who it is credited to (#306): the person whose message prompted it, then whoever last edits it.
  // Null for those made before this, which are credited to whoever adds them.
  `
  ALTER TABLE idea_proposals ADD COLUMN author_id TEXT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE idea_proposals ADD COLUMN edited INTEGER NOT NULL DEFAULT 0;
  `,
  // A draft the editor has marked as published, optionally with a link to the post (#311).
  `
  ALTER TABLE drafts ADD COLUMN published_at TEXT;
  ALTER TABLE drafts ADD COLUMN published_url TEXT;
  `,
  // Two more places that name a person in a sentence ("asked by", "added by") keep the name if the person chose to
  // (#313). Copied at account deletion like the other kept_* columns.
  `
  ALTER TABLE draft_reviews ADD COLUMN kept_inviter_name TEXT;
  ALTER TABLE idea_proposals ADD COLUMN kept_decided_by_name TEXT;
  `,
  // A comment made on selected words remembers them (#334). Null for a comment on a whole paragraph or the draft.
  `
  ALTER TABLE draft_comments ADD COLUMN quote TEXT;
  `,
  // The whole paragraph a comment was made on, so "Text changed" can show it beside the paragraph as it is now (#335).
  // Null for comments made before this, which keep only their excerpt, and for general ones.
  `
  ALTER TABLE draft_comments ADD COLUMN block_text TEXT;
  `,
  // An author can reword their own comment (#344); when they did, so the card can say "edited".
  `
  ALTER TABLE draft_comments ADD COLUMN edited_at TEXT;
  `,
  // The private alpha (#328): only accounts the owner approved reach the app. Everyone who already has an account is
  // approved. An admin is a flag set from the server's settings or a command, never in the app. The audit log keeps
  // who decided what about whom, as ids only: when either account goes the row stays, with the person unlinked.
  `
  ALTER TABLE users ADD COLUMN approval TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval IN ('waiting', 'approved', 'declined'));
  ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('approve', 'decline')),
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
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

/**
 * True when the database answers and has every migration applied, for the readiness check. Never throws: a broken
 * database is "not ready", not a crashed request.
 */
export function isReady(db: DatabaseSync, migrations: Migration[] = MIGRATIONS): boolean {
  try {
    const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
      user_version: number
    }
    return version === migrations.length
  } catch {
    return false
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
