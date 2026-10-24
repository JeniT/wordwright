# One word, "publication", and a reset schema (#174)

"Profile" and "venue" named the same thing in different places, and neither says what it is. A **publication** is where a
writer publishes: a Substack, a blog, a magazine, a newsletter or similar. The word is used in the code (`publicationId`,
`PublicationStore`, `/api/publications`), the database (`publications`, `publication_members`, `publication_id`
columns), the prompts (`<publication_description>`), the screens and the docs. The OAuth `profile` scope is the
identity provider's word and is unchanged. Archives (`docs/design-concepts/`, `TODO.md`) keep the old words.

- **Why reset the migrations.** There are no live deployments, so renaming tables through appended migrations would have
  kept a history nobody needs: sixty steps, a handle backfill, two data-rewriting migrations and several table rebuilds.
  `MIGRATIONS` is now one entry, the whole schema, and later changes append as before.
- **Vestigial structure dropped.** `ideas.notes` (no longer read since notes became rows; the store assembles
  `Idea.notes` from them), the nullable `drafts.idea_id` (every draft has an idea), and the migration helpers that backfilled
  them. `users.handle` stays nullable because reviewer-only accounts have none.
- **Existing development databases are refused.** A file from before this has a higher schema version than the build
  knows, and the app says to upgrade rather than downgrade. Delete it. The default file is now
  `apps/api/data/wordwright.sqlite` (it was `lfwa.sqlite`), so a new one is simply started beside the old.
- **Prompts changed.** The wording of the AI's context changed from "venue" to "publication" (the instructions already
  said "publication" in most places); behaviour is meant to be the same, but the owner should review `prompts/`.
