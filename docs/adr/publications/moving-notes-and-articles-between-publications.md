# Moving notes and articles between publications (#193, part of #175)

`POST /api/publications/:id/move/{reading,notes}` takes `to: { ideaId, publicationId? }`. `:id` is where the things are now;
`publicationId` names another publication to move them into, and leaves it out for a move within one.

- **The access rule.** Any member of both publications may move notes and articles between them (no role is needed on
  either side, as within one publication). A destination the person doesn't belong to is refused with **404 "Not found"**,
  the same answer as for a publication that doesn't exist, so the move can't be used to find out whether one does. The
  destination idea must be one of that publication's. The member middleware on `:id` still protects the source.
- **What crosses.** Everything that "move" keeps within a publication (see [What "move" keeps](articles-and-notes-can-belong-to-a-publication-moving.md)), including the merge of
  items with the same address, the copy of a note's source and the destination's limits, all checked against the
  destination. The things change `publication_id` as well as `idea_id`, which is why every move updates both. An article
  loses its link to a feed (`source_id`) when it leaves the publication that owns the feed; it stays marked as having come
  from a feed. Tags, authors and quotation marks go with them. A note keeps its author, so a name can now appear to members
  of the other publication who weren't in the first; the mover is a member of both, and that is accepted rather than
  hiding the author of someone else's note.
- **Log.** `moves.to_publication_id` (null for a move within a publication) says where it went. `MoveStore.list` returns the
  moves out of a publication and into it, so each log shows both sides. The column cascades on delete, so deleting either
  publication removes the log rows (deleting an account removes its sole-member publications the same way).
- **Undo** is the same move the other way, asked of the publication the things now are in (`to.publicationId` is where they
  came from). It therefore works only while the person is a member of both. Joined items still can't be unpicked.
- **The picker** keeps the common move as quick as it was: it opens on the current publication's ideas and lists. "Another
  publication…" appears last in the same list, only to someone with more than one publication, and asks which, then where in
  it (its own list, one of its ideas, or "A new idea…", made in that publication).
