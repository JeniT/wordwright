# Exporting your writing: Markdown only, by role, built on request (#167)

A zip of Markdown files, nothing else, so a writer can open their words anywhere (priority 4: no lock-in). Chosen with
the owner: **no JSON** ("I don't think JSON will be useful generally"), **one file per publication, idea and draft**, with
the idea and publication files holding bullet lists of notes and the articles and relative links to what belongs to
them. Layout: `README.md` at the top (what is in, who gets what, what is left out), then `<publication-id>/` with
`<publication-id>.md`, `ideas/<slug>.md` and `drafts/<slug>.md`. File names are slugs of titles (letters, digits and
hyphens, numbered when two collide), so a title can never name a path; the zip writer refuses any other path. The
publication's folder and file use its id (`<handle>-<name>`), not its name, for the same reason. An idea has no separate
aim: its name is the writer's own statement of the core idea, so that is its heading.

- **Who gets which drafts.** An **owner** gets every draft in the publication, including other members'. A **member** gets
  the drafts they are the editor of or started (a draft they started and handed away is still listed, marked "now edited
  by someone else"); the idea file says how many drafts by other members aren't included. Notes and articles
  are everyone's and are all included. Members can read every draft in the app, so this is a rule about what
  _leaves_ the system in bulk, not about reading; the README says so.
- **Credits.** Notes carry their author's name and the date; a deleted account shows as "a former member". Reading
  items record when they were added but not by whom, so they show only the date (adding an author column would be a
  migration for little gain).
- **Left out.** Comments (human and AI), critiques, snapshots and reviews, brainstorm conversations (anything worth
  keeping should already be a note), API keys, and every email address. The AI's `why` on a suggested article is
  left out too: it is the AI's claim, not the writer's words.
- **Built on request, downloaded at once** (`GET /api/account/export`, all the person's publications, and
  `GET /api/publications/:id/export`, one), with no job queue or emailed link: it is a few seconds of text. Throttled to 5
  an hour per person because it costs the server work, shared by both routes. A reviewer-only account has neither
  route (404 like the rest). The zip is written by hand in `apps/api/src/export/zip.ts` (about sixty lines on
  `node:zlib`) rather than adding a dependency for small UTF-8 text files.
- **Where.** The account page (above the delete-account section, which links to it) and each publication's settings.
