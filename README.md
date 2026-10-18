# Wordwright

A web app to support the writer's journey: idea generation, research, argument and outline refinement,
critique that preserves your voice, and supplementary material (titles, openings, social posts).

Currently implemented: accounts and login (email + password, optional Google), password recovery,
account deletion, multiple publications per user with sharing, drafts (Markdown-backed rich text editor)
and an LLM-powered critique. The rest is built on the same provider architecture.

> **Contributing or picking this up in a new session?** Start with [AGENTS.md](AGENTS.md), then
> the [GitHub issues](https://github.com/JeniT/wordwright/issues). Design rationale is in [docs/decisions.md](docs/decisions.md).

> The repository is on GitHub (private): `JeniT/wordwright`. CI runs the full check plus the browser tests on every push.

## Stack

| Concern         | Choice                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces, TypeScript (strict)                                                                 |
| `apps/web`      | Vue 3, Vite, Pinia, Vue Router, TanStack Query, Tiptap, Tailwind CSS v4                              |
| `apps/api`      | Hono on Node, Zod validation, SQLite (`node:sqlite`)                                                 |
| `packages/core` | Domain schemas (Zod) and provider interfaces + adapters, shared by web and api                       |
| Tests           | Vitest, Testing Library, MSW, Playwright (+ axe), Promptfoo (`evals/`, see `docs/responsible-ai.md`) |

## Design

The look is the **Ember** design system: a side menu, IBM Plex Sans throughout, warm stone neutrals with one
burnt-orange accent, clearly outlined controls, and a light and dark mode (it follows your system; the button at
the foot of the side menu overrides it). Colours are chosen by _role_ in one palette file, never in components, so
the design is easy to edit or swap:

- [docs/design.md](docs/design.md): the principles, colour roles, components, and how to apply the design to a change
- [`apps/web/src/theme/`](apps/web/src/theme): `palette-ember.css` (the colours, light and dark) and `theme.css` (fonts, components)
- [docs/decisions.md](docs/decisions.md#visual-design-ember): why Ember, and the other options we looked at
  (screens and write-ups in [docs/design-concepts/](docs/design-concepts/README.md))

Contrast is tested (`palette.test.ts`) and axe runs in the e2e suite; fonts are self-hosted (SIL OFL), so no
request goes to a font service.

## Navigation

The side menu **follows you**: what it lists depends on where you are, with a link back up and the name of the thing you
are in. Numbers on the steps orient; they never lock anything, so every step is always a link, and each page ends with a
gentle "Next: …" suggestion. Home → publication → idea:

| Level                | Menu lists                                                                                                                                                           | Front door                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Home                 | Quick add, drafts to pick up, publications; account settings by the gear beside your name (`/`)                                                                      | `/`                                             |
| Publication          | **01 Search** (recent posts), **02 Read** (reading list), **03 Notes**; a gear beside the name for settings                                                          | `/p/<id>` → its landing page                    |
| Idea                 | **01 Research**, **02 Notes**, **03 Refine** (brainstorm), **04 Draft** (each draft ends with Copy and Copy as Markdown); a gear beside the name for settings        | `/p/<id>/ideas/<idea>` → Notes                  |
| Publication settings | **Details**, **Description**, **Feeds**, **Sharing**, **Download**, **Delete publication** (owners only) as plain links, no numbers; the way up is "← {publication}" | `/p/<id>/settings` → `/p/<id>/settings/details` |
| Account              | Six settings pages as plain links, no numbers: **Your details**, **Your AI**, **Display**, **Sign-in and security**, **Download your writing**, **Delete account**   | `/account` → `/account/details`                 |

Pages declare their level and step in their route's `meta` (`router.ts`); `lib/nav.ts` and `SideMenu.vue` do the rest.
The menu folds behind a **Menu** button on phones, and at every width on pages read beside another window (reading a
source). See [docs/design.md](docs/design.md#navigation-the-menu-follows-you) and the decision in
[docs/decisions.md](docs/decisions.md#navigation-the-menu-follows-you).

## Getting started

Requires Node 24+ and pnpm.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # optional; defaults use the fake LLM
pnpm dev                                  # web on :5173, API on :8787
```

The API reads real environment variables; load `.env` with e.g. `node --env-file=.env` or your shell.
To use Claude: `LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... pnpm dev`.

## Troubleshooting

- **"… was created by a newer version of this app"**: your database is from before the schema was reset (#174).
  Delete it (and its `-wal`/`-shm` files). The default file is now `apps/api/data/wordwright.sqlite`; the old
  `lfwa.sqlite` is no longer used and can go.
- **"Cannot start: … is from an early development version"**: your `apps/api/data/wordwright.sqlite` predates
  schema versioning. If you don't need it, move or delete it (and its `-wal`/`-shm` files) and restart.
- **Console full of `http proxy error … ECONNREFUSED`**: the API isn't running. Look at the `apps/api`
  lines at the top of the `pnpm dev` output for the reason; the web app shows "We can't reach the
  server" until it's back.

## Scripts

| Command         | What it does                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`    | Format check, lint, typecheck, unit/component/API tests (what CI runs first)                                                                                                                                                      |
| `pnpm test`     | Vitest in every package                                                                                                                                                                                                           |
| `pnpm test:e2e` | Playwright against the web app + API (real SQLite file, fake LLM); fails on any uncaught exception, `console.error`, failed request or 5xx in the browser (`pnpm --filter @wordwright/web exec playwright install chromium` once) |
| `pnpm build`    | Typecheck and production-build everything                                                                                                                                                                                         |

## Architecture: pluggable external services

Application code depends on **ports** in `packages/core/src/providers`, never on a vendor SDK:

- `LLMProvider` — `complete()` and `stream()` for single prompts, and `chat()` for conversations in which the model may
  call tools (streamed `text` / `tool_call` / `done` events; no sampling options), and `listModels()`, the models the
  key can use (it spends no tokens, so it also checks the key). Adapters: `AnthropicProvider`,
  `FakeLLMProvider` (scriptable). The contract suite can also be run against the real service:
  `ANTHROPIC_API_KEY=... pnpm --filter @wordwright/core test`.
- `SearchProvider` — for news, web and scholarly sources (Crossref, OpenAlex, ...). Only a fake exists so far.

**Prompts** (the instructions given to the AI) are not in code: they are Markdown files in [`prompts/`](prompts/README.md).

To add a service: implement the interface, run the shared contract suite from
`@wordwright/core/testing` against it (see `packages/core/src/providers.test.ts`), then register it where
`apps/api/src/server.ts` builds `Providers`. `createApp()` takes its dependencies as arguments, so
tests inject fakes and nothing hits the network.

## Accounts and sign-in

- **Model:** a user has any number of _publications_; ideas belong to a publication, and every draft belongs to an idea. Publications are shared by
  adding members (`owner` or `member`; a publication can have several owners, never none: see "Account deletion semantics" in `docs/decisions.md`). Registering does not create a publication: Home opens with a two-step checklist (01 create a publication, 02 connect an AI key) in either order, which disappears once both are done.
- **A publication is a place you publish** (a Substack, a blog, a magazine, a newsletter): each has a name, an optional website, and an
  optional picture (a coloured monogram is drawn when there isn't one). The home page lists them;
  `/publications/new` creates one; `/p/<id>` is its landing page, an overview that opens with its description (clamped, with Show more) then a Quick add panel (new idea, note, something to read), then its newest feed posts, the first items on its reading list, its latest notes and its ideas (see _Navigation_ below for its steps);
  `/p/<id>/settings` edits it, shares it and deletes it. A publication also has a **description** (stored as Markdown, up to 5000 characters, but written in a small rich-text editor with bold, italic, lists and links, so nobody needs to know Markdown: what the publication is, who reads it, what kinds of writing go there), which anyone who shares the publication can edit (`PUT /api/publications/:id/description`); the name and website stay the owner's. The writer always writes it themselves: it is the **Description** page in the publication's settings (`/p/<id>/settings/description`, also reached from the publication page's "Describe this publication" step; `/p/<id>/describe` redirects there), a box with a link to a help page (`/help/description`) on what a description needs to say to be useful to your AI. Nothing drafts a description with AI any more (#150).
- **Ideas** (`/p/<id>/ideas/new`; an idea is five steps at `/p/<id>/ideas/<idea>/…`, below): something to write about, which doesn't need an
  external source. An idea has a name ("What's your core idea?"), free-form notes, links to related work (up to
  50; see below), and one or more drafts: one for a single post, several (kept in the order they were
  added) for a linked set of posts. Anyone a publication is shared with can work on its ideas. Deleting an idea
  deletes its links and drafts. API:
  `/api/publications/:id/ideas` (list, create), `/:idea` (get, patch, delete), `/:idea/links`, `/:idea/drafts`.
  **Home:** `GET /api/drafts/recent` answers the (up to three) drafts the signed-in person edits, newest first, in publications they still belong to (draft, idea and publication names and ids), for Home's **Pick up**; not available to reviewer-only accounts. **Quick add** on Home uses the existing create-idea, publication notes and publication reading endpoints.
  **Reading list (the idea's links):** the person types only a web address (scheme optional). Text that isn't a plausible
  address is refused ("rubbish" is, "example.org" is not), as is a site whose name doesn't exist, or the same page
  twice (`http`/`https`, `www.`, a trailing slash or `#fragment` don't make a page different). The server looks the
  page's title up and lists the link by it, or by its address when there is none. A link can be edited later (address
  and title; clearing the title looks it up again), and ticked off as read (`PUT /:idea/links/:link/read`, `{read}`); each
  item also records where it came from (`entered`, `brainstorm` or `research`, so AI-suggested pages are visibly marked; `idea_generation` is for later). A note can be
  taken from an item (`POST /:idea/notes` with `readingItemId`: origin `reading`; add `quote: true` for a direct quotation, which can't be edited and goes into a draft as a blockquote); each item has a **Take notes** page (`/p/:publication/ideas/:idea/reading/:item`) that opens the page in a new tab and keeps a notes box beside it. Each item also has `authors` (names; found on the page with the title, editable via `PATCH …/links/:link` with `authors`). The lookup goes through the `PageInfoFetcher` port
  (`PAGE_FETCHER=http` or `fake`); see `docs/decisions.md` for how it avoids reaching private networks.
  **Moving reading items:** on any reading list, **Move items** lets you tick items and choose **Move to** the publication's
  reading list, another idea, or (from the publication's list) a new idea named in your own words. The items go with the
  notes taken from them and keep whether they are read; the page says what moved ("Moved 2 items and 5 notes to
  “Rivers”.") with an **Undo**, except when items were joined to ones already there, which can't be unpicked.
  **Moving notes:** on the publication's Notes, or an idea's, **Move notes** lets you tick notes (quotations too; **Select all the
  notes shown** follows the tag being shown) and choose **Move to** another idea, the publication's own notes (from an
  idea), or **a new idea named in your own words**. Before you confirm, the page says how many notes will move and
  that the pages they were taken from are copied to the destination's reading list (the originals stay); a tick
  offers to bring the other notes taken from those pages too. Notes are moved, not copied, in the order you arranged
  them, with their tags and quotation marks. **Undo** moves them back (to the end of where they were).
  **Between publications:** someone who belongs to more than one publication also gets **Another publication…** in **Move
  to** (reading items and notes alike): choose the publication, then its own list, one of its ideas or a new idea there.
  Any member of both may do it; one who isn't a member of the destination gets "Not found". Everything above carries over
  (items with the same address are joined, a note's source is copied, the limits apply to the destination), and **Undo**
  works while you belong to both (`to: { ideaId, publicationId }` on `POST /api/publications/:id/move/…`).
  **Moving ideas:** on the **Ideas** page, tick ideas and choose **Move to…** a publication of yours (offered only if you have
  another). The page says how many ideas, drafts, notes and links will move and who will lose sight of them, before you confirm.
  An idea moves whole, with its drafts and everything on them; an owner of the publication it is in must do it if it has
  drafts, and each draft's editor must belong to the destination (`POST /api/publications/:id/move/ideas`, with
  `…/ideas/preview` to check first). See `docs/decisions.md`.
  **Read items are hidden by default** on every reading list (an idea's and the publication's), with a **Show read items**
  tick (and how many are hidden); one marked read during the visit stays in view until the list is shown again, so it
  can be unticked. The choice is for the visit, not saved.
  **Linking to the reading list while drafting:** the drawer's Reading list inserts a link to an item; if it isn't marked
  read the writer is asked to read it (in a new tab), mark it read, or cancel. Notes taken from an item don't ask.
  **Dragging notes into a draft:** the drafting side bar's notes can be dragged by their grip onto the draft, landing where
  they are dropped (the _Add to draft_ button does the same at the cursor).
  **The publication's own reading list and notes** have their own places: the reading list is the publication's
  **Read** step (`/p/<id>/read`; the old `/p/<id>/reading` and `/p/<id>/inspiration#reading-list` lead there; each item opens its own reading page at
  `/p/<id>/reading/<item>`) and **Notes** is its third step (`/p/<id>/notes`). The idea's reading list is separate from the publication's. They are the idea's screens with a different owner (reading list, reading page, notes with
  reorder, merge, split, tags and hold-to-delete), and a note says which item it came from. Nothing on them can be
  drafted from: notes go into an idea first (T37d). The API: items and notes can belong to a
  publication as a whole, to be gathered before there is an idea. `GET/POST /api/publications/:id/reading`, `PATCH|DELETE
…/reading/:item`, `PUT …/reading/:item/read` mirror an idea's links (answering with the list), and
  `/api/publications/:id/notes` (with `/order`, `/merge`, `/:note/split`, `/:note/tags`) mirrors an idea's notes, without
  "added to a draft". **Moving:** `POST /api/publications/:id/move/reading` and `…/move/notes`, each `{ids, to: {ideaId}}`
  (`ideaId: null` is the publication itself), answer `{batchId, readingItems, merged, copied, notes}`; all or nothing.
  **Merging and splitting notes:** `POST /api/publications/:id/ideas/:idea/notes/merge` (`{ids}`) joins notes of the same
  origin into the first; `POST …/notes/:note/split` (`{before, after}`) cuts one in two. Both answer with all the notes.
  **Tags on notes:** `PUT /api/publications/:id/ideas/:idea/notes/:note/tags` (`{tags}`) replaces a note's flat tags; the notes
  list and the drafting drawer can show only one tag's notes.
  **Notes while drafting:** the drafting page lists the idea's notes beside the editor (a slide-over on a phone);
  `POST /api/publications/:id/drafts/:draft/insertions` (`{noteId, text}`) records that a note's words were put into the
  draft (origin and source come from the note) and sets the note aside, `GET` lists them, and
  `PUT …/ideas/:idea/notes/:note/added` (`{added}`) puts a note back.
  **Every draft belongs to an idea**: there is no standalone "new draft"; the publication page lists ideas, and drafts
  are added from an idea. A draft is opened, saved and deleted by id at `/api/publications/:id/drafts/:draft`
  (`/p/<id>/drafts/<draft>` in the app), which links back to its idea's Draft step.
  **Each draft has one editor** (#154): the member responsible for its title and body, its creator at first
  (`editorId`, `editorName`). Only the editor can save (`PUT` needs the `version` it was made from; a stale one is
  refused with 409 and never merged, which also covers the same person in two tabs), add notes or links to the
  draft, resolve comments, or ask for a critique (403 before anything is sent or counted). Other
  members read it, with a banner naming the editor, and see changes on reload or when the window regains focus.
  Notes stay open to every member. When
  the editor leaves, is removed or deletes their account, their drafts go to the publication's longest-standing owner.
  **Reviews** (#157, #158): the editor **sends the draft for review** (`POST …/drafts/:draft/send-for-review`,
  `{emails, memberIds}`), which freezes its title and body as a **snapshot**; everyone asked reviews that copy, not later
  edits, and the dialog says so (sending again makes a new copy). People by email get a 7-day link (`/review-invite`)
  bound to that address, with the same quiet `202`, throttles and blocks as publication invitations; a new person makes a
  **reviewer-only account** with just a name and password (no username, no publication) and lands on the review itself, and every route outside
  `/reviews/*` (plus `/auth/me`, sign-out, accepting an invitation and deleting the account) answers 404. Members of the
  publication can be asked directly and find the review on their home page. A review is _open_, _ended_ (the reviewer
  pressed **End review**: the editor is emailed once, "X has finished reviewing Y and left N comments") or _closed_
  (the editor or an owner stopped accepting, `DELETE …/reviewers/:review` or `POST …/reviewers/close`); the last two are
  read-only but still show the snapshot and the reviewer's own comments. The editor sees each reviewer's state and comment
  count (`GET …/reviewers`) and their comments, placed on the live draft where the passage still exists. **Start writing**
  (`POST /reviews/start-writing`) or an invitation to a publication makes a reviewer-only account a full one.
  **What is waiting on you** (#159): `GET /api/publications/:id/attention` feeds a block at the top of the publication's landing
  page: a draft offered to you (Accept / Decline there), your own offer still waiting (Withdraw), and for drafts you edit
  how each copy sent for review stands, flagged when every review is over, some finished and comments are unresolved.
  Nothing is shown when nothing waits, and nothing is emailed or counted elsewhere.
  **Handover** (#155), on the draft page itself (`/api/publications/:id/drafts/:draft/handover`): the editor **offers** the
  draft to a named member (`POST …/offer`, one open offer per draft); they stay editor, and can keep writing, until the
  member **accepts** (`…/offer/accept`) or **declines**; the editor can **withdraw** (`DELETE …/offer`). Any other
  member can **ask** (`POST …/asks`), which only shows the editor a request to offer or set aside. An owner can
  **reassign** (`POST …/reassign`) without the editor. Only an offer sends an email (to the offered member, with a link
  to the draft; 20 a day per editor); nothing else does. Everything is kept as a history, showing "Reassigned by Jo"
  and the like, and "Passed to Ada when the previous editor left" for the system's own moves; names follow the
  keep-my-name choice at account deletion. Leaving, removal and account deletion
  also close what the person had open before their drafts pass to an owner.
  **Comments** (#156): any member can comment on any draft, about one paragraph or the whole draft
  (`POST …/drafts/:draft/comments`, `{block, text}`; the server finds the paragraph and keeps its hash and start). The
  AI's critique points are the same kind of comment (`byAi`). `GET …/comments` is independent review: the editor gets
  every comment, resolved ones included, each with its author; everyone else gets only their own open ones
  (`visibleComments` in `services/comments.ts` is the one place that decides, and the critique route likewise tells
  non-editors nothing, not even how many looks are used). Only the editor resolves (`PUT …/comments/:id`,
  `{resolved}`): the comment is hidden, never deleted, and the editor can show it again. A comment carries words about
  the writing and no replacement text, has no cap, does not count against the critique looks, and is never sent to the AI.
  A commenter's name stays after they leave the publication, and after they delete their account if they chose to keep it.
- **Handles and publication ids:** every user has a unique `handle` (letters and digits only), shown to people as their
  _username_. They choose it when they sign up, and the form checks it against everyone else's as they
  type (`GET /api/auth/handle-available`; the server checks again on submit). Sign-ups through an external
  identity provider have no form to choose it on, so they get one derived from their name, e.g. `jenit`, and the
  landing page asks once whether they'd like another or want to keep it. Anyone can change theirs on the Your details page
  (`PUT /api/account/handle`, up to 5 changes a day). Publications already created keep their address; new ones use the
  new username. The old one is kept for its owner: nobody else can take it, but they can switch back. A few names
  that look like the service itself (`admin`, `support`...) are reserved. A publication's id is `<creator's handle>-<slug of its name>`, such as
  `jenit-substack`; if that's taken by the same person a number is added (`jenit-substack-2`). Renaming a
  publication renames its id too; the old id permanently redirects to the new one, so shared links keep working. Two people can each have a
  `substack` because their handles differ.
- **Sign-up and first steps:** the form asks "What should we call you?" (`autocomplete="given-name"`, so
  browsers fill in a first name rather than a full one), a username, an email and a password. The landing
  page shows step-by-step instructions for getting an Anthropic API key, with a field to paste it into, until
  a key is saved (new users have to do this before the AI features work); a new user with no publication is also
  prompted to create one.
- **Your name:** the name from sign-up is what other people see on notes, brainstorm messages, member lists and
  invitations. It can be changed on the Your details page (`PUT /api/account/name`) and changes everywhere at once, since
  nothing stores a copy; emails already sent keep the old one.
- **Publication pictures:** PNG, JPEG, WebP or GIF, up to 1 MB, stored in the database and served from
  `/api/publications/:id/image` to members only. The type is decided by the file's bytes (not what the browser
  claims); SVG is refused because it can carry script. The browser first shrinks a PNG, JPEG or WebP over 1 MB or
  512px on its longest side (so a phone photo works as it is); GIFs are not touched, and the server's limits don't change. Each person can own up to 25 publications.
- **Feeds**: each publication keeps a list of RSS/Atom feeds (up to 50), managed on the **Feeds** page of the publication's
  settings (`/p/<id>/settings/feeds`) by any member: paste a feed link, or the address of a site that has one, and the server reads
  it to show the feed's title, description and picture (its own logo, else the site's icon). They are listed alphabetically
  (there is no order to keep); remove one. **Search** (`/p/<id>/search`; the old `/p/<id>/inspiration` leads there) shows their
  posts, and offers "Set up feeds →" while there are none and "Manage feeds" after. Addresses are tidied (https assumed,
  `#fragment` dropped) and duplicates refused. A person can add 30 sources an hour, since each one makes the
  server fetch pages. The fetch refuses private-network addresses and bounds time (10 s) and size (3 MB).
  At the top of the Search page, **Recent posts** is one list of the newest posts from all the feeds, newest
  first, each with its feed's logo and name, for the last week, month (the default), 3 months or year: so a blog that
  posts twice a year doesn't clutter it. It shows five posts at a time (Previous / Next above and below the list; the bottom ones scroll back to the top) out of at most 100, counts posts that carry no date (they can't be
  placed in time), names feeds it couldn't read, and has a "Check for new posts" button.
  Each post has **Add** and **Ignore** (as in the research review): Add puts it on the publication's reading list
  (marked "From a feed"; `POST …/sources/recent/add`, `…/ignore`, `…/reconsider`, each `{posts: [{sourceId, postId}]}`);
  an ignored post stays in the list, marked, and **Reconsider** takes either back. A post that has been added or
  ignored moves to the **end** of the list (the latest decision last), so the posts still waiting stay together at
  the top, in date order. A post is "on a reading list" if it
  is on any of the publication's lists, however it got there. The reading list is on the same page, below the posts. **The publication's own reading list has no maximum** (an idea's keeps 50), but an item
  that isn't ticked **Keep** is dropped, silently, a month after it was put on that list (`PUT
/api/publications/:id/reading/:item/kept` `{kept}`); one that notes were taken from is never dropped, and moving an
  item onto the publication starts its month again.
  Each feed also has its own **Recent posts** preview (opened on request): the latest posts as the feed lists them (title,
  link, authors, date, and a short plain-text start of the summary; never the article). The server keeps each read for 3
  hours, asks again with `ETag`/`If-Modified-Since` so an unchanged feed costs little, leaves a feed that failed
  alone for 30 minutes, and shows when it last worked and why it stopped. Reads are capped at 120 an hour per person.
  Nothing yet turns these posts into ideas; that is the "Add to reading list" page (T6c).
  If a pasted website offers several feeds, the person is shown them (posts first, feeds of comments last and
  labelled, at most 10) and ticks which to add; `POST` then answers `200 {choices}` instead of `201`.
  API: `GET/POST /api/publications/:id/sources`, `GET .../sources/:sourceId/icon`, `GET .../sources/recent[?days=30&refresh=true]`, `GET .../sources/:sourceId/items[?refresh=true]`,
  `DELETE .../sources/:sourceId`. `FAKE_FEEDS=true` (development/e2e only) makes every
  `*.example` address a feed instead of using the network.
- **Sessions:** random token in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 is stored
  server-side. 30-day expiry. Cross-origin writes are rejected by an `Origin` check.
- **Devices** (Sign-in and security page, #165): each session keeps a
  coarse label from the User-Agent ("Safari on macOS", else "Unknown device"; picked from a fixed list of words, so
  nothing the browser sends is stored or shown back) and when it was last used (rewritten at most once an hour).
  **No IP address, no location, no raw User-Agent.** Each is named on the page by its own random id, never the cookie or
  its hash. API (all need sign-in, and reviewer-only accounts get 404 as for the rest of the page):
  `GET /api/account/sessions` (the one asking has `current: true`), `DELETE /api/account/sessions/:id` (another
  device; your current session is refused with 400, a stranger's id is 404), `DELETE /api/account/sessions` (every
  session but this one; answers `{ count }`). Changing or resetting a password ends the others (a reset ends all);
  changing the email address does not.
- **Passwords:** scrypt (`node:crypto`), 8-128 characters. Reset links are single-use, expire after
  an hour, and signing in elsewhere is revoked when a password changes. Responses never reveal whether
  an address has an account (except at registration, which has to say so), and that includes
  inviting someone to a publication.
- **Changing your password** (Sign-in and security page) needs the current one, signs out every _other_ device, cancels any
  reset link already out, and emails a "your password was changed" notice with a link to reset if it wasn't
  you. Google-only accounts can **add** a password: instead of typing one on the page, they're emailed a link
  (the reset flow), so a hijacked session alone can't add a password and keep access.
- **Changing your email** (Your details page) needs the password. We email a link to the _new_ address and switch
  only when it's opened (24 hours, newest request wins), so a typo can't lock anyone out. The new address
  counts as confirmed, the old one gets a "your email was changed" notice, and confirmation links, reset links
  and invitations addressed to the old address stop working. Changing or resetting the password cancels a
  pending change. Accounts with no password (Google-only) add one first. The notice to the old address has a
  **"this wasn't me"** link (7 days, while the account still has the address it moved to): on a button press it
  restores the old address, signs out every device and emails a password-reset link there.
- **Login with Google:** OpenID Connect code flow with PKCE, state and nonce, ID-token signature
  verified with `jose`. Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and register
  `${PUBLIC_URL}/api/auth/oauth/google/callback` as the redirect URI. Other OIDC providers are a few
  lines of config (`OidcProvider`); others implement `IdentityProvider`.
- **Sharing is by invitation.** An owner (with a confirmed address) enters an email; we send a link valid
  for 7 days that works whether or not the person has an account yet. The invitee signs in or signs up with
  _that_ address (a new person is joined as soon as they have; someone already signed in sees a Join button, and the
  sign-in link carries `join=1` so the page knows which). Nobody is ever added without opening the link, the owner's reply is identical
  whether or not the address has an account or is already in (so it can't be used to look people up), and
  accepting from the emailed link also confirms the invitee's address. Owners see pending invitations and can
  resend or revoke them, and make members owners (or remove other owners, or step down) from the people list on
  the publication's Sharing page (the page says what members and owners can do behind info icons beside the People and Invitations headings, from the wording in
  `apps/web/src/lib/publication-roles.ts`; invitees always join as members; every row of both lists is the shared `RowList`); each person can send 20 a day since every one emails a stranger, and any one address
  receives at most 5 a day from everyone together.
- **Declining and blocking invitations:** every invitation email links to a page where the invitee (signed in or
  not) can decline and, optionally, stop invitations from that sender or from everyone. The sender is never
  told: a declined invitation just stops being pending, and later invitations from a blocked sender (or any
  invitation to an address that blocks everyone) are dropped with the same reply as always. Confirmed accounts
  see and lift their blocks under "Invitations" on the Sign-in and security page; blocks follow the person if they
  change their email.
- **Email confirmation:** new local accounts are _unconfirmed_; signup emails a link (valid 24 hours, newest
  link only, harmless to open twice). Unconfirmed people can write and use AI features, but **can't invite
  others**. A banner offers "Resend" (3 per hour). Confirmation also happens when someone signs in with
  Google, resets their password via the emailed link, or accepts an invitation sent to that address, since
  each proves ownership of it.
- **Abandoned signups are cleaned up.** Every 6 hours the server deletes accounts that never confirmed their
  email, are older than `UNCONFIRMED_ACCOUNT_TTL_DAYS` (default 14; 0 turns it off) and show no sign of use:
  no drafts or ideas, no saved API key, nobody else in their publications. That frees addresses taken by typos. The signup
  email says so, and one reminder (with a fresh confirmation link) is sent 3 days before deletion. The same pass removes expired sessions, used/expired links and old invitations. It logs
  counts only, never who.
- **Exporting your writing** (#167): the Download your writing page (all your publications, `GET /api/account/export`) and each publication's
  settings (`GET /api/publications/:id/export`) download a zip of Markdown only: a README, then per publication a file for the
  publication, one per idea (notes, reading list, links to drafts) and one per draft. Owners get every draft, members
  the drafts they edit or started; notes and reading items are everyone's, with names. Comments, reviews, brainstorm
  chats, API keys and email addresses are never included. Built on request, throttled to 5 an hour per person; see
  `docs/decisions.md`.
- **Deleting an account** needs the account's password (`password` in `DELETE /api/account`; a wrong or missing one
  answers 403). An account that signs in only with Google must add a password first, as changing an email does, and the
  request answers 4xx saying so. It removes the user, credentials, sessions and memberships, and every publication
  (with its drafts) where they are the only member. In shared publications they are removed and drafts they wrote
  there stay; the only owner of a shared publication must first make someone else an owner (or delete the publication),
  and the request answers 409 until they do. The page asks
  whether to **keep their name** on their notes, brainstorming messages, research runs and draft insertions in
  publications that continue (the default; `keepName` in `DELETE /api/account`) or show them as "a former member".
  Only the display name is copied (into `kept_name` columns, at deletion; never the email or username), and
  choosing not to leaves no trace of it on any row. Leaving or being removed from a publication keeps the name anyway.
- **Email:** see below.

## Email

Emails (password reset, address confirmation, invitations) go through the `Mailer` port, chosen by `MAIL_TRANSPORT`:

| Transport           | Use                                 | Setup                                                                                                    |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `console` (default) | local development                   | none: the email, link included, is printed in the `apps/api` output                                      |
| `file`              | e2e tests, or reading mail as files | `MAIL_OUTBOX_DIR` (each email becomes a JSON file)                                                       |
| `smtp`              | production                          | `SMTP_URL` + `MAIL_FROM`; works with any provider that offers SMTP (Resend, Postmark, SES, Mailgun, ...) |

To see real-looking mail locally without sending anything, run a catcher such as
[Mailpit](https://mailpit.axllent.org/) and set `MAIL_TRANSPORT=smtp SMTP_URL=smtp://localhost:1025`.
Production refuses to start unless it's `smtp` with a `MAIL_FROM`. At startup the API checks it can reach
the SMTP server and logs a warning if not. Emails are sent _after_ the response, so the forgot-password
answer is the same, and just as fast, whether or not the address has an account; delivery failures are
logged (user id and error code only, never the link).

## Bring your own LLM key

There is deliberately **no server-wide LLM key**: each user saves their own Anthropic API key under
_Account → AI assistant_, so usage is billed to them. Keys are checked with a 1-token call before
being saved, encrypted with AES-256-GCM (bound to the user, so a copied ciphertext won't decrypt for
anyone else), shown back only with its middle left out, as `sk-ant-api03-AbC...1234` (cut where Anthropic's console cuts it, plus the last four; worked out when asked, not stored), and deleted with the account. Requests in a shared publication
run on the _requester's_ key.

- `KEY_ENCRYPTION_SECRET` (32+ chars, required in production) encrypts the keys. **Back it up**: if it's
  lost, every stored key is unreadable and users must re-enter theirs. Ciphertexts carry a `v1` prefix
  so rotation can be added later; there is no rotation tooling yet.
- `FAKE_LLM=true` swaps in a canned fake that accepts any key (development and e2e only; refused in
  production).
- To add a provider: extend `LLM_PROVIDER_IDS` and `DEFAULT_LLM_MODEL` in `packages/core/src/domain.ts`, add an
  adapter implementing `LLMProvider` (translating credential failures to `LLMAuthError`), and a case
  in `apps/api/src/llm-factory.ts`.
- **Models are discovered, not listed here.** `GET /api/llm/models` asks the provider which models the saved key can
  use (throttled; 409 without a key): the newest in each model line, plus the one already saved if it is still
  supported (deprecated and retired models are left out). `PUT /api/llm` checks a new key the same way and refuses a `model` that isn't in
  the list; leave `model` out to keep the current one (a first key gets `DEFAULT_LLM_MODEL` if offered, else the
  first model the provider lists).

**Brainstorming prompt:** the instructions that make the AI a writing coach when you brainstorm an
idea are the Markdown file `prompts/brainstorm-default.md`; the app adds its own fixed rules after it
(`prompts/brainstorm-rules.md`). The same for everyone: it is not editable (#205).

**Brainstorming API** (design: [docs/brainstorming.md](docs/brainstorming.md)): `/api/publications/:id/ideas/:idea/conversation`
holds one thread per idea, shared by the publication's members. `GET` reads it; `POST /messages` (`{text}`, `{start:true}` or
`{retry:true}`) streams the AI's reply as server-sent events; `POST /proposals/:id/accept` and `/dismiss` decide the
AI's suggestions (a new title for the idea, a new idea, or a page for the idea's reading list that the writer gave it: it can never touch drafts); the points the writer makes are recorded as notes at once (`add_note`); `DELETE` starts
again. Each message is sent with its sender's own key, model and prompt. Nothing the AI suggests is applied until a
person accepts it, except the notes it records. The page is `/p/<publication>/ideas/<idea>/refine` (the idea's **Refine** step: visiting it spends nothing; **Start brainstorming** begins): the editor's reply
streams in word by word (read with `fetch`, so **Stop** works), its Markdown is rendered safely (HTML and images are
never shown), and each notes recorded is listed under the reply and each suggestion is a card. With
`FAKE_LLM=true` the editor is scripted: it opens with a question, and answers "suggest a title", "note that …" and
"suggest a new idea" with the matching call, and "suggest some reading" with a reading-list suggestion.

**Research** (the AI adds to the reading list; decision in [docs/decisions.md](docs/decisions.md)): the Research step's **Start research**
button opens `/p/<publication>/ideas/<idea>/research/find`, a page apart from brainstorming that lists the idea's earlier research and takes
a new request, a description of the areas to look into. `GET`/`POST /api/publications/:id/ideas/:idea/research` (`{areas}`) list and run
it with the person's own key; each run is saved with the pages it found, and `POST …/research/:run/add`, `/dismiss` and
`/reconsider` (`{itemIds}`) add pages to the reading list, ignore them, or take either back (reconsidering an added page removes it from the
reading list); `DELETE …/research/:run` forgets a run. The search
looks for several points of view. It works through the `ResearchProvider` port (`@wordwright/core`: `AnthropicResearchProvider`,
`FakeResearchProvider`, and `researchProviderContract` in `@wordwright/core/testing` for any new one), which may only return addresses that
appeared in a search result. Web search must be enabled for the Anthropic account whose key is used. The server looks at each address
with the same SSRF-safe page fetcher as typed links and shows the page's real title beside the search's, flagging an address that
doesn't resolve (it can't be added). Nothing joins the reading list until a person adds it; it is marked "Found by
research" and keeps the AI's reason, labelled unchecked. The brainstorm coach can also suggest a page, but only an address the writer
gave it. Searches are throttled to 10 an hour per person, with no other cap. With `FAKE_LLM=true` a search finds three scripted
pages: one fine, one with no readable title and one that doesn't exist; and the coach turns an address plus "reading list" into a suggestion.

## Notes and next steps

- **Storage:** stores in `apps/api/src/db` use `node:sqlite` with versioned migrations
  (`PRAGMA user_version`). Swap in Postgres or add an ORM (e.g. Drizzle) when you need to.
- **UI components:** Tailwind plus our own component classes ([docs/design.md](docs/design.md)); add headless primitives
  (Reka UI / shadcn-vue) when you need dialogs, menus and comboboxes, styled with the same roles.
- **Critique** returns a few ranked points, each about a numbered paragraph of the draft, and says when a draft is ready
  (the design is in [docs/decisions.md](docs/decisions.md#comment-marks-are-anchored-to-paragraphs-by-id-outside-the-prose-t9a-90-part-of-14)).
  The latest critique is kept with the draft, and its points are comments (above), marked beside the paragraphs they are about. A draft
  gets 3 critiques by default (each person can choose 1 to 5 on Your AI), counted per draft.
- **Rephrase** (`POST /api/publications/:id/assist/rephrase`, the draft's editor only) returns options for a selected passage
  or the title: `{draftId, kind: 'title'|'passage', wording, aim, earlier}` gives `{size, options}`. `earlier` holds the
  rounds already asked in this window, so the AI is told what it has offered and a later round needs a different aim.
  The server keeps nothing (the window holds the state; the record on use comes with #162). It refuses a selection that
  crosses paragraphs or is outside 5 to 150 words, an aim of fewer than 3 words, and a title for a draft under about 300
  words, before spending anything. Short wording (a title, or up to 25 words) gets 5 to 10 options, longer gets 3 to 5, and the
  AI is told to make them differ in approach. Every number is in one place, `packages/core/src/rephrase.ts`. The prompt is
  `prompts/options.md`. The round limit in a window is the critique-looks setting (Your AI page). Only the draft, wording,
  aim and publication description are sent: never notes, threads or comments.
  **The Rephrase window** (#162): in the draft editor, select words inside one paragraph and press **Rephrase**. A dialog
  shows the wording (editable), asks "What should it do?" (the Aim), and **Generate options** (saving the draft first, since
  the AI reads the saved draft) brings a list (short wording) or carousel (longer) with a **Replace wording** button on
  each; **Use this** replaces exactly the selected words, saves the draft and, if the words began as an option, records it
  (`POST …/drafts/:id/option-insertions`, in `draft_insertions` with origin `option`, shown in the draft's "Where some of the
  words came from" list). The record is the writer's own report of what was offered, because the server keeps nothing between
  rounds. Words the writer wrote themselves leave no record. The fake LLM (`FAKE_LLM=true`) answers with numbered options.
  **Rephrase title** (#163): the button beside the title opens the same window with the title as the wording and no selection.
  It waits until the draft has at least `REPHRASE.titleMinBodyWords` (300) words and says so; **Use this** sets the title,
  saves, and records it with kind `title`. Options are short (a list of about 8, each at most 20 words).
- **Not yet built:** idea scanning, outlining, streaming critique, social posts (#164).
