# What is waiting on you: reminders without nagging (#159)

One read, shown in one place. `GET /api/publications/:id/attention` answers, for the person asking: drafts offered to them,
their own offers still unanswered, and, for drafts they edit, how the reviews they sent stand per snapshot (reading,
finished, closed, and reviewers' comments not yet resolved). The publication's landing page shows it above everything else
and shows nothing when nothing waits; the draft page already carries its own offer controls, and gains the same per-copy
summary beside the reviewers. A draft is flagged ("Reviews finished, comments to answer") only when every review of a
snapshot is over, at least one was finished and comments remain unresolved: closed-only reviews and reviews still
being read never flag. A reviewer's own list of reviews is their landing page (#157).

Deliberately absent, as `docs/responsible-ai.md` asks: no extra emails (the three that exist are the offer, the
invitation and "has finished reviewing"), no count in the menu or anywhere outside this page, no streaks, nothing that
reappears after being answered. The query is read when the page opens (and after an action on it); there is no polling.
