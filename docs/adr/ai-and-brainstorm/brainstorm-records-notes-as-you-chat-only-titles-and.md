# Brainstorm records notes as you chat; only titles and new ideas are proposals (T30)

The brainstorm's job is now to add notes. The model's `add_note` tool adds a note to the idea at once (origin
`brainstorm`, attributed to the person whose message led to it) instead of proposing it, because the owner wants the
points made in conversation captured as they are made, in a trusted space, and a note is easy to delete. Reasoning,
limits and the injection argument are in [brainstorming.md](../../brainstorming.md). Consequences:

- `update_idea` now only changes the title; its notes field, the notes diff and `DiffView` (and `lib/diff.ts`, used
  only by it) are gone. Old threads that hold a notes proposal still show it as text, but accepting it no longer
  applies the notes.
- A `create_idea` proposal's starting notes are Markdown bullets, split into notes with origin `brainstorm`.
- `idea_message_notes` records each `add_note` call's outcome (added, duplicate, full) so the chat reads the same
  after a note is deleted and the model can be told what became of each call.
- The duplicate check is exact apart from case, spacing and closing punctuation. Near-duplicates in different words
  still get through; the prompt asks the model not to repeat points, and the notes are in its snapshot.
- The default prompt still describes a commissioning editor (T41/#43 changes that to a coach); only its closing
  paragraph, about recording notes, changed here.
