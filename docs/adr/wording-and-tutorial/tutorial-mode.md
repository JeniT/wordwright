# Tutorial mode (#198, #200)

- **One text, two places.** `Explain` replaces `InfoTip` at its call sites: the same slot is an info icon with the tutorial
  mode off and a paragraph on the page with it on, so the two versions can't drift. A page-purpose line (no icon today) is
  `<Explain tutorial-only>`. Tutorial mode is not a second set of text; it is where the one text is shown.
- **Off unless set.** `user_settings.tutorial_mode` is null for accounts that predate it, and null means off, so nobody
  already using the site gets new text on their pages. Registration (and a reviewer-only account becoming a full one) writes 1.
- **A kind of page is a route name.** `level/step` is shared (the drafts list and the editor are both `idea/draft`), the
  name is not. A route opts in with `meta.tutorial`, so the set of kinds to see grows as each page's content crit lands and
  the offer to turn it off (once every opted-in kind has been seen, on the next page) never says "everything" while
  pages remain without text. The seen list is on the server, so it follows the person to another device, and capped.
- **Notices.** The email banner became the first of two kinds in a bar inside the content column: **warn** (needs action,
  accent) and **info** (an offer, quiet). Info is held back on the editor so nothing interrupts writing.
