# Colour, type, shape and layout

Part of the [design system](README.md). Read this when choosing a colour role, a type size, spacing, an icon, the AI mark, another site's picture, dark mode, or a page layout.

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

Emails are light-only and use the Ember accent for their buttons. Their colours are the constants `EMAIL_COLOURS` in `apps/api/src/mail/templates.ts`, which a test keeps equal to the light palette above.

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

| Use                                          | Class / rule                             | Notes                                                                                  |
| -------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Page title                                   | `h1`                                     | 28–38px, 600, balanced                                                                 |
| Section heading                              | `h2`                                     | 20px, 600                                                                              |
| Subsection / card heading                    | `h3`                                     | 17px, 600                                                                              |
| Body, labels, buttons                        | default (16px) / `text-sm` for secondary | Never below 14px for anything read (except `btn-sm`, 13px), 12px only for tabular tags |
| Secondary line (dates, hosts, counts)        | `meta`                                   | 14px, `ink-soft`, tabular figures                                                      |
| The editor and the AI's replies              | `.prose-editor`, `.markdown`             | 16px (`--draft-size`), line-height 1.7, same family                                    |
| Notes, articles, comments (beside the draft) | `#draft-notes`                           | 15px (`--pane-size`); their secondary lines keep `text-xs` and `text-sm`               |

Figures are tabular by default so counts and dates align. Don't add other typefaces. Headings use `font-display`
(currently the same family), so a different display face is one line in `theme.css`.

## Shape, space and depth

- **Corners:** `rounded-ctl` (6px) for buttons and fields, `rounded-panel` (10px) for panels, cards and dialogs,
  `rounded-full` for chips and avatars only. Don't use bare `rounded` (it is not defined in this system).
- **Edges:** 1px. A quiet `line` for containers, `line-strong` for controls, `accent` for the current/hovered thing.
- **No shadows or gradients.** Separation comes from tone (`paper`/`surface`/`sunken`) and a 1px edge.
- **Spacing:** Tailwind's scale; page sections `mb-8`–`mb-12`, panel padding `p-4`/`p-5`/`p-6`. Read neighbouring
  screens first and match them.

## Icons

- **One set, one weight:** [Phosphor](https://phosphoricons.com/) **bold** (MIT), drawn by `Icon` in `Icon.vue`. People never import an icon
  file in a component; they write `<Icon name="…">`. A new icon is one import and one name there (the SVG files are
  `@phosphor-icons/core/assets/bold/<name>-bold.svg`; only the ones imported are bundled).
- **The AI sparkle is ours.** No icon pack has one like it, so `ai` is hand-drawn as a stroke icon whose stroke width (2.25
  in its 24-unit box) is chosen to match Phosphor bold at the same size. Keep the two in step if the weight ever changes.
- Icons are decoration (`aria-hidden`); the control that holds one has its own name. Colour comes from `currentColor`.

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

The exception is an icon that is **square to its corners** (#226): the server checks, when it fetches the icon, that it is
as wide as it is tall, at least 64px, and that all four corners (sampled just inside the edge) are opaque. Such an icon fills the plate (the frame
stays, no padding), since there is nothing to protect. Rounded or irregular icons, and small ones, stay contained as above.
The flag is `siteIconSquare` on a publication and `iconSquare` on a source (feed); pass it as `site-icon-square` or `square`.

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

## Layout

A **reviewer-only account** (someone asked to read a draft, see decisions.md "Reviewers") has no side menu: a single top
bar with the name, the Appearance choice, a **Start writing** button (the way to upgrade to a full account) and
Sign out, over one column. It has no settings gear: a reviewer-only account has no account page. Its pages (`ReviewsView`, `ReviewView`) use the
same cards, callouts and chips as everywhere else.

An account that is **waiting for approval, or declined** (the private alpha, #328) gets the same bare top bar, without
Start writing, over `WaitingView` (`/waiting`): a heading, one or two plain sentences, and below a rule the ways out (download,
delete). It is not a level of the app and has no step. **Accounts** (`/admin`, `AdminView`) is for admins only: a link
beside Help in the menu foot, the same level-less page of cards (waiting first, then everyone in a paged list), a chip for
status and `btn-sm` Approve / Decline buttons whose accessible name includes the person's name.

- **Side menu** (16rem) on desktop; on phones, and at every width on `compact` pages, a top bar with a **Menu** button
  (`aria-expanded`, `aria-controls`) that folds the menu away and shows where you are while closed. Opened, the menu is
  a **drawer** that slides in from the left over the page (it never pushes the content), behind the `scrim` that
  closes it when pressed. It is a modal dialog while open (`useModal`: focus moves in and returns to the Menu button,
  Tab stays inside, Escape closes) and it closes on navigation. No shadow: separation is the scrim and a 1px `line`
  edge. The slide is 0.15s and off under reduced motion. Signed-out pages have a centred name only.
- **Content width:** `max-w-3xl` for reading and forms; routes with `meta.wide` get `max-w-6xl` (the drafting page
  with its notes column). Check every screen at 390px; nothing may scroll sideways.
- **Landmarks:** the side menu is the page `header`; the page content is `main`; a skip link comes first. Don't add a
  second `aside` for the menu: tests and screen-reader users find the drafting notes by that landmark.
