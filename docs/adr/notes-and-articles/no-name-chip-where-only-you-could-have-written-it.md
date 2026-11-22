# No name chip where only you could have written it (#445)

**Decision.** A name chip (`PersonChip`) names who recorded, wrote or edits something only where it could have been
someone else. Where the only possible author is the person looking, the chip goes, and so does the screen-reader
", recorded by" that goes with it. One function decides, `useAuthorship` in `apps/web/src/lib/authorship.ts`:

- **Notes, Refine messages, a draft's editor:** named when the publication has another member, or when the author is
  not the viewer (a former member's note or message, a draft from before its editor left).
- **Comments on a draft** (only the editor sees others' names): named as above, and also once the draft has been sent
  for review (a snapshot exists) or critiqued by the AI, since a reviewer or the AI could then have written any of them.
- **The AI's own marking** ("Your AI" on a critique point) is not a person's chip and is always shown.
- Until the publication has loaded, everyone is named, so a chip never appears a moment after the page does. Adding a
  member, sending a review or running a critique shows the chips on the next refetch, with no reload.

A typed note with nobody to name ("Added", by its only possible author) has no origin line at all (`showsOrigin` in
`lib/note-label.ts`). The Notes page already did this for a writer alone in the publication; the idea's landing page
and the notes beside the draft now do too.

**Why.** In a publication of one, a chip on every note, message and draft says the same name over and over and tells
the writer nothing. The earlier rule, "people are named everywhere, your own name too, never 'You'" ([a note's origin
line](a-notes-origin-line-and-who-it-is-credited-to.md), [Keep writing](../drafts-and-editing/keep-writing-one-box-for-the-drafts-worth-carrying.md)),
still holds wherever a name is shown: this decision only says when none is needed.

**Consequences and alternatives.** Refine messages now carry `authorId` (null for the AI or a gone account), so the page
can tell the viewer's own. The read-only notice in the editor ("Bob is this draft's editor") keeps its name: it only
shows to someone who is not the editor. Rejected: hiding the chip only on the viewer's own items in a shared
publication (then a chip would mean "not you", which is "You" by another route); counting only comments by reviewers
rather than whether one could exist (the chips would appear one by one as reviewers wrote, which reads as a change of
rule).
