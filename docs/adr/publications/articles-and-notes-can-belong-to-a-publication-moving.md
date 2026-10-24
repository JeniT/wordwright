# Articles and notes can belong to a publication; moving them

The publication's feeds will fill a list of articles that belongs to the publication as a whole (T37), worked through like an
idea's, and notes made there can later be gathered into an idea. So both kinds of thing need an owner that is either
an idea or the publication.

- **Ownership.** `idea_notes` already had `publication_id` (always) and `idea_id` (null for the publication's own). Articles
  (`idea_links`) now have the same: `publication_id` is always set and `idea_id` is null for the publication's own. This differs
  from "exactly one of the two" in the task text on purpose: always carrying the publication makes "everything in this
  publication" one query, cascades the publication's deletion directly, and matches notes. The code names an owner with the
  one `Owner` type (`db/owner.ts`: an idea id, or `{ publicationId }`), and every store method that used to take an idea id
  takes an `Owner`, so an idea's lists and the publication's are the same code with a different `WHERE`.
- **A rebuild, with foreign keys off.** SQLite can't make `idea_id` nullable in place. Rebuilding a table other tables
  refer to (notes and research pages point at articles) would, with foreign keys on, clear those references when
  the old table is dropped. The migration runner therefore takes `{ foreignKeysOff: true, run }` steps: foreign keys
  are off only for that step, the database is checked with `PRAGMA foreign_key_check` before it commits (a failure
  rolls back), and they are switched back on afterwards. Existing rows keep their ids, so nothing that refers to them
  breaks, and `publication_id` is filled in from the idea they were in.
- **Same rules, one set of routes.** The publication's notes use the idea notes' routes (`routes/notes.ts`, mounted twice;
  the publication has no drafts, so no "added" state), and the articles uses `IdeaLinkService` with a `ListScope`
  (`{publicationId, ideaId}`). Limits are the same numbers, worded for what is full ("A publication can have up to ..."). A
  publication's order is its own list: reordering it never touches an idea's.
- **What "move" keeps** (`MoveService`, all in one transaction, refusing anything outside the publication): _An article_
  moves as it is (read date, authors, title, why, origin, feed) and **its notes go with it**, to the end of the
  destination's notes. If the destination already has an item with the same address (compared as links are everywhere),
  the two become one: the one already there stays, counts as read if the moved one was, and the moved item's notes now
  point at it. _A note_ moves with its text, tags, author, origin and quotation mark, to the end of the destination's
  notes, in the order it was arranged (not the order it was picked). It keeps its source by getting a **copy** of the
  article at the destination (or using the item there with the same address), rather than taking the item away from
  other notes that came from it; copying is the safe choice since a source can have several notes, and only some may
  be moving. A note that had been put into a draft is no longer "added", because it hasn't been put into any of the
  new owner's drafts. A move that would pass the limits (links or notes) is refused whole, and moving to where
  something already is is refused ("already there") rather than silently doing nothing.
- **The pages are the idea's pages, parametrised by owner.** `lib/reading.ts` has `Owner` (`{publicationId, ideaId}`; null
  idea is the publication) and two composables: `useReadingList` (the list, from the idea's own query or the publication's) and
  `useReadingActions` (add, mark read, edit, remove, each keeping the server's answer in the right cache). `ReadingList`,
  `IdeaLinkItem`, `IdeaNotes` and the article's page each take an owner instead of an idea, and the web client's note
  functions take `ideaId: string | null`. The idea pages behave as before (their tests are unchanged); the publication's are
  `/p/:id/reading`, `/p/:id/reading/:item` and `/p/:id/notes`. Items from a feed (origin `feed`) are labelled "From a
  feed" without the highlighter, which stays for what the AI suggested.
- **The publication's own list of articles has no maximum, and forgets (#84).** It is a stream filled from the feeds, so a
  fixed limit would only make people clear space by hand. Instead an item **not marked Keep is dropped a month after it
  was put on the publication's list** (`PUBLICATION_READING_DAYS`, in `ReadingStore.dropOld`): quietly, with no notice when it
  happens, since a notice about the thing you didn't choose to keep is more noise. The age is since the item was put on
  _this_ list, so an item moved back from an idea starts afresh and unkept (`setOwner`), and keeping is the writer's
  tick and nothing else. Two guards: an item **notes were taken from is never dropped** (a note with no source is worse
  than a stale list; the page says so, and it is one clause in `dropOld` to remove), and an idea's articles and
  notes are never swept (only the publication's own list, `idea_id` null). There is no background job: the sweep runs
  whenever the publication's list is read, counted or checked for what is on it (so the Recent posts list is consistent
  with it), using the real clock, like the time items are stamped with. A dropped item's feed post is offered again,
  as any post not on a list is. The limit of 50 stays for an idea's list, which is part of the work on one idea.
- **Lists of articles hide read items by default (#85).** An item that has been read is finished with, and the list is for
  what is still to read. The page's `ReadingList` (idea's and publication's alike) shows only unread items, a **Show read
  items (N)** tick when there are any, and "N read items are hidden" (or "Everything on the list has been read" when
  nothing else is left, which is not the same as an empty list). An item ticked read _during this visit_ stays in
  view until the list is shown again or the tick is changed, so it doesn't disappear under the finger and can be
  unticked. The choice isn't saved: each visit starts tidy. This is purely what is shown: read items are still on the
  list (and, on the publication's, still subject to the month and Keep). The drafting side bar’s list of articles is a
  different list, for linking while writing, and is unchanged.
- **Moving articles on the page (#72).** Each articles has a **Move items** mode: ticks on the items and one
  picker, **Move to** (the publication's list, another idea, and, from the publication's own list only, **A new idea…**, which
  asks for the core idea in the writer's own words, nothing prefilled). It works with a keyboard and on a phone, and
  needs no drag and drop. A new idea is made first and then moved to; if the move fails the idea stays, empty, like
  any idea. The result is said in words ("Moved 2 items and 5 notes to “Rivers”.", plus how many items were joined to
  ones already there) with **Undo** (`lib/move.ts`, which #73 will reuse for notes). **Undo moves the same items back
  through the same operation**, which puts items and their notes back exactly when nothing was joined; when items
  were joined to ones already there, the moved item no longer exists on its own, so no Undo is offered and the message
  says why. Undo onto the publication's list also starts the item's month again and unticks Keep (see above), as any move
  onto it does. Every list showing the moved things is refreshed afterwards.
- **Gathering notes into an idea (#73).** The step where the writer decides what the idea is: the notes of the
  publication (or of an idea) are ticked, a **new idea is made from them** with its core idea typed by the writer (nothing
  suggested or prefilled; the AI is not involved), or they go to an existing idea or back to the publication. `MoveTo` and
  `useMoveDestination` are the one picker for articles and notes (the publication's own list as a choice only from
  inside an idea; a new idea for notes from anywhere, for items only from the publication's list). Before confirming,
  the page says in words how many notes will move and that **the pages they were taken from are copied** to the
  destination's articles (or the copy there is used) while the originals stay: copying rather than moving the
  source is what lets other notes from the same page stay behind without losing theirs. A tick offers **"also bring
  the other notes taken from those pages"**, off by default, so the choice is the writer's. "Select all the notes
  shown" respects the tag being shown, so a tag works as a way to pick a group. **Undo** moves the same notes back
  through the same operation: they return to the _end_ of where they were (not their old places), and the sources
  copied to the destination stay there, which the message says. Moves are in the `moves` log either way.
- **The log.** Every move writes a row per thing moved to `moves` (who, when, from and to, whether it merged, grouped
  by a batch id), inside the same transaction. Nothing reads it yet; it is what an Undo (T37c) will use, and it goes
  with the publication.
- **A new origin, `feed`,** is allowed for articles (with `source_id`, the feed it came from, set to null if
  the feed is removed) for the "Add article" page (T6c). Nothing creates one yet.
