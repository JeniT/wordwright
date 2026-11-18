---
name: Wordwright
description: Ember, a calm, clear tool for writing. Warm stone neutrals, one burnt-orange accent, IBM Plex Sans throughout.
colors:
  paper: '#f8f5f1'
  surface: '#ffffff'
  sunken: '#eee8e0'
  hover-wash: '#eee8e0'
  ink: '#2a2420'
  ink-soft: '#594f47'
  line: '#e0d8ce'
  line-strong: '#85786b'
  accent: '#b0440c'
  accent-strong: '#8a3207'
  on-accent: '#ffffff'
  accent-wash: '#fbe6d6'
  mark: '#cfe6f2'
  danger: '#a8123f'
  on-danger: '#ffffff'
  danger-wash: '#fbe6ec'
  ok: '#1f6b3d'
  ok-wash: '#e1f3e7'
  focus: '#b0440c'
  paper-dark: '#1a1512'
  surface-dark: '#241d19'
  sunken-dark: '#120e0c'
  hover-wash-dark: '#342a23'
  ink-dark: '#f1e9e1'
  ink-soft-dark: '#b8aa9d'
  line-dark: '#382e27'
  line-strong-dark: '#85766a'
  accent-dark: '#f08a4b'
  accent-strong-dark: '#ffa56e'
  on-accent-dark: '#2a1204'
  accent-wash-dark: '#43271a'
  mark-dark: '#2f4a5c'
  danger-dark: '#ff8fae'
  on-danger-dark: '#2a0510'
  danger-wash-dark: '#3e1a26'
  ok-dark: '#8fd19e'
  ok-wash-dark: '#1c3324'
  focus-dark: '#ffa56e'
typography:
  headline:
    fontFamily: 'IBM Plex Sans, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: 'clamp(1.75rem, 1.4rem + 1.4vw, 2.375rem)'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '-0.01em'
  title-sm:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: 'tnum'
  draft:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.7
  pane:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 600
    lineHeight: 1.2
  meta:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: 'tnum'
rounded:
  plate: '4px'
  ctl: '6px'
  panel: '10px'
  full: '999px'
spacing:
  ctl-h: '2.25rem'
  ctl-h-sm: '2rem'
  field-h: '2.75rem'
  panel-sm: '1rem'
  panel-md: '1.25rem'
  panel-lg: '1.5rem'
  section-sm: '2rem'
  section-lg: '3rem'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.label}'
    rounded: '{rounded.ctl}'
    padding: '0.3rem 0.9rem'
    height: '{spacing.ctl-h}'
  button-primary-hover:
    backgroundColor: '{colors.accent-strong}'
  button-outline:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.accent}'
    typography: '{typography.label}'
    rounded: '{rounded.ctl}'
    padding: '0.3rem 0.9rem'
    height: '{spacing.ctl-h}'
  button-outline-hover:
    backgroundColor: '{colors.accent-wash}'
  button-neutral:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.ctl}'
    padding: '0.3rem 0.9rem'
    height: '{spacing.ctl-h}'
  button-neutral-hover:
    backgroundColor: '{colors.sunken}'
  button-quiet:
    textColor: '{colors.accent}'
    typography: '{typography.label}'
    rounded: '{rounded.ctl}'
    padding: '0.3rem 0.9rem'
    height: '{spacing.ctl-h}'
  button-quiet-hover:
    backgroundColor: '{colors.accent-wash}'
  button-ghost:
    textColor: '{colors.ink-soft}'
    rounded: '{rounded.ctl}'
    size: '{spacing.ctl-h-sm}'
  button-ghost-hover:
    backgroundColor: '{colors.hover-wash}'
    textColor: '{colors.ink}'
  button-ghost-current:
    backgroundColor: '{colors.accent-wash}'
    textColor: '{colors.accent}'
  button-danger:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.danger}'
    typography: '{typography.label}'
    rounded: '{rounded.ctl}'
    padding: '0.3rem 0.9rem'
    height: '{spacing.ctl-h}'
  button-danger-hover:
    backgroundColor: '{colors.danger-wash}'
  button-danger-solid:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.on-danger}'
    typography: '{typography.label}'
    rounded: '{rounded.ctl}'
    padding: '0.3rem 0.9rem'
    height: '{spacing.ctl-h}'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.ctl}'
    padding: '0.5rem 0.75rem'
    height: '{spacing.field-h}'
  panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.panel}'
    padding: '{spacing.panel-md}'
  panel-sunken:
    backgroundColor: '{colors.sunken}'
    rounded: '{rounded.panel}'
    padding: '{spacing.panel-md}'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.panel}'
    padding: '{spacing.panel-sm}'
  chip:
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    padding: '0.05rem 0.55rem'
  chip-accent:
    backgroundColor: '{colors.accent-wash}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    padding: '0.05rem 0.55rem'
  chip-quiet:
    backgroundColor: '{colors.sunken}'
    textColor: '{colors.ink-soft}'
    rounded: '{rounded.full}'
    padding: '0.05rem 0.55rem'
  chip-ai:
    backgroundColor: '{colors.mark}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    padding: '0.05rem 0.55rem'
  callout:
    backgroundColor: '{colors.accent-wash}'
    textColor: '{colors.ink}'
    rounded: '{rounded.ctl}'
    padding: '0.85rem 1rem'
  callout-danger:
    backgroundColor: '{colors.danger-wash}'
    textColor: '{colors.ink}'
    rounded: '{rounded.ctl}'
    padding: '0.85rem 1rem'
  step-num-current:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.ctl}'
---

# Design System: Wordwright

This file summarises the **Ember** design system for agents designing new screens. It is derived from the code and
from `docs/design/`, which remain the authority: if this file and `apps/web/src/theme/palette-ember.css`,
`apps/web/src/theme/theme.css` or `docs/design/` disagree, they win and this file is out of date. Words on screen
follow `docs/style-guide.md`; product truth is in `PRODUCT.md`.

## Overview

**Creative North Star: "The Writing Desk"**

A well-kept desk by a window: warm paper, one good pen, everything within reach and nothing on show. Ember is a calm,
clear tool for writing. The writer's words are the work on the desk; the interface is the furniture around it,
quiet enough to forget and plain enough that it is always obvious what can be picked up. Space is generous, colour is
rare, and nothing is decorative.

Depth comes from tone and a hairline, never from shadow: paper, a white surface laid on it, a recessed tray. One
warm accent, Ember, marks where you can act and where you are. A pale blue highlighter is kept in a drawer for one
job only: showing what the AI suggested, so the writer's own words always look like theirs. One typeface does
everything, from the menu to the draft to the AI's replies, only larger and looser where reading matters.

Dark mode is a lamplit version of the same desk, designed rather than inverted: lighter, warmer accent, dark text on
buttons, deep tinted washes.

**Key Characteristics:**

- Warm stone neutrals with a single burnt-orange accent.
- IBM Plex Sans for everything, tabular figures by default.
- Flat: no shadows, no gradients; tone and 1px edges separate things.
- Every control has a fill or a visible 1px border; links are always underlined.
- The highlighter means "the AI suggested this" and nothing else.
- Colours are chosen by role in one palette file, never in components.

## Colors

Warm stone paper and ink with one ember of colour, and a pale blue pencil kept for the AI.

### Primary

- **Ember** (accent): primary buttons, links, the current menu item and step, the focus ring, the Wordwright mark.
  It means "you can act here" or "this is where you are", never decoration. Its hover and pressed state is
  **Deep Ember** (accent-strong); text on it uses on-accent.
- **Ember Wash** (accent-wash): the tinted background for information that is not an action: notices, callouts,
  counts, the current menu item, a hovered card, a selected icon button.

### Neutral

- **Warm Paper** (paper): the page.
- **Surface White** (surface): raised areas laid on the paper: panels, cards, fields, the side menu.
- **Stone Tray** (sunken): recessed areas: code, quotations, disabled fields, secondary panels, a list's rail.
- **Hover Wash** (hover-wash): the fill under the pointer on an icon button. The same as Stone Tray in light; its own
  softer step in dark, where Stone Tray is near-black.
- **Inkwell** (ink): body text.
- **Soft Ink** (ink-soft): secondary text: hints, dates, counts, explanations, icon buttons at rest. Never for
  disabled-looking text that must still be read.
- **Hairline** (line): decorative dividers and quiet panel edges.
- **Pencil Line** (line-strong): edges you must see: fields, neutral buttons, cards, chips (3:1 against paper and
  surface).

### Signal colours

- **Blue Pencil** (mark): the highlighter. AI-suggested things only, always with a text label beside it. Also the
  text-selection colour.
- **Raspberry** (danger, danger-wash, on-danger): errors and destructive actions. Raspberry rather than red so it can
  never be mistaken for Ember. Always paired with words and, where it fits, an icon.
- **Leaf** (ok, ok-wash): success.
- **Lettered tiles** (tint-1 to tint-6 in the palette file): six muted background and letter pairs for a publication
  or site with no picture. Not for anything else.

Dark mode has its own value for every role (the `-dark` tokens), applied by `data-theme="dark"` or the system
setting; components never write `dark:`.

### Named Rules

**The One Ember Rule.** Ember means action or location. If something is coloured Ember and cannot be pressed or is
not the current place, it is wrong; use Ember Wash for information.

**The Blue Pencil Rule.** The highlighter marks what the AI suggested and nothing else. If it is everywhere it marks
nothing, and the writer's own words must stay visually theirs.

**The Roles Not Colours Rule.** Markup says what something is (`bg-surface`, `text-ink-soft`), never what it looks
like. Tailwind's default palette is switched off, so a raw colour class does nothing. A new colour is a new role in
the palette file (light, dark and system-dark), mapped in `theme.css`, with its pairs added to `palette.test.ts`.

## Typography

**Display Font:** IBM Plex Sans (headings use `font-display`, currently the same family)
**Body Font:** IBM Plex Sans (with system-ui, -apple-system, Segoe UI, Roboto, sans-serif)

**Character:** One humanist sans, self-hosted in four files (400, 400 italic, 500, 600). Clear and slightly
engineered, warm enough at reading sizes; the hierarchy comes from size and weight, not from a second face.

### Hierarchy

- **Headline** (600, 28–38px fluid, 1.15, −0.02em, balanced): the page title, once per page (`h1`, or `StepHeading`
  on a numbered step).
- **Title** (600, 20px, 1.3, −0.01em): section headings (`h2`).
- **Title small** (600, 17px, 1.3): subsection and card headings (`h3`).
- **Body** (400, 16px, 1.6): text, labels, field contents (16px in fields stops iOS zooming).
- **Draft** (400, 16px, 1.7): the editor and the AI's replies; same family, looser line.
- **Pane** (400, 15px): notes, articles and comments beside the draft.
- **Label** (600, 14px, 1.2): buttons; 13px on small buttons and chips.
- **Meta** (400, 14px, Soft Ink, tabular figures): dates, hosts, counts.

### Named Rules

**The One Sans Rule.** No serif, no monospace for metadata, no second typeface. Nothing read is smaller than 14px,
except small buttons and chips (13px) and tabular tags (12px).

## Layout

- **Shell:** a 16rem side menu on desktop that follows where you are (home → publication → idea). Below `md`
  (48rem), and on pages read beside another window, a sticky 3rem top bar replaces it: a menu edge-tab flush left,
  the mark (Home) between, and on the drafting page a panel edge-tab flush right. The menu then opens as a drawer
  over the page behind a scrim, sliding in over 0.15s (off under reduced motion).
- **Content width:** `max-w-3xl` for reading and forms; `max-w-6xl` for wide routes such as the drafting page with
  its notes column.
- **Rhythm:** Tailwind's spacing scale. Page sections are 2–3rem apart; panels have 1–1.5rem of padding. Match the
  neighbouring screen before inventing a value.
- **Phone width:** every screen is checked at 390px and nothing may scroll sideways.
- **Steps:** real sequences are numbered 01, 02, 03 in the menu and on the page, and every step is a link, never
  locked. A step page ends with "← Previous / Next →" links where one fits.
- **Landmarks:** the side menu is the page `header`, content is `main`, a skip link comes first, and the drafting
  notes are the one `aside`.

## Elevation & Depth

Flat. There are no shadows and no gradients anywhere. Depth is tonal: Warm Paper is the floor, Surface White is laid
on it, Stone Tray is recessed into it, and a 1px edge (Hairline for containers, Pencil Line for controls) makes the
boundary. A dialog or drawer is separated by a 50% black scrim and a Hairline edge, not by lifting.

### Named Rules

**The Flat Desk Rule.** If something needs to stand out, give it a different tone or a 1px edge. A `shadow-*` class
is never the answer.

## Shapes

Gently rounded rectangles in two sizes: controls (buttons, fields, callouts, step numbers) at 6px, containers
(panels, cards, dialogs) at 10px. Fully round is for chips, comment markers and avatars only. Every edge is 1px.

Two deliberate exceptions: another site's icon or picture sits on a square **plate** with barely rounded 4px
corners, a Pencil Line frame and a white background in both modes, so the app's own rounding never wraps someone
else's artwork. And the phone's edge-tabs are rounded on one side only, flush with the screen edge.

## Components

### Buttons

Plain, legible, unmistakably pressable.

- **Shape:** gently rounded (6px), 36px tall (32px small and icon-only), 14px semibold label, an icon optional
  at the start.
- **Primary:** Ember fill, white text; Deep Ember on hover. Only one primary per area.
- **Outline:** white with an Ember border and Ember text; Ember Wash on hover. A second action that still matters.
- **Neutral:** white with a Pencil Line border, ink text; Stone Tray fill and ink border on hover.
- **Quiet:** a Hairline border and Ember text, for low-emphasis text actions; Ember Wash on hover.
- **Ghost (icon-only):** no border or fill at rest, Soft Ink icon; Hover Wash on hover or focus. The current page or
  a pressed toggle shows Ember Wash with an Ember icon. Remove buttons turn Raspberry on hover.
- **Danger:** white with a Raspberry border and text; the final irreversible confirm is solid Raspberry.
- **Disabled:** 55% opacity and only with a reason; a working AI button keeps 85% so its spinner reads.
- **Focus:** the global 3px Ember outline, offset 2px. Never restyled per control.

### Chips

- **Style:** fully round, 13px semibold, 1px Pencil Line border.
- **Variants:** Accent (Ember Wash with an Ember edge) for status worth noticing; Quiet (Stone Tray, Soft Ink) for
  tags; AI (Blue Pencil) for AI-origin labels only; OK (Leaf) for success.
- **Name chip:** a person's name as a small rounded label saying who wrote or edits something.

### Cards / Containers

- **Panel:** Surface White, 1px Hairline, 10px corners, 1–1.5rem padding. A sunken panel uses Stone Tray.
- **Card:** Surface White, 1px Pencil Line, 10px corners; Ember Wash and an Ember edge on hover when the card is a
  link.
- **Callout:** Ember Wash with an Ember edge, 6px corners, 15px text: information the writer should notice. Danger
  and OK variants use their own wash and edge.
- **Notice:** Surface White with a Hairline edge for quieter information.
- **Shadow strategy:** none (see Elevation & Depth).

### Inputs / Fields

- **Style:** Surface White, 1px Pencil Line, 6px corners, 44px tall (36px compact), 16px text.
- **Focus:** the global Ember outline.
- **Saving:** a form shows what happened in words beneath it ("Saved", or the reason in an alert), and its button
  reads "Saving…" while it runs.
- **Checkboxes and radios:** native, 20px, tinted Ember. Switches are 44px tall with their label.

### Navigation

- **Side menu:** Surface White with a Hairline edge; the current item has `aria-current`, an Ember Wash fill and a 3px
  Ember edge on its left, never colour alone. Numbered steps use a small rounded step number, solid Ember when current.
- **Breadcrumb:** a trail of underlined links above the heading; the page you are on is left to the heading.
- **Tabs:** 44px tall, Soft Ink at rest; the selected tab is bold ink with a 3px Ember underline. Tabs carry no counts.
- **Appearance:** a segmented control (System / Light / Dark) at the foot of the side menu.

### The highlighter (signature)

AI-suggested text and items carry a Blue Pencil background **and** a text label (an AI chip or the hand-drawn AI
sparkle icon). It is the one place colour carries meaning about origin, and the reason the rest of the palette
stays quiet.

### Icons

Phosphor, bold weight, through the `Icon` component, coloured by `currentColor` and hidden from screen readers. The
AI sparkle is hand-drawn to match Phosphor bold's stroke.

## Do's and Don'ts

### Do:

- **Do** build with roles and component classes (`bg-surface`, `text-ink-soft`, `btn btn-primary`, `panel`, `chip`).
- **Do** give every button and field a fill or a visible 1px border, and underline every link.
- **Do** keep one primary button per area.
- **Do** separate surfaces with tone and a 1px edge.
- **Do** use the highlighter only for what the AI produced, with a text label beside it.
- **Do** put another site's picture on the square plate (`PublicationImage kind="source"`).
- **Do** look at every screen in light and dark and at 390px, and keep `palette.test.ts` and the axe checks passing.
- **Do** give every async action its loading, empty and error states, with error text that says what to do next.

### Don't:

- **Don't** write a colour value (hex, `rgb()`, a Tailwind palette name) in a component, or use `dark:`.
- **Don't** add shadows, gradients or decoration.
- **Don't** use Ember for decoration, or Raspberry for anything but errors and irreversible actions.
- **Don't** add a second typeface, or a monospace face for metadata.
- **Don't** use bare `rounded`; use the control (6px), panel (10px) or full radius.
- **Don't** let colour be the only signal: errors have words, the current item has `aria-current`, AI items have a
  label.
- **Don't** show the Wordwright mark anywhere but the menu header, signed-out pages, the browser tab and the
  home-screen icon; never as decoration or in place of a publication's picture.
- **Don't** add streaks, scores, badges or progress that rewards use.
