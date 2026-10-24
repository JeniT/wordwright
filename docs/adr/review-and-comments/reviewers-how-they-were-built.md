# Reviewers: how they were built (#157)

ADR 0002 is the decision; these are the details.

- **A reviewer-only account** is `users.reviewer_only = 1` with a null `handle`. The one place that enforces what it
  may reach is `requireUser` (`reviewerMayReach`): who it is, sign-out, `/reviews/*`, accepting an invitation and
  deleting itself; everything else is 404, as for a stranger. A test walks every route the app registers as a reviewer.
  The web app mirrors it (the router sends such an account to its reviews, and the publication list is never requested).
- **"Start writing" is for reviewer-only accounts only** (#361). A member of a publication asked to review reads the draft
  with the full side menu, finds their reviews under "Drafts to review" on Home (open, ended and closed), and goes back
  there; `/reviews` sends a full account to Home.
- **A review is of a snapshot** (#158, ADR 0001): when the editor sends the draft, its title and body are frozen in
  `draft_snapshots` and every person asked reviews that copy (`draft_reviews`: open, ended, closed; one per snapshot and
  reviewer). The editor keeps writing; sending again makes a new snapshot, and more from the same person is a new
  review. Reviewers' comments are anchored (block id and hash) to the snapshot and carry their `review_id`; the editor's
  list places them on the live draft by hash, and ones whose paragraph has since changed sit under "This passage has
  changed". They stay out of a member's own live-draft comment list. Invitations carry the snapshot they were sent with.
- **States:** _open_ (can comment), _ended_ (the reviewer pressed **End review**, which emails the editor once with the
  number of comments and no text, and is final for that snapshot) and _closed_ (the editor, or an owner, stopped
  accepting: one review, or all open ones). Ended and closed reviews are read-only and still show the snapshot and the
  reviewer's own comments. Comments, ends and closes send no other email.
- **Members can be asked too** (`memberIds`): they get a review of the same snapshot at `/reviews/:id`, an email with that
  link, and a "Drafts to review" list on their home page. Only the editor sends; owners can still close reviews.
- **Who may send and close:** only the editor sends (with a confirmed address); the editor or an owner can close; capped per person (shares the
  publication invitation cap of 20 a day) and per recipient (5 a day). The answer is the same `202` whatever the address,
  and nothing is sent to an address that is blocked, already reviewing, or already a member.
- **Only a name and password** make a new reviewer account (the link proves the inbox, so the address is confirmed).
  Someone who follows the link with an existing account signs in and the review is added to it. A new person who would
  rather use Google gets a full account through the ordinary sign-up and then follows the link again; reviewer-only
  accounts are not made through an identity provider (a gap in the issue's wording, kept simple on purpose).
- **Upgrading:** accepting a publication invitation as a reviewer-only account gives it a generated username (the app asks
  once whether they'd like another) and keeps its reviews; **Start writing** chooses a username and does the same.
- **Comments** are the ones from #156: a reviewer's are visible to them and the editor only, and follow the keep-my-name
  choice at account deletion like members' do.
