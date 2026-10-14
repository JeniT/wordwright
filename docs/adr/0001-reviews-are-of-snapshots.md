# Reviewers review a snapshot of the draft, not the live draft

When an editor sends a draft for review, the title and body are frozen as a snapshot; reviewers read and comment on that, and each comment is anchored (block id and hash) to it. The editor keeps writing on the live draft, and the reviewers' comments are located on the current text, falling back to "This passage has changed". We chose this over letting reviewers read the live draft because that shifts under them, so comments end up about words they never saw, and "the version that was shared" would not exist once the review is closed. The cost is more rows (a snapshot per send) and that editors may not expect it, so the send dialog says it.

See #26 and `docs/decisions.md` → "Human review and draft editors".
