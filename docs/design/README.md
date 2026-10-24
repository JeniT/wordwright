# Design system: Ember

How Wordwright looks, why, and how to keep it that way. This page is the entry point: the principles, where the
design lives in the code, and how to apply or change it. The detail is in the files listed under _Which file to read_.
The short version is in [AGENTS.md](../../AGENTS.md); the reasoning behind choosing this design, and the alternatives
we dropped, are in [the decision](../adr/visual-design-and-navigation/visual-design-ember.md) and the archive in
[design-concepts/](../design-concepts/README.md). How the words read (voice, buttons, errors, length) is in the
[style guide](../style-guide.md); this design decides where text goes.

**Ember** is a calm, clear tool for writing: warm stone neutrals, one burnt-orange accent, IBM Plex Sans everywhere,
a side menu, 1px outlines on everything you can press or type in, and a designed dark mode.

## Which file to read

| When you are…                                                                                                                                  | Read                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Choosing a colour role, type size, spacing, icon, the AI mark, a site's picture, dark mode, page layout                                        | [colour-type-shape.md](colour-type-shape.md) |
| Using or adding a component (`btn`, `field`, `panel`, `chip`, `callout`…), an AI button, an editor toolbar, comment marks, the Rephrase window | [components.md](components.md)               |
| Deciding where text goes: on the page, behind an info icon, in tutorial mode, a notice, a help page                                            | [explanatory-text.md](explanatory-text.md)   |
| Building a list, a row's actions, a toolbar, a switch or checkbox, or a delete or removal                                                      | [actions-and-lists.md](actions-and-lists.md) |
| Adding a page, a step or a menu item, or changing how the menu follows you                                                                     | [navigation.md](navigation.md)               |
| Finishing any screen (focus, targets, saving and loading states, axe)                                                                          | [accessibility.md](accessibility.md)         |

## What it looks like

The running app (these are screenshots of the real thing, not mock-ups):

|                                                            |                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Home, light](../screenshots/app-home.png)                | ![Idea page, light](../screenshots/app-idea.png)                       |
| ![Drafting page, dark](../screenshots/app-editor-dark.png) | ![Idea page on a phone, dark](../screenshots/app-idea-dark-mobile.png) |

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
6. **Other people's pictures are guests.** Logos and icons from other websites never appear bare ([colour-type-shape.md](colour-type-shape.md#pictures-and-logos-from-other-sites)).
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
| `apps/web/src/lib/nav.ts`, `components/SideMenu.vue`    | What the side menu lists for where you are (see [navigation.md](navigation.md)).                                                                                                                  |
| `components/StepHeading.vue`, `components/NextStep.vue` | A numbered step's title, and its \"Next: …\" suggestion.                                                                                                                                          |

Tailwind's default colour palette is **switched off** (`--color-*: initial` in `theme.css`). A class like `bg-red-50`
or `text-stone-600` does nothing, so off-palette colour can't creep in unnoticed. Only the roles in [colour-type-shape.md](colour-type-shape.md#colour-roles) exist.

## Applying the design to a change

1. Find the nearest existing screen and copy its structure. Reuse components before writing utilities.
2. Build with roles and component classes. No colour values, no `dark:`, no shadows, no bare `rounded`.
3. Headings `h1` (once per page, `StepHeading` on a step) / `h2` / `h3` (no skipped levels); the primary action is the only `btn-primary` in its area.
   A new page in the app declares its level and step (see [navigation.md](navigation.md)) and ends with `NextStep` where one fits.
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
- When a screen needs something the system lacks, change the system; colours and one-off classes stay out of the screen.
