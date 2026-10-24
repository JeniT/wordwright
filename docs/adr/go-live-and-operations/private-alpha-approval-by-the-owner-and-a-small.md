# Private alpha: approval by the owner, and a small admin area (#315, #328)

- **A flag on the existing app, not a separate site.** A second deployment would have its own sign-in and attack surface
  for a handful of people. Admin is `users.is_admin`, set only from `ADMIN_EMAILS` or a command (never a route, so a
  bug in the app cannot make someone an admin), and always together with a confirmed address. A changed address clears it.
- **`ACCOUNT_APPROVAL`, defaulting to `required`.** The safe default is to lock the door; development and the e2e tests set
  `open`. A second pair of e2e servers runs with approval required for the one spec about it, so the other specs sign up
  and go straight in as they always did.
- **The gate is in `requireUser`**, beside the reviewer rule, as an allow-list of routes: who you are, sign out, delete,
  download, accept an invitation. A route added later is therefore closed to an unapproved account unless someone opens
  it on purpose. No AI call can be made, since every one is behind `requireUser`.
- **An invitation from an approved person is approval**, for publication and review invitations alike, and for a person who
  already signed up and is waiting. The cost is that an approved person can let in anyone they can email; the existing
  caps (5 a day to one address, 20 a day per sender) bound that. A declined account is not approved this way.
- **The admin sees name, email, signup date, status, nothing else**, by a query that selects only those columns. Decisions
  are emailed (kind, no reason) and written to `admin_audit`, which holds ids and no addresses; it keeps its rows when
  either account is deleted, with that person unlinked (`ON DELETE SET NULL`), so deleting an account leaves no copy of
  their email behind.
- **Declining an approved person is allowed** (it locks them out at once, since the check is on every request), so a mistake
  or a change of mind can be undone either way. Admins and the person deciding are never decided about in the app.
- **No email to the owner when someone signs up** (optional in the issue). The owner opens `/admin`, which lists those
  waiting; a digest can be added if the wait becomes a problem.
