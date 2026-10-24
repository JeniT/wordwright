# Notes beside the draft, and the words keep their origin (T33)

While drafting, the idea's notes are listed beside the editor (a slide-over drawer on a phone). **Add to draft** puts
a note's words in the draft **after the paragraph the cursor is in** (at the end if the cursor was never in the text),
as its own paragraph(s), followed by a link to the reading-list item if the note came from one. The draft is
**saved first**, and only then is the note marked added (`added_at`) and hidden from the list, so a note never
vanishes unless its words are safely in the draft. "Show notes already added" lists them again, and **Put back**
clears `added_at` (it does not take the words out of the draft). A note is "added" once, for the whole idea, not per
draft: a note goes into one piece, and putting it back is how it goes into another.

- **Provenance ([responsible-ai.md](../../responsible-ai.md), principle 5).** Each insertion is a row in
  `draft_insertions` with exactly what was inserted, the note's **origin** (taken from the note by the server, never
  from the request), who wrote the note, who inserted it, and the reading-list item as it was then. It outlives the
  note, the item and the people (their names go null; the text and origin stay) and goes with the draft. The draft
  shows "Where some of the words came from" and, for each, **whether it is still as inserted**.
- **What "edited" means.** The record is not stored in the prose (that would mean marks inside the Markdown or a
  custom editor node). The page checks live whether the inserted words can still be found in the draft, ignoring
  case, spacing and Markdown punctuation, and says "Still as inserted" or "Edited or removed since". So an edit is
  never silently relabelled as the writer's own, but a light rewrite and a deletion look the same.
- **Layout.** The drafting page opts into a wider container (`meta.wide`); at 1024px and up the notes are a sticky
  column. Below that a **Notes** button slides the drawer in over the page, with a backdrop, a Close button and
  Escape; while shut it is invisible, so it is out of the tab order. Tried at 390px (screenshots): it reads well. Known
  limits: there is no focus trap (the page behind can still be reached by tabbing, though not by clicking), and the
  draft's own Save and Critique sit under the backdrop while it is open. Revisit if it feels fiddly in use.
- **Found on the way:** the drafting page had no level-one heading (the title is a field), which the first axe check
  of that page caught; it now has a visually hidden one.
