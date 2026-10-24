# Handover: how it was built (#155)

- **One table, one history.** `draft_handovers` holds offers, asks and reassignments with a status; "one open offer per
  draft" is a partial unique index, so two simultaneous offers can't both win. The page's state (open offer, open asks,
  history) is one read, and every action answers with it.
- **Asks have no email and no deadline.** They only show on the editor's page. An ask is answered when its asker becomes
  editor, whichever way (the editor's offer, or an owner's reassignment).
- **An editor change cancels the old editor's open offer.** Whether by accept, reassignment, or the editor leaving: an
  offer from someone who no longer has the pen means nothing. An offer to someone who leaves is declined.
- **History names people by id, and follows the keep-my-name choice.** Names are looked up while the account exists. On
  account deletion the name is copied into `kept_actor_name` / `kept_member_name` only if the person chose to keep it
  (#153), so the log reads the same as their notes; otherwise it says "a former member" and no row holds the name.
- **The system's reassignments are logged too.** When an editor leaves, is removed or deletes their account, each
  draft that passes to an owner gets a `reassign` entry with no actor and `reason = 'left'`, shown as "Passed to X
  when the previous editor left".
- **Email:** one template (`handoverOfferEmail`), sent in the background with only the error logged; the offer is
  throttled at 20 a day per editor. No new configuration.
