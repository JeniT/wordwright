# Design system: Ember

How Wordwright looks, why, and how to keep it that way. Read this before changing anything people see. The short
version is in [AGENTS.md](../AGENTS.md); the reasoning behind choosing this design, and the alternatives we dropped,
are in [decisions.md](decisions.md#visual-design-ember) and the archive in [design-concepts/](design-concepts/README.md).
How the words read (voice, buttons, errors, length) is in the [style guide](style-guide.md); this file decides where text goes.

**Ember** is a calm, clear tool for writing: warm stone neutrals, one burnt-orange accent, IBM Plex Sans everywhere,
a side menu, 1px outlines on everything you can press or type in, and a designed dark mode.

## What it looks like

The running app (these are screenshots of the real thing, not mock-ups):

|                                                         |                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| ![Home, light](screenshots/app-home.png)                | ![Idea page, light](screenshots/app-idea.png)                       |
| ![Drafting page, dark](screenshots/app-editor-dark.png) | ![Idea page on a phone, dark](screenshots/app-idea-dark-mobile.png) |

## The principles

1. **Calm, not busy.** Few colours, generous space, no shadows, gradients or decoration. Content leads.
2. **Obvious what you can do.** Every button and field has a fill or a visible 1px border; links are always
   underlined; icon buttons keep a faint outline. Colour is never the only signal (errors say so in words, with an icon).
3. **One sans, everywhere.** The editor, the AI's replies and the chat use the same family as the buttons, only
   larger and looser. No serif, no monospace for metadata.
4. **The highlighter is rationed.** The pale `mark` colour means "the AI suggested this". Use it for nothing else. If
   it is everywhere it marks nothing, and the writer's own words must stay visually theirs.
5. **Roles, not colours.** Markup says what something _is_ (`bg-surface`, `text-ink-soft`, `btn btn-primary`), never
   what it looks like (`bg-white`, `text-stone-600`). That is what makes palettes and designs swappable.
6. **Other people's pictures are guests.** Logos and icons from other websites never appear bare (below).
7. **Accessible by construction.** The palette's contrast is tested; focus, target size, text size and motion are
   handled once in the theme, not per screen.

## Where it lives

| File                                                    | Job                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/theme/palette-ember.css`                  | **The only place a colour is chosen**: light, dark, and lettered-tile tints, each named by role.                                                                                                  |
| `apps/web/src/theme/theme.css`                          | The design built on a palette: fonts, the Tailwind token map, shared base rules (focus, selection, reduced motion), and every component utility (`btn`, `field`, `panel`, `chip`, `callout` ...). |
| `apps/web/src/style.css`                                | Imports the two above, plus the editor and Markdown typography.                                                                                                                                   |
| `apps/web/src/theme/palette.test.ts`                    | Fails if any colour pair on screen drops below WCAG 2.2 AA, in light or dark.                                                                                                                     |
| `apps/web/src/lib/useTheme.ts`                          | The System/Light/Dark choice (Light and Dark saved in `localStorage` and applied as `data-theme` on `<html>`; System removes both and follows the device, the default).                           |
| `apps/web/src/assets/fonts/`                            | Self-hosted IBM Plex Sans (OFL). No third-party font requests.                                                                                                                                    |
| `apps/web/src/App.vue`                                  | The shell: side menu (a Menu button on phones), skip link, landmarks.                                                                                                                             |
| `apps/web/src/lib/nav.ts`, `components/SideMenu.vue`    | What the side menu lists for where you are (see _Navigation_).                                                                                                                                    |
| `components/StepHeading.vue`, `components/NextStep.vue` | A numbered step's title, and its \"Next: …\" suggestion.                                                                                                                                          |

Tailwind's default colour palette is **switched off** (`--color-*: initial` in `theme.css`). A class like `bg-red-50`
or `text-stone-600` does nothing, so off-palette colour can't creep in unnoticed. Only the roles below exist.

## Colour roles

Use the role that matches the _meaning_. Values below are Ember light; dark has its own set in the same file.

| Role (Tailwind class)                                  | Light     | Use                                                                                                                                                                   |
| ------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paper` (`bg-paper`)                                   | `#f8f5f1` | The page                                                                                                                                                              |
| `surface` (`bg-surface`)                               | `#ffffff` | Raised areas: panels, cards, inputs, the side menu                                                                                                                    |
| `sunken` (`bg-sunken`)                                 | `#eee8e0` | Recessed areas: code, disabled fields, quiet hover, secondary panels                                                                                                  |
| `hover-wash` (`bg-hover-wash`)                         | `#eee8e0` | The fill under the pointer on a quiet control (an icon button). A soft step off its surface in both modes; `sunken` is near-black in dark, so it is not used for this |
| `ink` (`text-ink`)                                     | `#2a2420` | Body text                                                                                                                                                             |
| `ink-soft` (`text-ink-soft`)                           | `#594f47` | Secondary text: hints, dates, counts, explanations. **Not** for disabled-looking text that must be read                                                               |
| `line` (`border-line`, `divide-line`)                  | `#e0d8ce` | Decorative dividers and quiet panel edges                                                                                                                             |
| `line-strong` (`border-line-strong`)                   | `#85786b` | Borders you need to see: fields, neutral buttons (3:1)                                                                                                                |
| `accent` (`bg-accent`, `text-accent`, `border-accent`) | `#b0440c` | The single brand colour: primary buttons, links, current item, focus ring                                                                                             |
| `accent-strong`                                        | `#8a3207` | Hover and pressed                                                                                                                                                     |
| `on-accent` (`text-on-accent`)                         | `#ffffff` | Text or icons placed on `accent`                                                                                                                                      |
| `accent-wash` (`bg-accent-wash`)                       | `#fbe6d6` | Tinted background: notices, counts, the current menu item, hovered cards                                                                                              |
| `mark` (`bg-mark`)                                     | `#cfe6f2` | The highlighter. **AI-suggested things only**                                                                                                                         |
| `danger`, `on-danger`, `danger-wash`                   | raspberry | Errors and destructive actions. Raspberry, not red, so it never looks like the orange accent                                                                          |
| `ok`, `ok-wash`                                        | green     | Success                                                                                                                                                               |
| `focus`                                                | `#b0440c` | Keyboard focus ring (set globally; you rarely touch it)                                                                                                               |
| `tint-1`..`tint-6` (`tint-1` class)                    | muted     | Lettered tiles when there is no picture                                                                                                                               |

Rules:

- **Never write a colour value** (hex, `rgb()`, a Tailwind palette name) in a component. If you need a new role,
  add it to the palette file (light, dark, and the system-dark copy), map it in `theme.css`, and add its pairs to
  `palette.test.ts`.
- **Don't use `accent` for decoration.** It means "you can act here" or "this is where you are". `accent-wash` is the
  background for information that isn't an action.
- **Text on a coloured background uses the matching `on-` role or `ink`**, and the pair must be in the test.
- **Danger is for errors and irreversible actions only.** Pair it with words and, where space allows, an icon.

## Type

IBM Plex Sans in four files (400, 400 italic, 500, 600). Sizes, set once:

| Use                                   | Class / rule                             | Notes                                                          |
| ------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Page title                            | `h1`                                     | 28–38px, 600, balanced                                         |
| Section heading                       | `h2`                                     | 20px, 600                                                      |
| Subsection / card heading             | `h3`                                     | 17px, 600                                                      |
| Body, labels, buttons                 | default (16px) / `text-sm` for secondary | Never below 14px for anything read, 12px only for tabular tags |
| Secondary line (dates, hosts, counts) | `meta`                                   | 14px, `ink-soft`, tabular figures                              |
| The editor and the AI's replies       | `.prose-editor`, `.markdown`             | 18px, line-height 1.75, same family                            |

Figures are tabular by default so counts and dates align. Don't add other typefaces. Headings use `font-display`
(currently the same family), so a different display face is one line in `theme.css`.

## Shape, space and depth

- **Corners:** `rounded-ctl` (6px) for buttons and fields, `rounded-panel` (10px) for panels, cards and dialogs,
  `rounded-full` for chips and avatars only. Don't use bare `rounded` (it is not defined in this system).
- **Edges:** 1px. A quiet `line` for containers, `line-strong` for controls, `accent` for the current/hovered thing.
- **No shadows or gradients.** Separation comes from tone (`paper`/`surface`/`sunken`) and a 1px edge.
- **Spacing:** Tailwind's scale; page sections `mb-8`–`mb-12`, panel padding `p-4`/`p-5`/`p-6`. Read neighbouring
  screens first and match them.

## Components (utilities in `theme.css`)

Use these instead of long utility strings. If you find yourself repeating a recipe, add a component here.

| Class                                                             | Use                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `btn` + `btn-primary`                                             | The one main action on a screen                                                                                                                                                                                                                                                                             |
| `btn btn-outline`                                                 | A secondary action that matters (e.g. Brainstorm, Open)                                                                                                                                                                                                                                                     |
| `btn btn-neutral`                                                 | Everything else: Cancel, Add link, Previous/Next                                                                                                                                                                                                                                                            |
| `btn btn-danger` / `btn btn-danger-solid`                         | Delete: outline to start, solid only on the final confirmation                                                                                                                                                                                                                                              |
| `btn btn-quiet`                                                   | Low-emphasis text actions (the editor toolbar) and reorder grips. Keeps a faint outline                                                                                                                                                                                                                     |
| `btn-sm`                                                          | Add to any `btn` in dense lists (36px high; normal is 44px)                                                                                                                                                                                                                                                 |
| `btn-ghost`                                                       | An icon-only button with no border or fill at rest, the icon in `ink-soft`; `hover-wash` fill on hover and focus (`line` on a recessed strip); `accent-wash` and an accent icon when it is the current page (`aria-current`). Add `btn-ghost-danger` for Remove (raspberry on hover, focus and while armed) |
| `btn-icon`                                                        | With `btn-sm btn-ghost`: a square button holding only an `Icon`, named by an `aria-label` and a tooltip                                                                                                                                                                                                     |
| `AiButton` (with a `btn` variant)                                 | Every button that makes an AI request, or leads straight to one: see _AI buttons_ below                                                                                                                                                                                                                     |
| `switch` (+ `SwitchField`)                                        | The on/off state of one thing, saved when flipped (Read, Keep, Show read). Never a checkbox: see _Actions and lists_                                                                                                                                                                                        |
| `list-rail`                                                       | The left zone of a list row: select checkbox; for reorderable lists it is the drag handle (`list-rail-grab`, with a `list-rail-grip` glyph) and holds the arrows                                                                                                                                            |
| `field`, `field-compact`                                          | Text inputs, selects, textareas. `aria-invalid="true"` gives the error style. Use `TextField`/`TextAreaField` for labelled ones                                                                                                                                                                             |
| `panel`, `panel-sunken`                                           | A grouped container. Put `divide-y divide-line` on a list inside it                                                                                                                                                                                                                                         |
| `card`                                                            | A whole-area link or button that lifts on hover (e.g. a publication). Add layout classes yourself                                                                                                                                                                                                           |
| `chip` + `chip-accent` / `chip-ai` / `chip-ok` / `chip-quiet`     | Small labels. `chip-ai` is the highlighter: AI-suggested only. `chip-quiet` is a flat fact (where an item came from)                                                                                                                                                                                        |
| `callout` + `callout-danger` / `callout-ok`                       | A notice with words in it. Use `role="alert"` for errors, `role="status"` for confirmations                                                                                                                                                                                                                 |
| `link`                                                            | A link inside UI chrome. In running text, plain anchors are underlined by default styles                                                                                                                                                                                                                    |
| `tab` (+ `TabPanels`)                                             | Tabs for areas that share one place (beside the draft: Notes, Reading list, Comments). Selected is bold with a heavy underline and `aria-selected`; arrow keys move; panels stay mounted. The tab names its panel, so a heading inside repeats nothing visibly: it is `sr-only`                             |
| `meta`, `h1`, `h2`, `h3`                                          | Type, above                                                                                                                                                                                                                                                                                                 |
| `source-mark`, `source-letter` (+ `tint-N`, `mark-sm`..`mark-xl`) | The plate for other sites' pictures. Use through `PublicationImage` rather than by hand                                                                                                                                                                                                                     |

### AI buttons

Every press of a button that sends something to the writer's AI spends tokens on their own key, so the button says so
before it is pressed and while it works (`docs/responsible-ai.md`: the writer is always told what an AI call is).

- **One component, `AiButton`**, takes the place of the `<button>`. Give it the `btn` variant the action already
  has (Critique is `btn-outline`, Send `btn-primary`): the AI mark does not change the hierarchy, and there is no
  separate "AI colour". It carries the **AI icon** (`Icon name="ai"`, sparkles) beside the visible label.
- **Busy:** pass `busy` and `busy-text`. The icon is replaced by a spinner (`Icon name="working"`) of the same size,
  the label does not change (so the button keeps its width), the button is disabled with `aria-busy="true"`, and
  `busy-text` is read out through a polite live region the component owns (don't add a second status for the
  same wait). Under reduced motion the spinner stays still: the busy button and its words are the signal.
- **Meaning:** the icon is never alone. The words "Uses your Anthropic key, so it costs tokens" are the button's
  tooltip and its accessible description, and the account page (AI assistant) explains the mark once.
- **Which buttons:** the ones whose press makes an LLM request (Critique, Brainstorm's Start/Send/Try again, Research,
  Research) and the ones that hand straight over to one (the Send and Start on an idea's landing page,
  which open the conversation where the reply is written). Not the buttons around them: Save, Add note, Accept or
  Dismiss on a suggestion, Stop. The API-key check on saving the key is not shown as an AI action (the owner's call).
- **Adding one:** tag the API function `@ai` in `lib/api.ts`, use `AiButton` where it is called, and list it in
  `lib/ai-buttons.test.ts`, which fails when an AI call is used by a component without the pattern.

### The description editor

`DescriptionEditor` is a small rich-text field for short, formatted text (today the publication description), so people don't have to know
Markdown: a toolbar of five worded buttons (Bold, Italic, Bulleted list, Numbered list, Link; `aria-pressed` shows what is on) above a
`field`-styled text box that looks like the text it makes (it uses the `markdown` reading styles), with the app's own focus outline. The link
address is a small form that takes focus and gives it back. It reads and writes Markdown. Use it for any other short formatted text; the draft
editor (`RichEditor`) is the long-form one.

### Comment marks in the editor

A comment (the AI's or a person's) that is about a paragraph is shown beside it, in the editor, without touching the writer's words:
the paragraph gets a 3px edge, in the highlighter colour for the AI's comments and a plain line colour for a person's (the highlighter is only for what the AI suggested; the text itself is not tinted, so it stays visibly theirs)
and a small numbered button (`btn btn-sm btn-icon comment-mark`, named "Comment 2") at the end of its last line.
The number is the comment's place in the list. The one being looked at has the accent edge and an outline, and `aria-current`.
Pressing a mark opens its comment in the **Comments** tab beside the draft (the drawer, on a phone), and pressing a
comment shows its paragraph in the draft (a drawer gets out of the way first): there is no separate "show" button. The draft's editor gets a **Resolved** switch on each comment (a state of the comment, so a switch and not a button): a resolved comment is hidden, with its mark, unless the editor turns on **Show resolved**. Showing one scrolls the draft so the paragraph is at the top of the window and the comments so the comment is at the top of their area, side by side (`lib/scroll.ts`; smooth unless the person prefers less motion). To make that possible for the last paragraph and comment, the page and the comments area get spare room below their end while comments are showing. The
Marks are ProseMirror decorations (`lib/comment-marks.ts`): they are drawn, never saved, and never in
`getMarkdown()`. They sit at the end of the line rather than in the margin so they cost no width on a phone. A comment
whose paragraph has been rewritten loses its mark and moves to "This passage has changed" in the panel.

### The Rephrase window and its options

Rephrase (the button beside Save and Critique, enabled only while words inside one paragraph are selected, with the
reason beside it when not) opens a **modal dialog** on top of the draft. It is built with `lib/modal.ts` (`useModal`,
shared with `ConfirmDialog`): focus goes in (to the Aim, since the wording is filled in), Tab stays inside, Escape and
Cancel close it, and focus returns to the Rephrase button. It is `max-w-2xl`, scrolls inside itself (`max-h-[90vh]`) and
fits a 390px phone. Order, top to bottom: the **current wording** (editable), the **Aim** ("What should it do?"), the
**Generate options** `AiButton` with "Round n of N" beside it and, in words, why it is disabled when it is, the options,
then **Cancel** and **Use this**. Nothing leaves the window until Use this.

**Rephrase title** (#163) sits beside the title field (the title wraps above it on a phone) and opens the same window, headed
"Rephrase the title", with no selection step. While the draft is too short it is disabled and the line under the title says
"Write more first. Options for a title come from what you've written."

- **Short wording** (a title, or up to 25 words) shows its options as a **list**: each row is the option and a
  `btn btn-sm btn-outline` **Replace wording** button, which puts it in the wording field. **Longer wording** shows a
  **carousel** (`RephraseOptions`): one option at a time, **Previous** and **Next** buttons (disabled at the ends), "Option
  2 of 4" announced politely, Left and Right arrow keys, and its Replace wording button inside the slide.
- The buttons repeat on every row but carry text, not an icon: "Replace wording" is the whole point of the row, and an
  icon alone would not say whether it replaces, copies or uses. Each has an `aria-label` that names its option.
- There is no copy or post button on an option, and no highlighter on them: they are choices, not suggestions already
  made. The highlighter stays for what the AI has put in the writer's text.

## Actions and lists

Which control for which job, so every list (reading lists, notes, feeds, drafts) looks and behaves alike. The reading
list and the notes are the reference implementations: `ReadingList.vue`, `IdeaLinkItem.vue`, `IdeaNotes.vue`,
`ListToolbar.vue`. Drafts and feeds use the same rail and icon buttons.

**Checkbox, switch, button or link**

| It...                                             | Use                                 | Examples                                     |
| ------------------------------------------------- | ----------------------------------- | -------------------------------------------- |
| selects an item for a bulk action                 | **checkbox**, in the left rail      | Select this link, Select all                 |
| sets a state of an item that stays, saved at once | **switch** (`SwitchField`)          | Read, Keep                                   |
| sets a view option for the list                   | **switch** or a select, on the left | Show read items                              |
| does something or opens something                 | **button**                          | Take notes, Edit, Remove, Move to…, Add link |
| goes somewhere                                    | **link** (underlined)               | The title                                    |

- **Checkboxes only ever mean "select".** Never use one to trigger an action or to hold a state; never use a button for
  a yes/no state.
- A switch's label is a fixed word ("Read", never "Unread"). On is shown by the knob's place and a tick, not by colour
  alone. It flips under the finger and goes back (`revert()`) if saving fails.
- Put explanations in `meta` text and only where they apply (an item that isn't kept says on which day it goes), not in
  the label.

**Icons or text**

- **Text** for an action that is the row's main verb, is unfamiliar, or has no standard icon (Take notes, Move to…, Add
  link), and for everything in the toolbar.
- **Icon only** (`btn btn-sm btn-icon btn-ghost` + `Icon`, no border) for actions that repeat on every row, are rare, and have a
  universal icon: Edit (pencil), Remove (bin). Always an `aria-label` that names the item ("Remove link to A paper") and
  a tooltip (`v-tip`, below); a 36px target.
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
| Section action | `btn-outline` (accent)                           | The thing the list is for: Add link                           |
| Row's verb     | `btn-neutral btn-sm`                             | Take notes                                                    |
| Row utilities  | `btn-ghost btn-sm btn-icon`                      | Edit; Remove (turns raspberry on hover or focus, not at rest) |
| Bulk actions   | `btn-neutral btn-sm`; Remove `btn-danger btn-sm` | Tag…, Move to…, Remove N (opens a dialog)                     |

Accent means "act here", so it appears at most once per visible group, never once per row. Repeated rows use neutral
and quiet buttons. A chip is a **fact**, not a control: use `chip-quiet` (flat) so that only what you can press has a
strong outline, and give an item one link (the title), with its host as plain text.

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
are 28px (above the 24px WCAG 2.2 minimum), an exception to the 36px rule for small buttons because there are two to a
row; their background is solid, a disabled one included (`btn-rail`). A list is
**either reorderable or paginated, never both** (you can't drag across pages). Long items clamp their titles to two
lines; the actions stay top-right and wrap below on a phone. Notes are the exception: show them in full.

**Posts from the feeds (`RecentPostRow`).** The Search page's Recent posts and the Search panel on a publication's landing page
show the same row, so a post looks and works the same wherever it turns up. The decision is two icon buttons, a **tick**
("Add to the reading list: {title}") and a **cross** ("Ignore: {title}"), each with a tooltip (`v-tip`); a decided post shows ✓ or ✗
and a single **undo** button ("Reconsider: {title}"). A decision made in either place updates both (they share query keys),
and is announced in a polite live region. The list has no bulk actions, so it has no select rail or `ListToolbar`; the
Search page pages it with `usePaging`-style `PageNav` and the landing panel shows only the top five waiting.

**Tags: one at a time (`TagEditor`, `TagEntry`).** Under each note and each reading-list link, beside its tags, a small
label-icon button opens a text field: type a tag and press **Enter**, and it is saved at once and the field stays,
emptied and focused, for the next (a comma also separates tags). While it is open each tag shows a small **×**, and a
small **tick** closes it. The tags already used on the list are offered as the person types. This is on every note,
**quotations included**: tagging changes none of their words. Tags are never entered in an edit form.

**Bulk tagging (`BulkTagFields`), on notes and on reading lists.** **Tag…** opens its form in the header (above). It uses
the same entry as a single note (type, Enter, again; the tags typed so far are chips that can be taken back out) and,
for each tag the selection already carries, a chip to press to take it off all of them (its title says "On 2 of the 3
selected"). The tick says what it will do ("Tag 3 notes"), the result is announced, and the selection is kept. The
change is one request and all or nothing, so a note that would exceed the limit refuses the whole thing and says which.

**The toolbar (`ListToolbar`).** On the **left**, after the select-all checkbox (which sits above the rail of row
checkboxes), a **filter button** with the funnel icon; on the **right**, once something is selected, the actions for the
selected items with a "3 selected" count. Until then the actions are not shown. The filters are folded away: the funnel
(`aria-expanded`, only offered when there is something to filter by) opens a row of them under the header (tag buttons
and, on a reading list, the Show read items switch), which a close button folds again. While it is folded and a filter is
on, the funnel is marked and a small chip says what is filtering, so a filtered list never looks like the whole list.
**An action that needs input takes over the header**: Tag… and Move to… hide the other actions, and the rest of the
header holds their form, ending in a **tick** (confirm; named "Tag 3 notes", "Move 2 items") and a **cross** (cancel)
as icon buttons, to leave room. The wordy explanation goes behind an **info icon** (`InfoTip`: shown on hover, focus or
tap, and read as the icon's description) at the end of the form, or in very small text below it when there is one line.
Merge acts at once, and Delete or Remove N asks in its dialog, so neither opens a form. If the selection empties, the
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
  (the people list in publication settings; what each role can do is worded once, in `lib/publication-roles.ts`). They are text buttons, not icons.
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

## The mark

The Wordwright **mark** (see `CONTEXT.md`) is a flame whose tip is a split pen nib, one colour: the `accent` role. It names the product and
nothing else, so it appears in only four places and never as decoration:

| Where                                       | Size       | How                                                                          |
| ------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| Side-menu header, reviewer header           | 36px tall  | Beside the word "Wordwright" (the link's name); replaces the old "W" tile    |
| Signed-out pages (sign in, register, reset) | 48px tall  | Centred above the word "Wordwright"                                          |
| Browser tab                                 | 16 to 48px | `public/favicon.svg` (follows the system's light or dark), `.ico` and `.png` |
| Home-screen icon                            | 180px      | `public/apple-touch-icon.png`: the mark on the `paper` colour                |

It never appears in empty states, loaders, buttons or as a watermark, never in place of a publication's picture or site icon, and not in
emails (they use no images). In the app it is the `BrandMark` component, an inline SVG in `text-accent`, because people can pin Light or Dark
whatever their system says and an `<img>` of the file could not follow. The favicon is the one place that follows the system instead, since
browsers offer nothing else. The source drawing is `docs/design-concepts/icon/icon.svg`; `export/` holds the tidied mark, the favicon set and
PNG tiles (192 and 512, unused until Wordwright is installable). If the drawing changes, update `BrandMark.vue` and the files in `public/` from it.

## Pictures and logos from other sites

We can't control a favicon: it may be transparent, dark on transparent, full-bleed colour, white-backed, tiny or
the wrong shape. So it is never shown bare. `PublicationImage` with `kind="source"` puts it on a fixed-size **plate**: a
square, 1px `line-strong` frame, 4px corners, white background in both light and dark (so dark marks stay legible),
`object-fit: contain` (never cropped), `alt=""` (the name is always beside it). When there is no usable picture a
**lettered tile** in one of six palette tints stands in. The plate is square and barely rounded on purpose: the app's
own rounded corners stop at its edge and never wrap someone else's artwork. The plate's white is the only
hard-coded colour in the system, deliberately.

The person's own publication picture (`kind="publication"`, the default) is cropped to fill the same frame, since the writer
chose it. When a publication has no picture but has a website whose icon we could fetch, `PublicationImage` is given
`site-icon-url` and draws that icon as a guest (on the plate, as above); the person's picture always wins. Pictures are still fetched once and served from our own origin ([decisions.md](decisions.md)); this is only
how they are framed. Identity-provider buttons ("Continue with Google") should use the same plate for their logo.

## Dark mode

Dark follows the person's system setting unless they choose. The **Appearance** control (`ThemeChoice`, a `segmented`
radio group: System / Light / Dark, at the foot of the side menu and in the reviewer bar) lets them pin Light or Dark,
and System hands control back to the device (`useTheme`). Dark is **not** an inversion: accents are lighter and more saturated (`#f08a4b`), buttons carry dark
text, washes are deep tints of the accent, and the highlighter becomes a deep blue-grey. All of it lives in the
palette file, so components need no `dark:` variants. If you find yourself writing `dark:`, a role is missing.

## Navigation: the menu follows you

How people are led through the app. The side menu **follows you**: what it lists depends on where you are, with a way
back up and the name of the thing you are in. (We drew three approaches, a steady menu with steps on the page and a
menu-as-a-map tree among them; this one won. See [decisions.md](decisions.md#navigation-the-menu-follows-you).)

| Level       | You are choosing…                | The menu lists                                                                                                                  | Settings (a gear button)                                           |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Home        | which **publication** to work on | Publications                                                                                                                    | Beside your name in the menu foot                                  |
| Publication | what to gather, then which idea  | **01 Search** (feeds, recent posts), **02 Read** (the reading list), **03 Notes**, **04 Ideas**                                 | Beside the publication's name, in the menu and on its landing page |
| Idea        | how to develop it                | **01 Research** (the idea's own reading list, and the AI research tool), **02 Notes**, **03 Refine** (brainstorm), **04 Draft** | Beside the idea's name, in the menu and on its landing page        |

The principles (they are the point of the pattern; keep them when you add a page):

1. **Numbers orient; they never gate.** Every step is a link, always enabled. Nothing is locked, greyed out or
   "completed for you". The numbers are decoration (`aria-hidden`); an ordered list conveys the order.
2. **State is a count, not progress**: "2 sources", "1 draft" under a step, where we already know it. No progress bars.
3. **See where you are in two places**: the current step is marked in the menu (`aria-current`, a filled badge and an
   edge) and in the page title, with the publication or idea name above it (`StepHeading`).
4. **A suggestion, not a push.** A step ends with `NextStep` ("Next: 03 Refine →"), an outline button, never the
   primary one. A step where the next move is a choice (Ideas), or the last (Draft), has none.
5. **Visiting spends nothing.** A step that calls the AI waits for a button (Refine's **Start brainstorming**,
   Research's **Start research**); arriving by the menu must never cost the writer money.
6. **Always a way up**: "← All publications", "← {publication}".
7. **Settings sit apart from the steps**, at their own level, with no step current. They are reached by one **icon-only
   gear button** (`SettingsButton`: a link, 44px square, named "Account settings", "Publication settings" or "Idea
   settings", with the same words as its tooltip) placed beside the name of the thing it configures, never a text link
   in the list of steps. It is the same gear at every level; its name and its place say which. It is marked current
   (`aria-current`, `accent-wash`) on its own page. The **menu foot** holds your name (plain text) with the account
   gear, and a **Sign out** button (an action, so a button, not a link). Appearance is a setting, so it lives on the
   account page.
8. **A level has a landing page** (a publication's, at `/p/:publicationId`; an idea's, at `/p/:publicationId/ideas/:id`) that is none of the numbered steps: a summary of
   each step with its quick action (the newest feed posts; the reading list and a form to add to it; the latest notes and a form to add one; the ideas). Nothing in the menu is current there.
   The publication's description comes first.
   Panels reuse the step pages' components, and, like the steps, visiting spends nothing. The page is titled with the
   publication's name (`h1`) beside its picture and website link, then the publication's description (Markdown, clamped to about eight lines with a
   **Show more…** / **Show less** button that appears only when text is hidden; an invitation to add one when empty); each section is a `LandingSection`: the step's number
   (from the same list as the menu) and title, with a light rule above to set it apart, and its "See all" and quick
   actions on the right of the heading. An idea's page is titled with the idea's name (the publication above it, as a way
   up) and summarises Research (the unread reading list while there is any; otherwise the box to ask the AI, which waits for
   its button), Notes (shown by the same `NoteCard` as the Notes step), Refine (the AI's latest message and a box to
   reply, or the invitation to start) and Draft (its drafts, and **Start a draft**).
9. **The name leads back up to the landing page**: the publication's or idea's name in the menu, and the small name above
   a step's title, are links to it (current on the landing page itself, where the title is not a link).

|                                                           |                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| ![Idea, Research step](screenshots/nav-idea-research.png) | ![Publication, Ideas step](screenshots/nav-publication-ideas.png) |
| ![Phone, menu open](screenshots/nav-phone-menu-open.png)  |                                                                   |

**How a page joins the menu.** Give its route `meta: { level: 'publication' | 'idea', step: '<key>' }` in `router.ts`
(`step` is a key from `PUBLICATION_STEPS`/`IDEA_STEPS` in `lib/nav.ts`; leave it off for settings). Sub-pages of a step
(the research tool, reading one source) use their step's key, so it stays current. The title is
`<StepHeading>Name</StepHeading>`; end the page with `<NextStep :to label>why this is next</NextStep>`. A page that is
read beside another window (reading a source, taking notes) adds `compact: true`, which folds the menu behind the
**Menu** button at every width so two windows fit side by side. The drafting page keeps the menu on a laptop and finds
its idea from the draft (`ideaFromDraft: true`).

Adding a step (rare): add it to the step list in `lib/nav.ts`, give its route the meta, and update the table above
and in README. Renumbering is automatic.

**Publishing is not a step.** It is done to one draft, so it sits at the bottom of the Draft page (`DraftPublish`): **Copy**
(rich text, with plain text beside it, so it keeps its headings and links when pasted into an editor or an email) and
**Copy as Markdown** (title first), with a text box to select from if the clipboard is out of reach. Publishing straight to
a newsletter, and help drafting social threads, would add their own buttons there later; neither is built. The old
`/ideas/:id/publish` address redirects to the idea's drafts, and the drafts list is the last step, with no next step.

## Layout

A **reviewer-only account** (someone asked to read a draft, see decisions.md "Reviewers") has no side menu: a single top
bar with the name, the Appearance choice, a **Start writing** button (the way to upgrade to a full account) and
Sign out, over one column. It has no settings gear: a reviewer-only account has no account page. Its pages (`ReviewsView`, `ReviewView`) use the
same cards, callouts and chips as everywhere else.

- **Side menu** (16rem) on desktop; on phones, and at every width on `compact` pages, a top bar with a **Menu** button
  (`aria-expanded`) that folds the menu away, shows where you are while closed, and closes on navigation. Signed-out
  pages have a centred name only.
- **Content width:** `max-w-3xl` for reading and forms; routes with `meta.wide` get `max-w-6xl` (the drafting page
  with its notes column). Check every screen at 390px; nothing may scroll sideways.
- **Landmarks:** the side menu is the page `header`; the page content is `main`; a skip link comes first. Don't add a
  second `aside` for the menu: tests and screen-reader users find the drafting notes by that landmark.

## Accessibility checklist (all built in; don't undo)

- Contrast: enforced by `palette.test.ts` (text 4.5:1, borders and focus 3:1) in light and dark.
- **Focus:** one 3px outline in `focus`, from the base layer. Don't remove outlines or restyle focus per control.
- **Targets:** buttons 44px (`btn-sm` and icon buttons 36px; the settings gear is 44px, since it sits alone), checkboxes 20px, switches 44px wide and 44px high with their label.
- **Text:** 16px minimum in fields (stops iOS zoom), links underlined, no text in images.
- **Motion:** reduced motion is honoured globally; don't add animation that carries meaning.
- **Not by colour alone:** errors have words and (where it fits) an icon; AI-suggested things have a label, not just
  the highlighter; the current menu item has `aria-current` and an edge, not only a tint.
- Every async action keeps its loading, empty and error states; error text says what to do next.
- **Saving a form:** show what happened with `SaveStatus` (`:mutation`, or an array of every mutation the form can
  run). It says nothing while idle, "Saved" once it worked (or the words you give it, or its slot for a message that
  says more), and the reason in a `role="alert"` if it failed. Put it beside the button (`class="basis-full"` in a
  wrapping row puts it underneath), or above the button for a longer message. A field that starts from a saved
  value uses `useSavedValue`, so a refresh never wipes what the person is typing.
- **Loading a list or section:** wrap it in `QueryState` (`:query`, `what="the notes"`). It shows a quiet "Loading…",
  or "We couldn't load the notes." with a **Try again** button, and the content only once it has arrived; the empty
  state ("No notes yet.") belongs inside it. Pass `loading` to say what is loading ("Reading your feeds…") and
  `detail` when the server's reason helps ("Too many requests…"). A page about one idea or publication uses `IdeaGate` or
  `PublicationGate`, which also handle "not found".
- The e2e suite runs axe over the main pages. A new screen needs to be in it.

## Applying the design to a change

1. Find the nearest existing screen and copy its structure. Reuse components before writing utilities.
2. Build with roles and component classes. No colour values, no `dark:`, no shadows, no bare `rounded`.
3. Headings `h1` (once per page, `StepHeading` on a step) / `h2` / `h3` (no skipped levels); the primary action is the only `btn-primary` in its area.
   A new page in the app declares its level and step (see _Navigation_) and ends with `NextStep` where one fits.
4. Add the highlighter only if the AI produced it. Add a text label next to it.
5. External pictures go through `PublicationImage kind="source"`.
6. Look at it in light **and dark** and at 390px. Run `pnpm check` (palette test), `pnpm test:e2e` (axe).
7. If you needed a new colour, component or rule, add it to the palette/theme and **update this file**.

## Changing the design

- **Swap the palette:** copy `palette-ember.css`, change the values (keep every name), point the import in
  `style.css` at it, and run `pnpm --filter @wordwright/web test`. `palette.test.ts` reads `palette-ember.css`; change its
  path when you rename. The `docs/design-concepts/` folder shows teal and purple variants built the same way.
- **Change the look** (corners, fonts, weights): edit `theme.css`. Components pick it up everywhere.
- **Change the shell or the menu's shape:** `App.vue` (the frame) and `components/SideMenu.vue` / `lib/nav.ts` (what it lists).
- **Don't** fix a screen by adding colours or one-off classes to it. If a screen needs something the system lacks, the
  system is what changes.
