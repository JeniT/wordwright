# Actions and lists

Part of the [design system](README.md). Read this when building a list, a row's actions, a toolbar, a switch or checkbox, or a delete or removal.

## Actions and lists

Which control for which job, so every list (lists of articles, notes, feeds, drafts) looks and behaves alike. The articles and the notes are the reference implementations: `ReadingList.vue`, `IdeaLinkItem.vue`, `IdeaNotes.vue`,
`ListToolbar.vue`. Drafts and feeds use the same rail and icon buttons.

**Checkbox, switch, button or link**

| It...                                             | Use                                 | Examples                                 |
| ------------------------------------------------- | ----------------------------------- | ---------------------------------------- |
| selects an item for a bulk action                 | **checkbox**, in the left rail      | Select this item, Select all             |
| sets a state of an item that stays, saved at once | **switch** (`SwitchField`)          | Read, Keep                               |
| sets a view option for the list                   | **switch** or a select, on the left | Show read items                          |
| does something or opens something                 | **button**                          | Edit, Tag, Remove, Move to…, Add article |
| goes somewhere                                    | **link** (underlined)               | The title                                |
| changes which of a few views or forms is showing  | **tab** (`TabPanels`)               | Notes / Articles / Comments; Quick add   |

- **Tabs show, buttons act, segmented controls set.** If clicking does nothing but change what is displayed (nothing is
  saved or sent), it is a tab, not a button. If it chooses a value for a setting (System / Light / Dark), it is a
  `segmented` radio group. Don't use `aria-expanded` buttons to fake tabs.
- **Checkboxes only ever mean "select".** Never use one to trigger an action or to hold a state; never use a button for
  a yes/no state.
- A switch that repeats on every row of a list (Read, Keep, Resolved) is **compact** (`<SwitchField compact>`, the
  `switch-compact` class): a smaller track, knob and label, but the same 44px-high target (switches were not shrunk with the buttons) and the same visible label.
  So are the switches in a list toolbar or panel header (Show read items, Show resolved) and the option in the move
  dialog. A switch that sits alone on a page or in settings (Read on the item page) keeps the full size; the Tutorial switch in the menu is the small one.
- A switch's label is a fixed word ("Read", never "Unread"). On is shown by the knob's place and a tick, not by colour
  alone. It flips under the finger and goes back (`revert()`) if saving fails.
- Put explanations in `meta` text and only where they apply (an item that isn't kept says on which day it goes), not in
  the label.

**Icons or text**

- **Text** for an action that is the row's main verb, is unfamiliar, or has no standard icon (Move to…, Add
  item), and for everything in a list's toolbar. (The editors' formatting toolbar is the exception: icon-only, since its buttons are
  the familiar formatting symbols; see the editors' toolbar below.)
- **Icon only** (`btn btn-sm btn-icon btn-ghost` + `Icon`, no border) for actions that repeat on every row, are rare, and have a
  universal icon: Edit (pencil), Tag (label), Move, Remove (bin). The tag icon sits with the others, with or without tags; the tags themselves show under the item. Always an `aria-label` that names the item ("Remove A paper") and
  a tooltip (`v-tip`, below); a 32px target.
- **A single-use action on a page** may be icon-only too, when the icon is as universal and the action is quiet: the pencil
  beside an article's title (Edit title and authors). The same rules apply: an `aria-label` that says what it does,
  a tooltip, and a 32px target.
- **Tooltip on an icon-only button: `v-tip`, not `title`** (`lib/tip.ts`; on a `HoldButton`, its `tip` prop). The browser's `title`
  shows on hover only; `v-tip` also shows on keyboard focus, is appended to `<body>` so a menu or list can't clip it, stays while the
  pointer moves onto it, goes on Escape (focus stays), and is `aria-hidden`: the `aria-label` is the name, the tooltip a
  visible echo (or, for a hold-to-confirm button, the hint). A click or tap that focuses the button doesn't pop it up.
- **Icon with text** where the icon backs up the words, as in a destructive confirmation.
- At most one text button per row; the rest are icons.

**Emphasis: what draws the eye**

| Level          | Style                                            | For                                                           |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Primary        | `btn-primary`, one per screen area               | The page's main action (not in a list)                        |
| Section action | `btn-outline` (accent)                           | The thing the list is for: Add article                        |
| Row's verb     | `btn-neutral btn-sm`                             | Only where a row has one main verb a title link can't carry   |
| Row utilities  | `btn-ghost btn-sm btn-icon`                      | Edit; Remove (turns raspberry on hover or focus, not at rest) |
| Bulk actions   | `btn-neutral btn-sm`; Remove `btn-danger btn-sm` | Tag…, Move to…, Remove N (opens a dialog)                     |

Accent means "act here", so it appears at most once per visible group, never once per row. Repeated rows use neutral
and quiet buttons. A chip is a **fact**, not a control: use `chip-quiet` (flat) so that only what you can press has a
strong outline, and give an item one link (the title), with its host as plain text.

**Names of people.** A name is a `PersonChip` when it labels who recorded, wrote or edits something: a note's origin, a
comment, a Refine message, a draft's editor. It is always the name (your own too, never "You"), and "A former member"
when the account has gone and the name wasn't kept. A name inside a sentence ("asked by Ada", a callout, a handover
notice) is plain text, bold where it already is; a chip never sits inside running text.

**A rail that only drags.** A card that is a source to take from, such as a note or article beside the draft
(`DraftCard`), has the same rail and grip but no arrows and no click behaviour: dragging it onto the draft is the
only thing the rail does. Its grip shows from `lg` up (a phone cannot drag), and the icon button **Insert at cursor** at
the top of the rail (always shown) is the route for keyboards, touch and screen readers. The grip is centred vertically in the rail, but never nearer than 3.75rem to the top, so it never meets the button above it (a rail is at least 5rem tall from `lg` up, which is why a short card still has room for both).

**The left rail and reordering.** Every list row has a `list-rail`, a fixed-width top-aligned zone holding the row's
select checkbox. On a reorderable list the rail is **the handle**: the whole rail is the drag area (a `grab` cursor, so a
tall row has a big handle) and it **tints to `accent-wash` under the pointer**, which shows how far it reaches. A **six-dot
grip** (`list-rail-grip`) says so. It is a plain glyph, with no outline or fill, so it does not read as a button of its
own, and it is faint at rest (`line-strong`, 3:1) and darker on hover. It sits under the checkbox in its own space;
nothing is drawn behind a control. Reordering without dragging is always available: **clicking or tapping a rail** (or
focusing its hidden "Reorder" button) swaps the grip for small up/down arrows, on **all rows or none**, in the same slot
so nothing moves. Hover alone never shows them, so the grip is there when the pointer arrives. They go again when the
person clicks a rail away from the arrows (a click on a rail toggles them), clicks elsewhere, leaves the list, presses Escape or starts dragging, so the two never compete. For the
keyboard and screen readers the hidden button is there too (with it focused, the arrow keys move the row). The arrows
are 28px (above the 24px WCAG 2.2 minimum), an exception to the 32px rule for small buttons because there are two to a
row; their background is solid, a disabled one included (`btn-rail`). A list is
**either reorderable or paginated, never both** (you can't drag across pages). Long items clamp their titles to two
lines; the actions stay top-right and wrap below on a phone. Notes are the exception: show them in full.

**A note's row (`NoteCard`, `NoteText`).** Notes are shown in full, so a row can be tall: the list is `align-top`, which
puts the buttons at the top of the row, not centred. Where a note came from (“From” and the page's title as a link that opens in a new tab,
“From” and “conversation with your AI” (or “their AI”) as a link to the idea's Refine page, “Added”, then, on the line below, the name of the person who took it) is `meta` text in a column at the right, under
the row's buttons on the Note pages and alone on rows with no buttons (Recent notes, an article's notes); on a phone
it wraps under the note. It does not say the page's authors (the article's page does) or whether the note is a
quotation (its mark does). Tags stay under the note's text. A **quotation** is set apart by a `quote-mark`, a large
opening curly quote hanging before its first line. It is bare, with no box, so it is never mistaken for a control beside
the select box (hidden from screen readers: the text is in a `blockquote`). It is never a left border. The Note page's
own form is above the list and puts a new note first;
notes that arrive any other way go last.

**Posts from the feeds (`RecentPostRow`).** The Scan page's Recent posts and the Scan panel on a publication's landing page
show the same row, so a post looks and works the same wherever it turns up. The decision is two icon buttons, a **tick**
("Add article: {title}") and a **cross** ("Ignore: {title}"), each with a tooltip (`v-tip`); a decided post shows ✓ or ✗
and a single **undo** button ("Reconsider: {title}"). A decision made in either place updates both (they share query keys),
and is announced in a polite live region. The list has no bulk actions, so it has no select rail or `ListToolbar`; the
Scan page pages it with `usePaging`-style `PageNav` and the landing panel shows only the top five waiting.

**Tags: one at a time (`TagEditor`, `TagEntry`).** Under each note and each reading-list link, beside its tags, a small
label-icon button opens a text field: type a tag and press **Enter**, and it is saved at once and the field stays,
emptied and focused, for the next (a comma also separates tags). While it is open each tag shows a small **×**, and a
small **tick** closes it. The tags already used on the list are offered as the person types. This is on every note,
**quotations included**: tagging changes none of their words. Tags are never entered in an edit form.

**Bulk tagging (`BulkTagFields`), on notes and on lists of articles.** **Tag…** opens its form in the header (above). It uses
the same entry as a single note (type, Enter, again; the tags typed so far are chips that can be taken back out) and,
for each tag the selection already carries, a chip to press to take it off all of them (its title says "On 2 of the 3
selected"). The tick says what it will do ("Tag 3 notes"), the result is announced, and the selection is kept. The
change is one request and all or nothing, so a note that would exceed the limit refuses the whole thing and says which.

**The toolbar (`ListToolbar`).** On the **left**, after the select-all checkbox (which sits above the rail of row
checkboxes), a **filter button** with the funnel icon; on the **right**, once something is selected, the actions for the
selected items with a "3 selected" count. Until then the actions are not shown. The filters are folded away: the funnel
(`aria-expanded`, only offered when there is something to filter by) opens a row of them under the header (the
**Filter by tag** text box (a tag icon on its left; it suggests the tags on the list that are not chosen yet, and Return adds one and keeps the focus), whose chosen tags stay beside it as removable chips named "Stop filtering by {tag}" and
narrow the list to what has all of them, and, on a list of articles, the Show read items switch), which a close button folds again. While it is folded and a filter is
on, the funnel is marked and a small chip says what is filtering, so a filtered list never looks like the whole list.
**An action that needs input takes over the header**: Tag… and Move to… hide the other actions, and the rest of the
header holds their form, ending in a **tick** (confirm; named "Tag 3 notes", "Move 2 items") and a **cross** (cancel)
as icon buttons, to leave room. The wordy explanation goes behind an **info icon** (`InfoTip`: shown on hover, focus or
tap, and read as the icon's description) at the end of the form, or in very small text below it when there is one line.
**A list of one item has no header** (and no tick): each note, article and idea has its own **Move** icon (borderless, with Edit and Remove) that opens a dialog with the same form and moves that item alone. A list that can be filtered keeps its header for one row. $1 If the selection empties, the
form closes. Text on the actions that open the form, icons for the tick and the cross. Select all means the items
showing, after the filter, on this page; when there are more pages, "Select all N" offers the rest of the filtered
list. Selection clears when the filter or the page changes, so what an action touches is always what is on screen.

**Removing and deleting.** Two kinds, two controls (see [Confirming destructive actions](#confirming-destructive-actions)).
Removing one thing that has no consequences beyond itself (a note, a reading-list item, a feed, an invitation) takes a
press-and-hold (`HoldButton`). Removing several at once (the toolbar's Remove N or Delete N) asks in a dialog. A
hold-to-confirm button's tooltip says where to find the item again ("It stays in the feed it came from").

### Confirming destructive actions

One rule decides which control confirms, so the same kind of act always feels the same:

- **Deleting something from the server that takes other information with it** (an account, a publication, an idea, a
  draft; also clearing a whole conversation) asks in a **modal dialog** (`ConfirmDialog`). The dialog names what will
  go with it. Focus starts on Cancel. A whole-thing delete lives in a `DangerZone` at the bottom of its settings page,
  and its button opens the dialog. Never use the browser's `confirm()`.
- **Deleting or removing several at once** (the bulk Delete or Remove N in a list toolbar) also asks in a dialog that
  says how many, and is a text button, because more than one thing is at stake.
- **Removing a person from a publication, or leaving one, and changing someone's role** (making or removing an owner)
  affect what another person can do and where their drafts go, so each asks in a **dialog** that says what changes
  (the people list in publication settings; what each role can do is worded once, in `lib/publication-roles.ts`, and shown behind `Explain` beside the People and Invitations headings). They are text buttons, not icons, never underlined links.
- **Removing one thing with no consequences beyond it** (a note, a reading-list item, a feed, an invitation, a picture,
  an API key, a research run) takes a **press-and-hold** (`HoldButton`), with no dialog.
- **How they look:** a delete with a dialog is a **text button that says "Delete …"**; a hold-to-confirm is a **trash
  icon button** (`btn btn-sm btn-icon btn-ghost btn-ghost-danger` + `Icon name="remove"`) with an `aria-label` and a tooltip that starts
  "Press and hold, or tap twice, to …". The two are never mixed.
- **Holding and tapping:** a `HoldButton` is confirmed either by **holding** it for 1.5 seconds (a ring fills; one
  setting, `HOLD_MS` in `lib/hold-settings.ts`, so every button and the e2e tests agree) or by **tapping twice**: the
  first tap turns it into its verb with a question mark ("Delete?", `verb` prop), the second goes ahead. It goes back
  after a few seconds, when focus leaves it, or on Escape. An icon button grows to fit the word while armed. The same
  tap is what a screen reader's activation does.

**Pagination.** Notes show everything. Every other list pages client-side with `PageNav` above and below (the top one
announces the new range; the bottom one returns you to the top of the list), five at a time (`PAGE_SIZE` in
`lib/paging.ts`, `usePaging`). Filter first, then page; a new filter returns to page 1; removing the last item on a page
steps back one. No page controls when everything fits on one page.
