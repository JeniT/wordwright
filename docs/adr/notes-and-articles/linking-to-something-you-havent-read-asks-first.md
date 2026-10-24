# Linking to something you haven't read asks first (T34)

_The **Insert link** button below is now **Add to draft**, as on notes (#331)._

The drafting drawer has a **Articles** section: each item with whether it is read, and an **Insert link** button
that puts a link to it in the line being written (inline, not a new paragraph) and saves the draft. If the item
isn't marked read, the writer is asked first, in a modal dialog with three ways out: **Cancel** (focused, so a stray
Enter does nothing; inserts nothing), **Read it now** and **Mark as read**.

- **Notes from reading don't ask.** Adding a note taken from an item (its words come with a link to the item) does
  not ask whether the item is read, even if it isn't ticked: the note was taken on the item's own page, which is
  the reading. Asking would be nagging. Only putting a bare link in from the Articles asks.
- **Read it now opens a new tab**, on the article's page (T32), and inserts nothing. The writer's draft is
  untouched, so nothing can be lost by leaving; a line in the drawer says where to pick up. Once they have read it
  (and taken notes, which marks it read) they come back and add it again. Navigating away in the same tab was
  rejected: it would mean saving a half-written draft just to ask a question.
- **Mark as read is the writer's say-so**, as for the tick on the idea page: they may have read it offline. It marks
  the item read (visible on the idea page) and then inserts.
- **It is friction, not enforcement.** A link typed or pasted straight into the draft isn't checked, and the app
  can't know whether anyone read anything. The aim is the moment of choice, in line with the owner's wish for
  "friction around users referencing sources in their draft that they haven't actually read" (#24). Revisit
  when the research assistant (#12) can suggest sources, where an unread AI-suggested item is the case that matters.
- **`ConfirmDialog` grew two options** (`alternateLabel`, `confirmTone`) rather than a second dialog component.
