# Account deletion semantics

Removes the user and everything only they own (including publications where they're the sole member). In shared publications
they're removed; drafts they wrote there remain. A person who is the **only owner** of a publication others belong to is
refused (409) until they make someone else an owner or delete the publication (#166), so nobody is handed a publication they
didn't agree to run. Deleting needs the account's password (#208): typing the email proved nothing, since it is on the account page, so `confirmEmail` is gone, and a Google-only account must add a password first, as changing an email already requires. The cleanup of never-confirmed accounts still passes ownership on to the longest-standing member:
there is no one to ask, and those accounts are unused. Immediate, no grace period; the account page offers a download of the person's writing first (#167, below).

**Several owners (#166).** A publication can have several owners but never none. Any owner can make a member an owner or
remove another owner (`PUT /api/publications/:id/members/:userId/role`, `{role}`), and an owner can step down if another
owner exists; the last owner can't be demoted, can't leave and can't delete their account while others are in the
publication. The count is checked inside the transaction that changes the role, so two owners removing each other at once
can't leave none. Draft editors are a separate thing and don't change with the role; nobody is emailed. The buttons ask
first, in a dialog that lists what the person will or won't be able to do (`lib/publication-roles.ts` holds that wording
once, for the invitation form to reuse in #168). We kept multiple owners rather than a single "transfer ownership" so
that handing over is two ordinary steps and never leaves a gap. Rejected: owners promoting with a switch (a role
change is a bigger step than a setting, so it gets a button and a dialog).

**Names stay if the person chooses (#153).** Deletion asks whether to keep the display name on what they contributed
to publications that continue (default yes) or show "a former member". On "keep", the name alone (never the email or
handle) is copied into `kept_name` columns on the rows that would lose their author (`idea_notes`, `idea_messages`,
`idea_research`, `draft_insertions`) just before the user row goes; reads use `COALESCE(users.name, kept_name)`, so
while the account exists the live name wins (renames still follow). On "don't keep" nothing is copied, so no row
holds the name (a test scans every table). Anything that later records an author (the #26 comments) must follow the
same rule: add its column to `UserStore.keepNameOnContributions`. Accounts purged as unconfirmed never keep a name.
