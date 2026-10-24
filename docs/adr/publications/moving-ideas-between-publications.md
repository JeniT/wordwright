# Moving ideas between publications (#194, part of #175)

On a publication's Ideas page, tick ideas and choose **Move to…** (only for someone with another publication). Picking the
publication asks the server what would happen (`POST /api/publications/:id/move/ideas/preview`, `{ ids, to: { publicationId } }`)
and shows "1 idea, 2 drafts, 5 notes, 3 links will move to “Name”", names the people who will lose sight of them, or says what
is in the way. Confirming does the move (`POST …/move/ideas`) and opens the idea in its new publication (the list, for several).

- **Whole, and as one change.** An idea goes with its drafts, notes, links and brainstorm thread, all or nothing. Only
  `ideas`, `drafts`, `idea_notes` and `idea_links` carry `publication_id`; everything else (comments, snapshots, reviews, critique
  rounds, insertions, handovers, research, messages) hangs off an idea or draft id and follows without being touched, so
  critique limits are not reset and comments keep their authors' names. A single draft can't move without its idea. An article stops coming from a feed (`source_id` cleared), because feeds belong to the publication they were added to. Ideas are
  listed by last change, so a moved idea counts as just changed and is first in the destination's list. The moves log
  (`moves`) records notes and items, not ideas: the idea's own id is the same before and after.
- **Who may.** The destination must be a publication the person is a **member** of (anything else is 404 "Not found", as for
  notes and items). An idea with **no drafts** can be moved by any member of both; one **with drafts** only by an **owner of
  the source** (403 otherwise).
- **Editors.** Every draft's editor must belong to the destination, otherwise the whole move is refused (409): "Ask <name> to
  join <publication> first, or hand the draft over." The preview reports the same words as `problem` instead of failing.
  An open handover offer or ask involving someone who isn't a member of the destination is closed with the move.
- **Who loses sight of it.** Members of the source who aren't members of the destination can no longer open the idea or its
  drafts. They are not added to the destination and not made reviewers; the confirmation names them. Their past comments stay
  with their names. Reviews opened for a person (a snapshot of the draft) are unaffected, since they point at the draft by id,
  and an open review does not block a move.
- **No trail.** There are no redirects and no history. The old address says an idea "may have been deleted or moved to another
  publication". Reviewer-only accounts have no publications, so the route answers them 404 like every publication route.
