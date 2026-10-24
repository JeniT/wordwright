# Design concepts

> **Navigation** (how to lead people through Home, Profile and Idea) has its own set of mock-ups: see [navigation/](navigation/README.md).

> **Outcome: Ember (the burnt-orange Slate in round 3) was chosen and is implemented.** See
> [../design/README.md](../design/README.md) for the design system and [../adr/visual-design-and-navigation/visual-design-ember.md](../adr/visual-design-and-navigation/visual-design-ember.md) for
> why, with every option compared. This folder is the **archive** of what was considered: example screens,
> screenshots and the scripts that made them (`tools/`). It is not imported by the app, and its tokens
> (`tools/tokens.mjs`) are a snapshot; the live palette is `apps/web/src/theme/palette-ember.css`.

**Round 1** (Press, Ledger, Lamplight) is first; **[round 2](#round-2-slate-and-evening)** (Slate, Evening) responds to feedback on round 1, and **[round 3](#round-3-slate-in-teal-ember-and-aubergine)** (Slate in three new colours, each with a dark mode) is at the end.

Three directions for the look of the service, each a working Tailwind v4 theme plus six example screens (profiles,
inspiration, an idea with its reading list, the editor, sign-in, and a style kit). They are prototypes of the _system_,
not of the final page layouts.

## What they have in common

The brief was clean and simple, no skeuomorphism or effects, accessible, easy with Tailwind, and a good answer to
logos and icons from other sites. All three share these decisions (see [`base.css`](base.css)):

- **Semantic tokens, one swap.** Markup uses roles (`bg-paper`, `text-ink-soft`, `border-line`, `bg-accent`,
  `text-on-accent`, plus `btn btn-primary`, `field`, `panel`, `chip`, `callout`), never `stone-200` or `red-700`. All
  three pages' bodies are **identical markup**; only the app shell differs. So a concept is adopted by replacing the
  `@theme` block in `apps/web/src/style.css` (the existing `ink`, `paper`, `accent`, `btn-*` names carry over) and
  migrating the remaining `stone-*`/`red-*` classes to tokens. `@theme inline` points utilities at live CSS variables,
  which is also what makes dark mode a variable swap.
- **Accessibility is checked, not asserted.** Every text and control pair in [`tools/tokens.mjs`](tools/tokens.mjs)
  meets WCAG 2.2 AA (`node tools/contrast.mjs`; the style kit prints the ratios), and axe finds nothing on any page,
  including dark (`node tools/axe.mjs`). Also built in: a visible 3px focus ring that survives forced-colours mode,
  focus never hidden under a header (`scroll-padding`), 44px controls (36px small), 16px form text, links always
  underlined, error and AI-suggestion states carried by text and an icon as well as colour, a skip link, and
  `prefers-reduced-motion`.
- **Self-hosted open fonts** (SIL OFL, in [`fonts/`](fonts/), about 780 KB for all three concepts; a concept would ship
  roughly a third). No Google Fonts request, which matters for a service that otherwise avoids telling third parties
  who is reading.
- **Other sites' logos never appear bare** (the screens use invented publications). A source's picture sits on a
  fixed-size **plate**: contained not cropped, with its own light background so dark-on-transparent marks stay legible in
  dark mode and white-backed icons don't float, framed to match the theme, and marked `alt=""` because the name is always
  beside it. Awkward pictures (very wide wordmarks, no picture) fall back to a **lettered tile** in a palette-matched
  tint. The style kit shows all seven cases. The plate is the only place a colour is hard-coded (`#fff`), deliberately.
  This complements the existing rule that pictures are fetched once and served from our own origin.
- **Avoiding the generic look:** no Inter/system-sans-plus-purple-gradient, no glass, shadows or glows, no
  everything-in-rounded-cards. Each concept has a specific point of view, a typeface pairing chosen for the job
  (reading), and a way of separating content (rules, hard borders, tone) that isn't "white card on grey".

Screens are 1280px wide; the mobile shots (`*-mobile.png`) are 390px.

---

## 1. Press

_A printed page._ Warm paper, ink-blue, a text serif that does the talking. Hairline rules and a double masthead rule
replace boxes. A highlighter yellow marks anything the AI suggested, the way a reader marks a page.

|                                                   |                                                      |
| ------------------------------------------------- | ---------------------------------------------------- |
| ![Profiles](screenshots/press/home.png)           | ![Idea and reading list](screenshots/press/idea.png) |
| ![Inspiration](screenshots/press/inspiration.png) | ![Editor](screenshots/press/editor.png)              |

**Type:** Newsreader (variable, optical sizes) for headings and all text; Hanken Grotesk only for labels, buttons and
nav. **Colour:** paper `#f6f1e6`, ink `#1c1915`, accent ink-blue `#1d3f6b`, highlighter `#f3d96b`. **Shape:** 2px
corners, 1px rules. **Source logos:** a hairline-bordered square plate, like a plate in a book.

**Why it meets the brief.** It is the most literal reading of "calm and book-like" in the repo's own priorities, and
the one that treats the product as what it is: a place for writing. Because the reading face is already the
interface face, the editor and the rest of the app feel like one continuous surface. Contrast is high (ink 15.5:1,
accent 9.4:1). Rules and type do the structuring, so there is nothing decorative to maintain. Trade-off: the serif
interface is the most distinctive and least conventional-looking for a "tool", and small serif UI text needs care
(buttons and labels use the sans for that reason).

## 2. Ledger

_A well-kept record._ Cool chalk, black ink, one ultramarine, square corners and firm 1.5px rules. A grotesk
interface; a mono for facts (hosts, dates, counts, labels); a serif only on the writing surface. A persistent sidebar
and numbered sections make a multi-profile, multi-idea app easy to navigate. Lime highlighter for AI suggestions.

|                                                    |                                                       |
| -------------------------------------------------- | ----------------------------------------------------- |
| ![Profiles](screenshots/ledger/home.png)           | ![Idea and reading list](screenshots/ledger/idea.png) |
| ![Inspiration](screenshots/ledger/inspiration.png) | ![Editor](screenshots/ledger/editor.png)              |

**Type:** IBM Plex Sans, Plex Mono and Plex Serif (one family designed to work together). **Colour:** chalk
`#f2f3ef`, ink `#12151c`, ultramarine `#2a3bd1`, lime `#d6f75a`. **Shape:** square, hard rules, hover states that
invert. **Source logos:** a square plate with the same hard rule as every control, so third-party marks look
_catalogued_, not pasted in.

**Why it meets the brief.** It is the clearest and most scannable of the three, which suits a tool with many
profiles, feeds and reading-list items, and the most forgiving of busy third-party content: hard borders contain
whatever colours other sites bring. The focus ring (ink plus lime halo) is the strongest of the set. It is the
easiest to extend to dense pages later (tables, settings). Trade-off: it is the coolest, least "literary" option;
the serif appears only where people write, which is a deliberate contrast but a less cohesive one.

## 3. Lamplight

_Made for long sessions, day or night._ A deep green-black dark theme with cream text and a single amber accent, plus
a quiet sage light theme with a forest accent. It follows `prefers-color-scheme` and has a toggle. Soft shapes, and
surfaces separated by tone instead of outline.

|                                                                     |                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| ![Profiles, light](screenshots/lamplight/home.png)                  | ![Profiles, dark](screenshots/lamplight/home-dark.png)       |
| ![Idea and reading list, dark](screenshots/lamplight/idea-dark.png) | ![Editor, dark](screenshots/lamplight/editor-dark.png)       |
| ![Inspiration, light](screenshots/lamplight/inspiration.png)        | ![Phone, dark](screenshots/lamplight/editor-mobile-dark.png) |

**Type:** Literata (made for long on-screen reading) for headings and text; Atkinson Hyperlegible Next (made for low
vision) for the interface. **Colour (dark):** paper `#121a17`, cream `#eee9dc`, amber `#e8b04b`; (light): paper
`#f1f3ec`, forest `#1f5a4a`. **Shape:** 10px controls, 16px panels, pill chips. **Source logos:** a round plate that
stays light in dark mode, so no icon disappears.

**Why it meets the brief.** Of the three, it takes accessibility furthest: both typefaces were designed for legibility,
there is a real dark mode (also a requirement most users have for evening writing), and the third-party logo plate is
what makes dark mode safe with unknown icons. It is the warmest and friendliest, and the least like other tools.
Trade-offs: two themes means two sets of tokens to keep passing contrast (they do, and `contrast.mjs` guards it), and
tonal separation relies on the surface and paper tokens staying distinct.

---

## Choosing

|                      | Press               | Ledger                | Lamplight                 |
| -------------------- | ------------------- | --------------------- | ------------------------- |
| Feels like           | A book              | A working record      | A reading lamp            |
| Strongest at         | Writing and reading | Scanning, dense lists | Long sessions; low vision |
| Navigation           | Top bar             | Sidebar               | Top bar, centred column   |
| Dark mode            | Not designed (add)  | Not designed (add)    | Built in                  |
| Handles odd logos by | Hairline plate      | Hard-ruled plate      | Round light plate         |
| Distance from today  | Closest             | Furthest              | Medium                    |

A reasonable route is to pick one and borrow across: Ledger's sidebar for navigation, Lamplight's dark mode, Press's
highlighter for AI marks.

## Looking at them and rebuilding

```bash
# serve the concepts with the app's own Tailwind (http://localhost:5199)
pnpm --filter @lfwa/web exec vite --config ../../docs/design-concepts/tools/vite.config.mjs

node docs/design-concepts/tools/build.mjs     # regenerate tokens.css and the pages after editing tools/*.mjs
node docs/design-concepts/tools/contrast.mjs  # WCAG contrast of every token pair
node docs/design-concepts/tools/axe.mjs       # axe over every page (server running)
node docs/design-concepts/tools/shoot.mjs     # regenerate screenshots/ (server running)
```

Edit colours in `tools/tokens.mjs`, components in each `theme.css`, shared page markup in `tools/build.mjs`. The
fonts' licence note is in [`fonts/README.txt`](fonts/README.txt). The "G" on the sign-in screen is a neutral
stand-in for an identity provider's logo, which would get the same plate treatment.

---

## Round 2: Slate and Evening

Feedback on round 1: sans serif everywhere (editor and chat included); Ledger closest, but too harsh, with the mono
metadata and over-used lime disliked and the side menu liked; Lamplight next, with its curved corners liked but square
logos sitting badly inside a round plate; Press calming but its interactive elements not clear enough. Both new
concepts act on all of that, and add a **brainstorm chat** screen (`brainstorm.html`).

What changed in both (shared by `base.css` and the two `theme.css` files):

- **Sans only.** The editor text, the AI's replies and the chat are set in the interface sans, a little larger and looser
  (18px, line-height 1.75) with a 40em measure for sustained reading. There is no serif or mono anywhere.
- **Metadata** (hosts, dates, counts, labels) is plain sans in the secondary text colour. Labels are sentence case, not
  mono capitals.
- **Source logos use Press's plate:** a square, hairline-framed, barely rounded (4px) tile, in every theme, so the
  app's own corner radius never wraps another site's artwork. The lettered fallback has the same shape.
- **Interactive elements are defined without being loud.** Each button has a fill or a 1px border; icon buttons and
  low-emphasis actions keep a faint outline (`btn-quiet`) rather than floating as bare glyphs; fields have a visible
  border that darkens on hover and turns accent on focus; links are always underlined; cards and rows react on
  hover; checkboxes are 20px. Borders are 1px (Ledger used 1.5px black).
- **The highlighter is rationed.** It marks only what the AI suggested ("Suggested in brainstorming", highlighted text).
  Counts such as "12 new" use a quiet accent tint (`chip-accent`) and the active menu item uses the accent wash.
- **Chat messages say who is speaking in words** ("Assistant · asks a question", "You", "Assistant · suggests a note,
  in your words") as well as by position and tint, and the AI's proposed note has Add / Edit first / Not this.

### 4. Slate

_Ledger with the edges taken off._ The same left menu and IBM Plex Sans, but slate ink `#1f2733` instead of black, a
cool light grey page, 1px rules, 6px controls and 10px panels, and a single cobalt `#3045c0`. Pale lime `#e2f0a0`
appears only as the AI marker.

|                                                   |                                                      |
| ------------------------------------------------- | ---------------------------------------------------- |
| ![Profiles](screenshots/slate/home.png)           | ![Idea and reading list](screenshots/slate/idea.png) |
| ![Editor](screenshots/slate/editor.png)           | ![Brainstorm chat](screenshots/slate/brainstorm.png) |
| ![Inspiration](screenshots/slate/inspiration.png) | ![Phone](screenshots/slate/brainstorm-mobile.png)    |

**Why it meets the brief.** It keeps what worked in Ledger (the side menu with icons and a clear current page, strong
scannability, the Plex sans that reads well at editor size) and removes what was harsh: black rules, mono labels and
saturated lime. It is the most conventional of the five, which is a strength for a tool with many dense screens, and
the easiest to extend. Interactive elements are clear without being heavy: the whole palette is blue-grey so the
single cobalt reads as "this is something you can press".

### 5. Evening

_Lamplight, in sans, with a menu._ Dark-first (deep green-black, cream, amber) with a sage light theme (forest
accent), following `prefers-color-scheme` and a toggle. Atkinson Hyperlegible Next for everything. Curved corners (10px
controls, 16px panels, pill chips) are kept, but panels now have a quiet outline as well as a tonal fill, and every
control has an edge. The menu is a floating tonal panel on the left.

|                                                              |                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| ![Profiles, light](screenshots/evening/home.png)             | ![Profiles, dark](screenshots/evening/home-dark.png)           |
| ![Brainstorm, dark](screenshots/evening/brainstorm-dark.png) | ![Editor, dark](screenshots/evening/editor-dark.png)           |
| ![Inspiration, light](screenshots/evening/inspiration.png)   | ![Phone, dark](screenshots/evening/brainstorm-mobile-dark.png) |

**Why it meets the brief.** It keeps the curved, friendly feel that was liked, and fixes the logo problem: the round
plate is gone, replaced by Press's square hairline tile that stays light in dark mode so no icon disappears. Atkinson
Hyperlegible Next was designed for low vision, and having both editor and chat in it keeps reading comfortable at long
sessions. It is the only option with a designed dark mode. Compared with Press, the added borders on buttons, fields,
cards and icon buttons make interactive elements obvious, but at 1px (1.5px on buttons and fields) in a quiet colour,
not Ledger's black.

### Which to take forward

|                        | Slate                    | Evening                     |
| ---------------------- | ------------------------ | --------------------------- |
| Mood                   | Crisp, neutral, a tool   | Warm, soft, a place to stay |
| Corners                | 6px / 10px               | 10px / 16px                 |
| Navigation             | Full-height side menu    | Floating side menu          |
| Dark mode              | Not designed (add)       | Built in                    |
| Highlighter            | Pale lime, AI marks only | Amber/gold, AI marks only   |
| Closest to feedback on | Ledger                   | Lamplight                   |

Both use the same page markup, so you can also mix: Slate's palette with Evening's corners, or Evening's dark theme on
Slate's shell, is a change to tokens and two radius variables.

---

## Round 3: Slate in teal, ember and aubergine

Slate's structure stays exactly as it was (sidebar, Plex Sans, 6px/10px corners, Press-style logo plates, the same
clear controls). Only the colour tokens change, so each variant is a `tokens.css` file plus the shared
`slate/theme.css`. Each has a **designed dark mode**, switched with the button at the foot of the sidebar and following
`prefers-color-scheme`. The neutrals are tinted toward each accent's hue so nothing looks like a coloured button on a
grey page. All 18 contrast pairs pass AA in both modes for all three (`node tools/contrast.mjs`), and axe is clean on
every page. The product name in these mocks is now Wordwright.

![The three palettes, light and dark](screenshots/palettes.png)

|                | Teal                                       | Ember (burnt orange)                                      | Aubergine (deep purple)    |
| -------------- | ------------------------------------------ | --------------------------------------------------------- | -------------------------- |
| Accent, light  | `#0f6b6b` (5.8:1 on the page)              | `#b0440c` (5.3:1)                                         | `#5b2a86` (9.1:1)          |
| Accent, dark   | `#4fc3bd` (8.3:1)                          | `#f08a4b` (7.3:1)                                         | `#b99af0` (7.8:1)          |
| Neutrals lean  | Cool green-grey                            | Warm stone                                                | Faint violet               |
| AI highlighter | Soft yellow                                | Pale sky blue                                             | Soft yellow                |
| Mood           | Fresh, calm, closest to the original Slate | Warm and distinctive; the most different from other tools | Rich and a little literary |

Things worth knowing:

- **The highlighter is chosen to contrast with each accent**, not reused: yellow beside teal and purple, but pale blue
  beside orange, where yellow would sit too close to the orange wash.
- **Ember's error colour is a raspberry** (`#a8123f`), not red, because a standard red is too close to burnt orange.
  Errors also carry an icon and words, so colour is never the only signal. If Ember wins, that is the one trade-off to
  weigh: the "danger" colour is less conventional.
- **Dark accents are lighter and saturated** (not the same hue as the light accent) with dark text on filled buttons,
  because a light-mode accent on a dark page is too dim to read as a button.
- Only the screenshots shown in this file are kept in git (to keep the repository small). Every page of every concept,
  including the three palettes in light and dark, is generated: serve them as described below (`palettes.html` is the
  side-by-side sheet), or run `tools/shoot.mjs`, to see or capture the rest.
