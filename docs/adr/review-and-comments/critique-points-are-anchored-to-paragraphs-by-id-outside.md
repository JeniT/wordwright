# Critique points are anchored to paragraphs by id, outside the prose (T9a, #90; part of #14)

**Decision.** Critique used to come back as one block of text. It is now a ranked list of **points**, each about one
block of the draft or about the piece as a whole, plus a one-line summary and a `ready` verdict. Tiptap's Comments
extension is a paid cloud feature (and would limit how many documents we can have), and we do not need real-time
collaboration on drafts, so comments are our own: the server numbers the draft's blocks and the model points at them.

- **Blocks.** `splitBlocks` (`@wordwright/core`) splits the saved Markdown into headings, paragraphs, quotes, code fences
  and top-level list items, numbered `b1`, `b2`, ... Each has a hash of its words (case, spacing and punctuation
  ignored). The draft goes to the model as `[b3] text`.
- **No anchors in the Markdown.** Putting ids in the writer's text would reach Copy Markdown and be published, the
  same reason insertion provenance is kept outside the prose (see [Notes beside the draft](../notes-and-articles/notes-beside-the-draft-and-the-words-keep-their.md)). The ids are only positions in the split of
  the text that was critiqued; they mean nothing for a later version of the draft. T9b stores the hash and a quoted
  snippet with each point so it can be found again after edits, or shown as "this passage has changed".
- **The model's reply is untrusted.** It asks for JSON (via `complete()`, no tool call, so it works with every
  adapter). `parseCritique` reads it, drops points about blocks that were never sent, keeps at most five
  (`MAX_CRITIQUE_POINTS`, in the order given: most important first), and refuses a reply that is not a critique
  (the writer sees "something we could not read, try again"). Points carry no replacement text by design: there is no
  field for it. The prompt also forbids it, and an eval checks that.
- **Kept, and found again (T9b, #91).** Each critique is saved as a round (`critique_rounds`, `critique_points`,
  both `ON DELETE CASCADE` from the draft, so they go with it and with its publication). Only the latest round is shown
  and nothing counts rounds yet (T9c). A point stores its block id, the block's hash and the start of its text.
  The editor places each point again whenever the text changes (`locateBlock`, `@wordwright/core`): first a paragraph with
  the same words (nearest to where it was, if two are alike), then one that still starts with the same words, and
  otherwise none, so a point is never put on the wrong paragraph; it shows under "This passage has changed" instead. (Superseded by #335: see _Text changed_ below.)
  The hash ignores case, spacing, punctuation, list markers and link addresses, so a paragraph reads the same from
  the Markdown (what the model was shown) as from the editor (what is placed). Two paragraphs with the same words
  and a heavy rewrite are the known blind spots. Marks are decorations, so they never reach the saved text. A point
  can be marked **Read** with a switch when the writer has dealt with it (#110, which replaced a "Set aside" button
  and list): it stays where it is, quieter, its mark leaves the text, and the tab counts only the unread. It is the
  writer's call whether a point matters, so nothing is deleted. The stored field and endpoint are still called
  `dismissed`; only the wording and the interface changed. A Read comment is still placed in the text (just not
  marked), so pressing it still shows its paragraph. If saving the switch fails it goes back, and says so.
- **Rationed (T9c, #92).** A draft gets **3** critiques by default, which each writer can change from 1 to 5 in their
  account settings (`user_settings`, one row per person; no row means the default, so changing the default reaches
  everyone who has not chosen). The count is of the draft's saved rounds, shown before the button is pressed ("2 of
  3 looks used"); when it is used up the button is disabled and the page says kindly that the next step is to
  publish. The server enforces it (409, before anything is sent to the AI), and a failed critique is not saved, so it
  costs no look. Editing a draft does not reset the count. The count belongs to the draft, but the limit is the
  **requester's own**: in a shared publication, rounds made by anyone count against the draft, and each person is held to
  the limit they chose for themselves. Whether a heavy rewrite should earn more looks is for the owner to decide (#103); until then a writer who starts over adds a new draft.
- **Comments beside the draft (#106).** After trying critique in use, the owner moved the comments from under the
  draft to the side area, which is now three tabs: **Notes, Articles, Comments** (`TabPanels`, WAI-ARIA tabs;
  still the one `complementary` landmark, and on a phone the same slide-in drawer). A comment about a paragraph is
  itself the button that shows that paragraph in the draft; a mark in the text opens its comment. Asking for a
  critique switches to Comments (and, on a phone, opens the drawer when the answer or the error arrives), so the
  result is never hidden. All three panels stay mounted and only hidden, so a half-written note survives a tab
  change. The tab shows how many comments are open. Showing a comment (#109) scrolls explicitly rather than leaving it to the editor's own
  cursor scrolling, which only brings the cursor into view (at the bottom, if it was below): the paragraph goes to the
  top of the window and the comment to the top of the comments area. A page cannot scroll past its end, so while
  comments are showing the draft gets spare room below it (60vh), and the comments area gets the same below its last
  comment when there are several. Streaming the critique was dropped: a spinner is enough.
- **Rung 3, as before.** What leaves the system is the draft's title and body, to the writer's own provider with
  their own key. Rounds are capped per draft (below).
- **Evals.** The two critique cases that targeted #45 ("short and ranked", "says when ready") are now `current`; all
  critique cases also check the reply is the JSON the app reads. They were written without running them against a
  real model: run `pnpm eval` and say if a rubric needs tuning.

**Revisit if** models often send JSON we cannot read (move to a forced tool call, which needs a tool choice on the
`chat()` port), or points need to be about a sentence rather than a paragraph.

**Applied to notes, drafts and feeds (#89).** The notes list (idea and publication) has the same toolbar: select-all and the
tag filter on the left; Merge, Move to… and Delete on the right (Delete is a held bulk action). The "Merge notes" and
"Move notes" modes are gone: every note has a select checkbox in its rail, above its grip. Merge is disabled, with a
reason in its tooltip, while a quotation is selected (it must stay as written); the merged note goes where the first
selected note is, in list order, not click order. "Also bring the other notes from those pages" in the move form is a
switch, since it sets an option rather than selecting an item. Notes are never paginated. Edit and Delete are icon
buttons (Delete quiet until hovered, and held). Drafts only needed the rail (they have no Edit or Remove). A feed's
Remove is an icon button and a plain click, not a hold, because the feed is easy to add again.

**The grip button became a dotted rail (#104).** A small grip button in the rail looked wrong, so the rail itself is dotted
(`list-rail-grab`) and is the drag area and the thing to click or tap for the arrows. A hidden "Reorder" button stays in
it for the keyboard and screen readers. Clicking the rail's checkbox or the arrows does not toggle the arrows.

**Rail polish (#112).** Dots are inset and tiled with `space` so no dot is ever cut by an edge. The arrows are always laid out
and invisible until the pointer is over the list or focus is in it, then shown for every row (or none), and hidden while
dragging; laying them out always means rows are taller than their content (about 90px at least), a deliberate trade for
nothing jumping when the pointer arrives. They are 28px, solid when disabled, and centred in the row under the checkbox.

**Reorderable rail: a grip, not dots (#114).** The dotted texture behind the checkbox and arrows looked odd, and a texture is not a convention. The rail is now plain, with a six-dot grip (the usual sign of "draggable") under the checkbox. The grip is a bare glyph so it doesn't look like a button; the _whole rail_ tints on hover and has the grab cursor, which says the handle is the rail, not the glyph. The arrows no longer show on hover (that hid the grip just when the pointer arrived): a click or tap on a rail swaps grip for arrows on every row, in the same slot, until the person clicks elsewhere, presses Escape or drags.

**Bulk tagging (#139, under #87).** Tags are set on several notes in one request (`POST …/notes/tags` with `ids`, `add`, `remove`), not a loop of per-note saves, so the change is atomic: if any note would end with more than `MAX_NOTE_TAGS` tags, none is changed and the reply names the note. Tags are compared ignoring case; adds keep a note's existing order and go last; removes win over nothing (a tag asked to be removed and added in one request ends up added). Quotations can be tagged, since tagging does not touch their words. The panel (`BulkTagPanel`) is shared with the articles, which gets tags and the same action next (#140, #141). A new tag filter clears the selection, as every filter does.

**Tags on articles (#140, under #87).** Articles carry flat tags like notes do (same rules: tidied, case-insensitive, at most `MAX_NOTE_TAGS`, kept in the order given), in their own table (`idea_link_tags`, deleted with the item). They are set as a whole (`PUT …/links/:id/tags` on an idea, `…/reading/:id/tags` on the publication), edited in the item's edit form, and the list has the same tag filter as notes (a new filter clears the selection). A moved item keeps its tags. When a moved item joins one already at the destination (same address), its tags are added to that item's, each once ignoring case, up to the limit (extras beyond it are dropped rather than refusing the move). The copy of a source item that a moved _note_ takes along does not get the tags: tags describe how a writer groups things in one place, not the source itself.

**Bulk tagging articles (#141, under #87).** Lists of articles get the same **Tag…** action as notes, through the shared `BulkTagPanel` and one atomic request (`POST …/reading/tags` on the publication, `…/links/tags` on an idea: `ids`, `add`, `remove`). The add/remove rules and the refusal when an item would pass `MAX_NOTE_TAGS` live in one place (`services/tag-change.ts`) for both notes and items, so they cannot drift apart. With #139, #140 and this, #87 is complete.

**Tags one at a time (#143).** The comma-separated Tags field is gone from the note and link edit forms. Tags are entered under the item, one per Enter (`TagEntry`), saved as soon as each is added, with the whole set sent each time (so the API is unchanged and a failed save puts the tag back off). That also lets quotations be tagged one by one, which the edit form could not offer because quotations cannot be edited. Bulk tagging uses the same entry so single and bulk behave alike. Suggestions are a native `<datalist>` (no extra buttons). A save chain per item keeps rapid Enters in order.

**Filters behind a funnel (#144).** The list header was crowded, so filters (tag buttons, Show read items) fold behind a funnel button and open a row under the header. The funnel is only there when there is something to filter by, and while a filter is on it is marked and a chip names it, so people are never left wondering why items are missing. The open/closed state is not remembered across visits. Select all was already limited to what is showing after the filter (notes and lists of articles); tests now say so for both.

**Bulk actions in the header (#145).** Actions that do something to a selection are hidden until something is selected. An action that needs input takes over the header instead of opening a panel under it (Tag… and Move to…): the rest of the header is its form, ending in a tick and a cross as icon buttons, with the explanation behind an info icon (`InfoTip`) so the form stays on one line where it can. Merge and Delete/Remove N stay one-click (Delete asks in a dialog). The header's form closes if the selection empties. The old `BulkTagPanel` (a panel under the header, with switches) became `BulkTagFields`, with press-to-remove chips; `MoveTo` is now an inline row. Tooltips are CSS (hover or focus within), not a JS popover.
