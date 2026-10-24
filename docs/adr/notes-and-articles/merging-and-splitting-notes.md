# Merging and splitting notes (T36)

**Merge.** "Merge notes" on the notes list lets the writer tick two or more notes and join them into one: the
first of them (in the order they are arranged, whatever order they were ticked in) takes the joined text, as
paragraphs, and its place; the others are deleted. The result is a new, unused note (`added_at` cleared). Because a
note says where it came from, and the notes now have rules about that, only some notes can be merged
(`NoteEditService`), each refusal a 409 with a message saying why:

- **Same origin.** Typed, brainstormed and read notes can't be mixed. A merged note can say where it came from only
  once, and picking one origin would either launder an AI-recorded or quoted point as the writer's own typing or
  claim a source for words that didn't come from it ([responsible-ai.md](../../responsible-ai.md), principle 5). The
  writer who wants them together can retype the point as one note. Alternatives rejected: a "mixed" origin (needs
  a table rebuild and a new label everywhere) and silently taking the first note's origin.
- **Same reading-list item** if they were taken from one.
- **No quotations** (they have to stay exactly as written) **and nothing already in a draft** (its words are in
  the draft; "put it back first").
- The author is the notes' author if they all share one, otherwise whoever merged them. Tags are every tag once
  (ignoring case), first come first kept, at most the 10 a note can hold (a tenth-and-over tag is dropped, which
  is rare). The merged text can't exceed a note's limit.

**Split.** While editing a note, **Split here** cuts it where the cursor is. The first part stays the note (same
place, identity and tags); a copy with the second part follows it, with the same origin, author, source and tags. The
two parts are sent as the writer sees them (it is their own edit of an editable note), so unsaved changes are kept;
both need words. Quotations and notes already in a draft can't be split, and splitting needs room under the 200-note
limit.

Both answer with all the idea's notes (the way reordering does), and neither is undoable: a merge deletes the
other notes. Merged-away notes held nothing in a draft (those can't be merged), so nothing else points at them.
