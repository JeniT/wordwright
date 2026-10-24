# Handover: the reasons behind the build (#155)

- **One table, one history.** Offers, asks and reassignments share a table with a status; "one open offer per draft" is a
  partial unique index, so two simultaneous offers can't both win. The page's state is one read, and every action answers
  with it.
- **Asks have no email and no deadline.** They only show on the editor's page. An ask is answered when its asker becomes
  editor, whichever way (the editor's offer, or an owner's reassignment).
- **An editor change cancels the old editor's open offer**, whether by accept, reassignment, or the editor leaving: an offer
  from someone who no longer has the pen means nothing. An offer to someone who leaves is declined.
- **History follows the keep-my-name choice** (#153): on account deletion a name is kept only if the person chose to keep it;
  otherwise the log says "a former member" and no row holds the name.
- **The system's reassignments are logged too.** When an editor leaves, is removed or deletes their account, each draft that
  passes to an owner gets an entry with no actor, shown as "Passed to X when the previous editor left".
- The offer email is sent in the background and throttled at 20 a day per editor.
