# Tutorial mode is a switch in the menu, not an offer (#314; replaces the offer in #198, #200)

- **Why the offer went.** It appeared only after a person had seen every kind of page with tutorial text, which grows as
  each page's content crit lands, so many people would never reach it and never find the setting in account settings.
  People also want the text back after a break or on a page they rarely use, which a once-only offer can't give.
- **A switch that is always in view.** **Tutorial** sits in the menu's account area, on by default for new accounts.
  Existing accounts stay off (null means off, as before). Sign out moved up beside the settings button so the switch and
  the Help link share the second row. The Account settings section is gone: one place only.
- **No automatic reminders.** Resurfacing text after a gap (per page, or after time away) would need a record of when
  each kind of page was last seen, a rule for when to show it again, and it would nudge people. The switch is the
  reminder. Revisit if people ask for it.
- **No seen-pages tracking.** The seen list, the answer to the offer and the notice are removed. The `tutorial_mode`
  column stays; migrations are append-only.
- **Failure without an alert.** If saving fails the switch returns to the saved setting and is `aria-disabled` until the
  page is reloaded, held in a `ref` (no storage), with a tooltip saying why. A real `disabled` would take it out of the tab
  order and hide the reason from keyboard and screen-reader users.
- **Reviewer-only accounts** get no switch while no page they can open has tutorial text; it is added to their header when
  one does.
