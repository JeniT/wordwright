# Visual design: Ember

**Decision.** The look is **Ember**: a side menu, IBM Plex Sans for everything (the editor and chat included), warm
stone neutrals, one burnt-orange accent (`#b0440c`), 1px outlines on every control, 6px/10px corners, no shadows,
and a designed dark mode. How to apply it is in [design](../../design/README.md); the colour roles and components are in
`apps/web/src/theme/`. The owner chose it after three rounds of concepts (screens, contrast checks and write-ups are
kept in [design-concepts/](../../design-concepts/README.md); they are an archive, not code to import).

**What we were looking for.** Clean and simple (no skeuomorphism or effects); modern practice without the "generic
AI look"; an accessible palette that is _tested_ rather than asserted; easy to work with in Tailwind and easy to
swap or edit later (so semantic roles, not colours, in the markup); and a calm answer to the fact that we show
icons and logos from other websites.

**Options considered, and why each was or wasn't taken.**

| Round | Option                    | What it was                                                                                            | Outcome and reason                                                                                                                                                  |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Press**                 | A printed page: serif (Newsreader), warm paper, ink-blue, hairline rules instead of boxes.             | Calming, but **interactive elements weren't clear enough** (too little border and contrast), and the owner wanted sans everywhere. Its square logo plate was kept.  |
| 1     | **Ledger**                | Chalk and black, Plex Sans + Mono, ultramarine, hard 1.5px rules, a side menu, lime highlighter.       | **Closest.** Kept: the side menu, Plex Sans, the idea of a highlighter. Dropped: mono for metadata, black 1.5px rules (too harsh), lime used widely (drew the eye). |
| 1     | **Lamplight**             | Dark-first green-black and amber, Literata + Atkinson Hyperlegible, round corners, round logo plate.   | Kept: curved corners and a real dark mode. Dropped: serif text, and **square logos looked wrong inside a round plate** (the app's frame interfered with the logo).  |
| 2     | **Slate** (blue)          | Ledger softened: slate ink, 1px borders, 6px corners, lime only for AI marks, sans in editor and chat. | **Structure adopted.** Its blue accent was judged boring, so only the colour was reopened.                                                                          |
| 2     | **Evening**               | Lamplight in sans with a floating side menu and Press's logo plate.                                    | Good, and the only sans design with curved, soft panels, but Slate was preferred overall; its dark mode and softer corners informed Ember.                          |
| 3     | **Slate · Teal**          | Teal `#0f6b6b` on cool green-grey, soft yellow highlighter.                                            | The safest and calmest, closest to the original Slate. Not chosen: least distinctive.                                                                               |
| 3     | **Slate · Aubergine**     | Deep purple `#5b2a86` on faintly violet neutrals, soft yellow highlighter.                             | Richest, with the highest contrast (9:1) and a literary feel. Not chosen: the owner preferred the warmth of orange.                                                 |
| 3     | **Slate · Ember** (taken) | Burnt orange `#b0440c` on warm stone, pale-blue highlighter, raspberry danger, tuned dark mode.        | **Chosen.** Warm and distinctive, unlike most tools, and fits the owner's taste (teals, burnt orange and deep purples were the three asked for).                    |

**Why Ember specifically.**

- It is the most distinctive of the three colourways and the warmest, which suits a tool for writers, while the Slate
  structure keeps it clear and scannable.
- Warm neutrals (stone, not grey) make the orange feel native instead of pasted on.
- Dark mode is a first-class palette (lighter, more saturated orange with dark button text), not an inversion.
- Every pair is at least WCAG AA. The accent is 5.3:1 on the page and 4.7:1 on its own wash (a link inside a notice), the
  tightest text pair; in dark it is 7.3:1 and 5.5:1.

**Trade-offs we accepted.**

- **Orange next to red.** A standard red error colour is too close to burnt orange, so errors use raspberry
  (`#a8123f`). That is less conventional; errors always carry words and an icon so colour is never the only cue.
- **The highlighter is pale blue**, not yellow, because yellow would sit too close to the orange wash. It means
  "the AI suggested this" and nothing else; the rule is in [the design system](../../design/colour-type-shape.md#the-mark).
- **One family (Plex Sans).** Clean and legible, and consistent between the interface and the editor, but less
  characterful than a serif or a display face. The `font-display` role exists so a heading face can be added in one line.
- **A side menu** takes 16rem on desktop and becomes a Menu button on phones. The drafting page's notes column
  keeps the `complementary` landmark to itself (the menu is the page header), because tests and assistive technology
  find the notes by it.

**How it is built (so it stays swappable).** Colours are chosen in one file by role; Tailwind's default palette is
turned off, so a raw colour class does nothing; components (`btn`, `field`, `panel`, `chip`, `callout` ...) live in
`theme.css`; the palette test enforces contrast in both modes. Changing colour or character later means editing the
palette or theme file, not the screens.

**Revisit if** users report the orange or the pale-blue highlighter is hard to read in a context we didn't test; a
brand colour is chosen; a screen needs a state the roles can't express (add a role, don't bypass them); or we want a
distinct heading typeface.
