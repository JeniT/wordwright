# Tutorial mode: one text, shown by a switch in the menu (#198, #200, #314)

- **One text, two places.** `Explain` replaces `InfoTip` at its call sites: the same slot is an info icon with the tutorial
  mode off and a paragraph on the page with it on, so the two versions can't drift. A page-purpose line (no icon) is
  `<Explain tutorial-only>`. Tutorial mode is not a second set of text; it is where the one text is shown.
- **A switch that is always in view (#314).** **Tutorial** sits in the menu's account area, on by default for new accounts
  (registration, and a reviewer-only account becoming a full one, write 1). Existing accounts stay off: `tutorial_mode` is
  null for accounts that predate it, and null means off, so nobody already using the site gets new text on their pages.
- **Why not an offer.** The first design offered to turn tutorial text off once a person had seen every kind of page with
  tutorial text. That set grows as each page's content crit lands, so many people would never reach the offer and never find
  the setting; and people want the text back after a break or on a page they rarely use, which a once-only offer can't give.
  There is no seen-pages tracking, and no automatic reminders: resurfacing text after a gap would need a record of when each
  page was last seen and a rule for when to show it again, and it would nudge people. The switch is the reminder. Revisit if
  people ask.
- **A kind of page is a route name.** A route opts in with `meta.tutorial` (`level/step` is shared, the name is not).
- **Failure without an alert.** If saving fails the switch returns to the saved setting and is `aria-disabled` until the page
  is reloaded, with a tooltip saying why. A real `disabled` would take it out of the tab order and hide the reason from
  keyboard and screen-reader users.
- **Reviewer-only accounts** get no switch while no page they can open has tutorial text.
- **Notices.** The email banner became the first of two kinds in a bar inside the content column: **warn** (needs action,
  accent) and **info** (an offer, quiet). Info is held back on the editor so nothing interrupts writing.
