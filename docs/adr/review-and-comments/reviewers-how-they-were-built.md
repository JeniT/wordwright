# Reviewers: the reasons behind the build (#157)

[Reviewer-only accounts](reviewer-only-accounts.md) is the decision; these are the choices inside it.

- **One place enforces what a reviewer-only account may reach** (`requireUser`, `reviewerMayReach`): who it is, sign-out,
  `/reviews/*`, accepting an invitation and deleting itself; everything else is 404, as for a stranger. A test walks every
  route the app registers as a reviewer. The web app mirrors it (the router sends such an account to its reviews).
- **"Start writing" is for reviewer-only accounts only** (#361). A member of a publication asked to review reads the draft
  with the full side menu and finds their reviews under "Drafts to review" on Home.
- **A review is of a snapshot** ([reviews are of snapshots](reviews-are-of-snapshots.md)). Sending again makes a new
  snapshot, and more from the same person is a new review. Reviewers' comments stay out of a member's own live-draft comment
  list.
- **Three states:** _open_ (can comment), _ended_ (the reviewer pressed **End review**, which emails the editor once with the
  number of comments and no text, and is final for that snapshot) and _closed_ (the editor or an owner stopped accepting).
  Ended and closed reviews are read-only. Comments, ends and closes send no other email.
- **Members can be asked too.** They review the same snapshot with the full side menu. Only the editor sends; owners can still
  close reviews.
- **Who may send:** only the editor, with a confirmed address; capped per person (sharing the invitation cap of 20 a day) and
  per recipient (5 a day). The answer is the same `202` whatever the address, and nothing is sent to an address that is
  blocked, already reviewing, or already a member.
- **Only a name and password** make a new reviewer account (the link proves the inbox). Reviewer-only accounts are not made
  through an identity provider: a gap in the issue's wording, kept simple on purpose. A new person who would rather use Google
  gets a full account through ordinary sign-up and follows the link again.
- **Upgrading:** accepting a publication invitation, or **Start writing**, makes it a full account and keeps its reviews.
- A reviewer's comments are visible to them and the editor only, and follow the keep-my-name choice at account deletion.
