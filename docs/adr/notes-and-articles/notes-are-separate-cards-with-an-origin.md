# Notes are separate cards, with an origin (T28)

An idea's notes used to be one text column. They are now rows in `idea_notes` (text, origin, author, position,
`added_at`), arranged by the person and changed through `/ideas/:id/notes` (add, edit, delete, and reorder by
sending the whole list of ids, with a 409 if it is stale, as for feed sources; at most 200 per idea).
`origin` is `entered`, `brainstorm` or `reading`; notes made through the API are always `entered`, and later
tasks set the others on the server. `added_at` is for the drafting drawer (T33) and has no route yet.

- **`publication_id` always, `idea_id` nullable.** A note can later belong to a publication before it has an idea
  (starting an idea from notes, T37), so the table does not assume an idea. `publication_id` is in the publication-rename list.
- **No tags or reading-item column yet.** Migrations are append-only and `ALTER TABLE ADD COLUMN` is cheap, so
  T35 and T31 add theirs when they need them.
- **Existing text becomes one note.** The migration copies each non-blank `ideas.notes` into a single `entered`
  note. The old column is no longer read (SQLite can't cheaply drop a NOT NULL column); new ideas write `''`.
- **Transitional single text.** `Idea.notes` is still returned, and `PATCH /ideas/:id` / `POST /ideas` with
  `notes` still work, so the idea page and brainstorm are unchanged until T29 and T30. It is the notes as
  Markdown bullets (`notesToMarkdown`, T28b): one top-level bullet per note, the rest of a note's lines (and any
  bullets of its own) indented two spaces under it, so a line break inside a note can't be mistaken for a new
  note. Writing it back (`markdownToNotes`) splits text made only of such bullets into notes; any other text
  becomes one note. Text that reads as the notes already there changes nothing, so a form that always sends
  `notes` keeps each note's id and origin. Remove it with T29/T30.
