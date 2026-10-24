# Checkboxes select, switches set a state, and lists share a rail and a toolbar (#88)

The lists of articles had checkboxes meaning three different things (Read, Keep, and choose-to-move), four text buttons
per row and a mode switch ("Move items") that changed what a row looked like. The owner's rules, now in
[design](../../design/actions-and-lists.md#actions-and-lists):

- **A checkbox only selects an item** (for a bulk action). A **switch** sets a state of one item or of the view
  (Read, Keep, Show read items). Selecting is always on: there is no "Move items" mode. Move to… and Remove are bulk
  actions in a toolbar, filters on its left and actions on its right, with a select-all box above the row checkboxes.
- **A left rail** on each row holds the select checkbox (and, on reorderable lists, the grip). It is top-aligned, so
  long items work, and the whole rail is the drag handle. Arrow buttons for reordering appear when a grip is pressed
  (to be judged in use; the alternative was to show them always); they stay until it is pressed again, because
  closing them on blur moves rows under a pointer that is about to click.
- **Remove is held, not undoable** (the item still shows where it came from, a feed or research, so it can be found
  again). Single and bulk Remove use `HoldButton`. The row's Remove is a quiet icon button that turns raspberry on
  hover, because five raspberry buttons in a list pull the eye to the one thing we want people to do least.
- **Keep is on for a link the writer adds by hand** (they can switch it off); only what a feed brings drops off after
  a month, counted from `addedAt` (when it was put on the list, not when it was written). A migration brings existing
  hand-added links into line. An unkept item says on which day it will go.
- **Pagination:** notes show everything; other lists page client-side, five at a time (`PAGE_SIZE`), above and below.
  A list is reorderable or paginated, not both.
- Not done yet (follow-ups): applying the same rail, toolbar and icon buttons to notes, drafts and feeds; tags on
  reading-list items with a bulk Tag… action (#87, needs a schema change).
