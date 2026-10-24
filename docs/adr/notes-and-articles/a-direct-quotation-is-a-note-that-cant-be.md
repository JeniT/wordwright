# A direct quotation is a note that can't be edited and goes into a draft as a blockquote (T32b)

On the article's page, ticking **This is a direct quote** makes the note a quotation (`is_quote`, `quote` in the API).
Unticked, it is the writer's own words about the page, as before. Why it matters: a quotation pasted into a draft as
plain text is indistinguishable from the writer's own prose ([responsible-ai.md](../../responsible-ai.md), principle 5), and
a quotation that has been "improved" is no longer a quotation.

- **Needs a source.** `POST …/notes` with `quote: true` also needs `readingItemId` (400 otherwise): a quotation is
  someone else's words, so it says whose. The note says "Quoted from “Title”" (Ada as a chip) and is set apart as a
  blockquote wherever it is shown.
- **Uneditable, in three places.** The notes list has no Edit button for it; `PATCH …/notes/:id` answers 409 ("Delete
  it and add it again if it needs correcting"); and a database trigger aborts any `UPDATE` of a quotation's text, so a
  later feature (merging notes, say) can't alter one by accident. It can still be tagged, put in order, set aside
  and deleted. The idea's notes-as-one-text view (`PATCH /ideas/:id` with `notes`) rewrites every note, so it is
  refused (409) when that would change anything while the idea has a quotation; sending the same text back is fine.
- **Into a draft as a blockquote.** The text goes in with `> ` on every line and, if the item still exists, a last line
  inside the quote, `> — [Title](../../url)`. The server checks it: a quotation's insertion is refused (400) unless every
  non-blank line starts with `>`, so a quotation can't be recorded as pasted unquoted. Once it is in the draft it is
  the writer's draft to edit; the provenance record still says whether it is "Still as inserted".
- **Not done:** merging or splitting notes does not exist yet; when it does, a quotation must not be merged into
  other text or split (the trigger will enforce it, but the interface should say why). No migration is needed for
  existing notes: they are all `quote = 0`.
