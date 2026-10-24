# Notes name their author (T42)

A note's origin line names the person (see "Who took a note is a chip" below). It is
a trusted space (the owner's call), and in a shared publication "added by hand" wouldn't say whose hand. `IdeaNote.authorName`
is joined from `users` when notes are read, so it is always the person's current name; it is null once their
account is gone (the note stays, `created_by` is set null) unless they chose to keep their name (see Account deletion semantics), and the label then says "a former member". For a note
the AI recorded, the author is the person whose message led to it. Notes written through the old single-text
route (`PATCH /ideas/:id` with `notes`, which no screen uses any more) have no author.
