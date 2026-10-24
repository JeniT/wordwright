# Notes are separate rows in one reorderable list, each with an origin (T28, T29)

An idea's notes used to be one text column. They are now rows in `idea_notes` (text, origin, author, position, `added_at`),
arranged by the person and changed through `/ideas/:id/notes` (add, edit, delete, and reorder by sending the whole list of
ids, with a 409 if it is stale, as for feed sources; at most 200 per idea). `origin` is `entered`, `brainstorm` or `reading`.
`added_at` is for the drafting drawer ([Notes beside the draft](notes-beside-the-draft-and-the-words-keep-their.md)).

- **`publication_id` always, `idea_id` nullable.** A note can belong to a publication before it has an idea (starting an
  idea from notes), so the table does not assume one.
- **A list, not cards.** Notes were first offered as cards or a list, with a toggle. The cards were removed (#59): dragging
  between cards two across didn't work in the owner's Chrome (it did in an automated run, so it was likely down to real
  pointer behaviour), and cards look uneven for notes of very different lengths. Notes are one `ReorderableList`, like the
  idea sources and an idea's drafts.
- **Existing text became one note.** The migration copied each non-blank `ideas.notes` into a single `entered` note; the old
  column is no longer read (SQLite can't cheaply drop a NOT NULL column).
- **Deleting a note** asks for a held press, not a dialog ([Holding to confirm](../visual-design-and-navigation/holding-to-confirm-instead-of-a-dialog.md)).
