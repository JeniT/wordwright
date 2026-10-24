# One publication description, not audience personas (#131, part of #27)

A publication has one Markdown description of the publication: what it is, who reads it and what kinds of writing go there. The
earlier plan (T16, #2) was a table of reader personas, but some writing has no audience (weeknotes to think in public,
#25), and a free-text description covers that case without a special state. It is Markdown so it can carry links;
it is rendered by the same safe renderer as the AI's messages (no raw HTML, only web and email links). It is up to
5000 characters, because it will go into prompts.

Everyone who works in the publication can edit it, so it has its own route (`PUT /api/publications/:id/description`, members)
instead of the owner-only `PATCH`. (It also once stored where the words came from and whether a person had accepted them, for AI drafts; those columns were
dropped in #151, see [Publication descriptions are written by the writer](publication-descriptions-are-written-by-the-writer-ai-drafting.md).)
